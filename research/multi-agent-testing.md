# Multi-Agent Orchestration Testing Patterns

**Researched:** 2026-04-03
**Requested by:** Rajan
**Context:** A team runs multiple AI agents in separate Claude Code sessions (separate processes), coordinated via an async email-like messaging system (emcom). A central tool (pty-win) manages sessions, injects prompts, and detects idle states.

---

## Executive Summary

This research covers three areas: (1) how production multi-agent frameworks test their message bus, (2) integration testing across process boundaries, and (3) testing browser-based terminal multiplexers. Key recommendations:

- **Message bus testing**: Adapt MassTransit's saga state machine test harness pattern for emcom's message lifecycle (unread -> pending -> handled). Use property-based testing (fast-check) to fuzz state transitions and Temporal-style time-skipping for timeout testing.
- **Cross-process integration testing**: Use Pact-style contract testing between orchestrator (pty-win) and agents. Use pexpect-style PTY interaction for prompt injection verification. Synthetic transaction patterns from microservices are directly applicable.
- **Terminal multiplexer testing**: Follow xterm.js's two-tier approach (Mocha unit + Playwright integration). Microsoft's tui-test framework is the closest match to pty-win's architecture and should be studied as a reference implementation.

---

## Part 1: Message Bus Testing for Multi-Agent Systems

### 1.1 How Production Frameworks Test Agent-to-Agent Messaging

#### AutoGen / AG2

AutoGen v0.4 (now called AG2) uses a **GroupChat** pattern where agents interact through multi-turn conversations. Their test approach uses ConversableAgent instances with custom reply functions that assert on message content:

```python
# AG2 GroupChat test pattern (from AG2 docs)
# Source: https://docs.ag2.ai/latest/docs/api-reference/autogen/GroupChat/
from autogen import ConversableAgent, GroupChat, GroupChatManager

def print_messages(recipient, messages, sender, config):
    """Custom reply function that asserts on messages for testing."""
    print(f"Sender: {sender.name}, Recipient: {recipient.name}")
    # Assert last speaker's name appears in message
    assert sender.name in messages[-1]["content"]
    return False, None  # don't override reply

agent_a = ConversableAgent("agent_a", ...)
agent_b = ConversableAgent("agent_b", ...)
agent_c = ConversableAgent("agent_c", ...)

# Register assertion hooks on all agents
for agent in [agent_a, agent_b, agent_c]:
    agent.register_reply([ConversableAgent], print_messages)

group_chat = GroupChat(
    agents=[agent_a, agent_b, agent_c],
    messages=[],
    max_round=6,
    speaker_selection_method="random"
)
```

AG2's v0.4 rewrite introduced an event-driven core with async-first execution and pluggable orchestration strategies. Testing focuses on verifying speaker selection, message routing, and conversation termination conditions.

Source: [AutoGen v0.4 announcement](https://www.microsoft.com/en-us/research/blog/autogen-v0-4-reimagining-the-foundation-of-agentic-ai-for-scale-extensibility-and-robustness/)

#### CrewAI

CrewAI provides **built-in testing infrastructure** via a CLI command:

```bash
crewai test -n 5 -m gpt-4o-mini
```

This runs the crew for N iterations and sends each task result to an evaluator LLM that scores performance. The internal test suite uses:

- **pytest** with parallel execution plugins
- **VCR (Video Cassette Recorder)** to record and replay HTTP interactions, eliminating real API calls and ensuring deterministic behavior
- Task outputs are evaluated individually and scored

For mocking LLMs in unit tests, the pattern is to use LangChain's `FakeListLLM` or a custom subclass:

```python
# Mock LLM pattern (from LangChain ecosystem, used by CrewAI)
# Source: https://langchain-contrib.readthedocs.io/en/latest/llms/fake.html
from langchain.llms.fake import FakeListLLM

# Predefined responses for deterministic testing
llm = FakeListLLM(responses=[
    "I'll analyze the data.",
    "The analysis is complete. Key findings: ..."
])
```

Sources:
- [CrewAI Testing docs](https://docs.crewai.com/en/concepts/testing)
- [CrewAI Testing Infrastructure (DeepWiki)](https://deepwiki.com/crewAIInc/crewAI/9.1-cli-tools)

#### LangGraph

LangGraph uses a **state graph with checkpointers** for testing. Key patterns:

```python
# LangGraph testing pattern
# Source: https://docs.langchain.com/oss/python/langgraph/test
from langgraph.graph import StateGraph
from langgraph.checkpoint.memory import MemorySaver
from unittest.mock import MagicMock, patch

# 1. Test individual nodes in isolation
compiled = graph.compile(checkpointer=MemorySaver())
result = compiled.nodes["my_node"].invoke(initial_state)
assert result["field"] == expected_value

# 2. Test full graph execution with mocked LLM
mock_llm = MagicMock()
mock_llm.invoke.return_value = AIMessage(content="test response")

with patch("my_module.llm", mock_llm):
    result = compiled.invoke(
        {"messages": [HumanMessage(content="test")]},
        config={"configurable": {"thread_id": "test-1"}}
    )

# 3. Test partial execution with interrupts
result = compiled.invoke(
    state,
    config=config,
    interrupt_after=["node_a"]
)
# Then resume from checkpoint
compiled.update_state(config, new_state, as_node="node_a")
```

The `MemorySaver` checkpointer is specifically recommended for unit testing because it runs in-memory with no external dependencies. Each test should create a fresh checkpointer instance.

Sources:
- [LangGraph Test docs](https://docs.langchain.com/oss/python/langgraph/test)
- [Unit Testing LangGraph (Medium)](https://medium.com/@anirudhsharmakr76/unit-testing-langgraph-testing-nodes-and-flow-paths-the-right-way-34c81b445cd6)
- [LangGraph Testing Tutorial](https://aiproduct.engineer/tutorials/langgraph-tutorial-testing-configuration-unit-23-exercise-9)

#### Semantic Kernel

Semantic Kernel uses `AgentGroupChat` for multi-agent orchestration with mock-friendly design:

```csharp
// Semantic Kernel agent group chat testing
// Source: https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-chat
var mockPlugin = new Mock<IOrderPlugin>();
kernel.Plugins.Add(mockPlugin.Object);

var agent = new ChatCompletionAgent
{
    Name = "TestAgent",
    Instructions = "You are a test agent",
    Kernel = kernel
};

var chat = new AgentGroupChat(agent1, agent2)
{
    ExecutionSettings = new()
    {
        TerminationStrategy = new MaxTurnsTerminationStrategy(5),
        SelectionStrategy = new RoundRobinSelectionStrategy()
    }
};

// Invoke and verify message flow
await foreach (var message in chat.InvokeAsync())
{
    Assert.NotNull(message.Content);
}
```

Source: [Semantic Kernel Agent Chat docs](https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-chat)

### 1.2 Patterns for Testing Message Delivery, Ordering, and State Transitions

#### MassTransit Saga State Machine (Gold Standard for Message Lifecycle Testing)

MassTransit provides the most mature test harness for testing message state machines with lifecycle transitions -- directly analogous to emcom's `unread -> pending -> handled` pattern. This is the single most relevant framework for the team's use case.

```csharp
// MassTransit saga state machine test
// Source: https://masstransit.io/documentation/concepts/testing
using MassTransit;
using MassTransit.Testing;
using Microsoft.Extensions.DependencyInjection;

[Test]
public async Task Should_transition_to_completed_when_order_accepted()
{
    await using var provider = new ServiceCollection()
        .AddMassTransitTestHarness(x =>
        {
            x.AddSagaStateMachine<OrderStateMachine, OrderState>()
                .InMemoryRepository();
        })
        .BuildServiceProvider(true);

    var harness = provider.GetRequiredService<ITestHarness>();
    await harness.Start();

    var sagaHarness = harness
        .GetSagaStateMachineHarness<OrderStateMachine, OrderState>();

    var orderId = NewId.NextGuid();

    // Publish event that triggers saga creation
    await harness.Bus.Publish(new OrderSubmitted { OrderId = orderId });

    // Assert saga was created and consumed the message
    Assert.That(await sagaHarness.Consumed.Any<OrderSubmitted>());
    Assert.That(await sagaHarness.Created.Any(x => x.CorrelationId == orderId));

    // Verify state transition (async-safe with timeout)
    var instance = sagaHarness.Created.ContainsInState(
        orderId, sagaHarness.StateMachine, sagaHarness.StateMachine.Submitted);
    Assert.IsNotNull(instance);

    // Publish next event in lifecycle
    await harness.Bus.Publish(new OrderAccepted { OrderId = orderId });

    // Verify transition to final state
    var exists = await sagaHarness.Exists(orderId, x => x.Completed);
    Assert.IsNotNull(exists);
}
```

**Key insight for emcom**: MassTransit's `sagaHarness.Exists(id, x => x.StateName)` is an async method that retries until the saga reaches the desired state or times out. This pattern handles the inherent race conditions in async message processing. The emcom test harness should adopt a similar "poll-until-state" assertion pattern.

Sources:
- [MassTransit Testing docs](https://masstransit.io/documentation/concepts/testing)
- [MassTransit Saga State Machine Testing](https://masstransit.massient.com/guides/unit-testing/saga)
- [MassTransit State Machine Requests](https://masstransit.io/documentation/configuration/sagas/requests)

#### Testing Request-Response Workflows

MassTransit sagas support request/response at the message level (not HTTP-level), directly mapping to the "coordinator sends task to worker, worker reports back, coordinator verifies" pattern:

```csharp
// Saga state machine with request/response
// Source: https://masstransit.io/documentation/configuration/sagas/requests
public class OrderStateMachine : MassTransitStateMachine<OrderState>
{
    // Declare request property
    public Request<OrderState, ValidateOrder, OrderValidated> ValidationRequest { get; set; }

    public OrderStateMachine()
    {
        // When order is submitted, send validation request
        During(Submitted,
            When(OrderSubmitted)
                .Request(ValidationRequest, x => new ValidateOrder { OrderId = x.CorrelationId })
                .TransitionTo(ValidationRequest.Pending));

        // When validation response comes back
        During(ValidationRequest.Pending,
            When(ValidationRequest.Completed)
                .TransitionTo(Validated),
            When(ValidationRequest.Faulted)
                .TransitionTo(ValidationFailed),
            When(ValidationRequest.TimeoutExpired)
                .TransitionTo(ValidationTimedOut));
    }
}
```

The request has built-in `Pending`, `Completed`, `Faulted`, and `TimeoutExpired` events -- directly analogous to emcom's message lifecycle states.

#### Temporal Workflow Testing (Time-Skipping for Timeout Testing)

Temporal provides `TestWorkflowEnvironment` with automatic time-skipping, invaluable for testing timeout scenarios without waiting:

```typescript
// Temporal time-skipping test for signal/timeout
// Source: https://docs.temporal.io/develop/typescript/testing-suite
import { TestWorkflowEnvironment } from '@temporalio/testing';

describe('OrderWorkflow', () => {
    let testEnv: TestWorkflowEnvironment;

    beforeAll(async () => {
        testEnv = await TestWorkflowEnvironment.createTimeSkipping();
    });

    it('should timeout if no response within 30 minutes', async () => {
        const handle = await testEnv.client.workflow.start(orderWorkflow, {
            taskQueue: 'test',
            workflowId: 'test-1',
        });

        // Manually skip time to trigger timeout
        await testEnv.sleep('31 minutes');

        const result = await handle.result();
        expect(result.status).toBe('timed_out');
    });

    it('should complete when signal received', async () => {
        const handle = await testEnv.client.workflow.start(orderWorkflow, {
            taskQueue: 'test',
            workflowId: 'test-2',
        });

        // Send signal (equivalent to emcom message)
        await handle.signal(approvalSignal, { approved: true });

        const result = await handle.result();
        expect(result.status).toBe('approved');
    });
});
```

**Key insight for emcom**: Time-skipping tests are essential for testing checkpoint intervals, stale message detection (>2 hours), and timeout behavior without real wall-clock waits.

Sources:
- [Temporal TypeScript Testing Suite](https://docs.temporal.io/develop/typescript/testing-suite)
- [TestWorkflowEnvironment API](https://typescript.temporal.io/api/classes/testing.TestWorkflowEnvironment)

### 1.3 Testing Message Tagging/Lifecycle State Machines

#### XState Model-Based Testing

XState's `@xstate/graph` generates exhaustive test paths from a state machine definition, ensuring every reachable state and transition is covered:

```typescript
// XState model-based testing for message lifecycle
// Source: https://stately.ai/docs/xstate-test
import { createMachine } from 'xstate';
import { createTestModel } from '@xstate/graph';

// Define the message lifecycle state machine
const messageMachine = createMachine({
    id: 'emcom-message',
    initial: 'unread',
    states: {
        unread: {
            on: {
                READ: 'pending',
                EXPIRE: 'expired'
            }
        },
        pending: {
            on: {
                HANDLE: 'handled',
                ESCALATE: 'escalated',
                EXPIRE: 'stale'
            }
        },
        handled: { type: 'final' },
        escalated: {
            on: { HANDLE: 'handled' }
        },
        stale: {
            on: {
                ACKNOWLEDGE: 'handled',
                REOPEN: 'pending'
            }
        },
        expired: { type: 'final' }
    }
});

// Generate exhaustive test paths
const model = createTestModel(messageMachine);
const testPaths = model.getShortestPaths();

// Each path = a sequence of events to test
testPaths.forEach(path => {
    it(`reaches ${path.state.value} via [${path.steps.map(s => s.event.type)}]`, async () => {
        // Execute each step against the real system
        for (const step of path.steps) {
            await step.exec();
        }
        // Verify final state
        await path.verify();
    });
});
```

This automatically generates tests for every reachable state including edge cases like `unread -> expired`, `pending -> stale -> handled`, etc.

Sources:
- [XState Testing docs](https://stately.ai/docs/testing)
- [@xstate/test docs](https://stately.ai/docs/xstate-test)

#### Property-Based Testing with fast-check

For fuzzing state machine transitions beyond what model-based testing covers:

```typescript
// Property-based testing for message state machine
// Source: pattern adapted from fast-check documentation
import fc from 'fast-check';

// Define valid commands
const readCmd = fc.constant({ type: 'READ' });
const handleCmd = fc.constant({ type: 'HANDLE' });
const escalateCmd = fc.constant({ type: 'ESCALATE' });
const expireCmd = fc.constant({ type: 'EXPIRE' });

const commands = fc.oneof(readCmd, handleCmd, escalateCmd, expireCmd);

fc.assert(
    fc.property(fc.array(commands, { minLength: 1, maxLength: 20 }), (cmds) => {
        let state = 'unread';
        for (const cmd of cmds) {
            const nextState = transition(state, cmd.type);
            // Invariant: handled and expired are absorbing states
            if (state === 'handled' || state === 'expired') {
                expect(nextState).toBe(state);
            }
            // Invariant: state is always a known value
            expect(['unread', 'pending', 'handled', 'escalated', 'stale', 'expired'])
                .toContain(nextState);
            state = nextState;
        }
    })
);
```

Source: [fast-check property-based testing](https://github.com/dubzzz/fast-check) (**unverified** -- pattern adapted from general fast-check documentation, not a specific multi-agent testing guide)

### 1.4 Microsoft Multi-Agent Reference Architecture

Microsoft's Multi-Agent Reference Architecture defines a message-driven communication model directly relevant to emcom:

- **Parallel Fan-Out**: Orchestrator dispatches commands to multiple agents simultaneously, synthesizes results within timeout
- **Chained Task Sequencing**: Sequential execution where each agent's output feeds the next
- **Correlation IDs** track workflows across agents
- **Idempotent handlers** prevent duplicate processing
- **Dead-letter queues** capture failed messages
- **Explicit sequence metadata** rather than depending on arrival order

**Testing recommendations from the architecture**:
- Monitor queue depths, processing rates, and error rates
- Implement circuit breakers for fault isolation
- Design graceful degradation when agents become unavailable

Source: [Microsoft Multi-Agent Reference Architecture - Message-Driven](https://microsoft.github.io/multi-agent-reference-architecture/docs/agents-communication/Message-Driven.html)

### 1.5 Multi-Agent Reliability Testing Patterns

From production multi-agent validation strategies:

- **Adversarial testing**: Deliberately inject failures, timing anomalies, and edge cases
- **Communication protocol testing**: Verify message formats, content structure, sequencing, and error handling
- **State tracking**: Record all state changes to enable replay of failure conditions
- **Correlation ID propagation**: Track which tasks completed, failed, or are pending
- **Idempotency verification**: Process the same message multiple times and verify identical results
- **Agent tracing**: Capture every decision, message, and state transition across all agents

Source: [Multi-Agent System Reliability (Maxim)](https://www.getmaxim.ai/articles/multi-agent-system-reliability-failure-patterns-root-causes-and-production-validation-strategies/)

---

## Part 2: Integration Testing Across Process Boundaries

### 2.1 Contract Testing with Pact

Pact is the industry standard for testing interactions between separate processes. Applied to the emcom system, each agent is a "consumer" of the emcom message format, and the emcom server is the "provider":

```javascript
// Pact consumer test for emcom message contract
// Source: https://docs.pact.io/implementation_guides/javascript/docs/consumer
const { Pact } = require('@pact-foundation/pact');

const provider = new Pact({
    consumer: 'ResearcherAgent',
    provider: 'EmcomServer',
    port: 1234
});

describe('Emcom message contract', () => {
    beforeAll(() => provider.setup());
    afterAll(() => provider.finalize());

    it('should send a message and receive confirmation', async () => {
        await provider.addInteraction({
            state: 'emcom server is running',
            uponReceiving: 'a send-message request',
            withRequest: {
                method: 'POST',
                path: '/send',
                body: {
                    to: 'blake',
                    subject: 'Research complete',
                    body: 'Findings saved to research/topic.md'
                }
            },
            willRespondWith: {
                status: 200,
                body: {
                    id: like('msg-123'),
                    status: 'delivered',
                    timestamp: like('2026-04-03T12:00:00Z')
                }
            }
        });

        const result = await emcomClient.send({
            to: 'blake',
            subject: 'Research complete',
            body: 'Findings saved to research/topic.md'
        });

        expect(result.status).toBe('delivered');
        await provider.verify();
    });
});
```

For **event-driven message passing** (closer to emcom's actual architecture), Pact supports asynchronous message contracts:

```javascript
// Pact message contract for async emcom messages
// Source: https://docs.pact.io/implementation_guides/javascript/docs/messages
const { MessageProviderPact } = require('@pact-foundation/pact');

describe('Emcom message format', () => {
    it('produces a valid emcom message', () => {
        return new MessageProviderPact({
            messageProviders: {
                'an emcom task assignment': () => ({
                    to: 'researcher',
                    from: 'blake',
                    subject: 'Research: SDK comparison',
                    tags: ['unread'],
                    timestamp: new Date().toISOString()
                })
            },
            provider: 'EmcomBroker',
            pactUrls: ['./pacts/researcher-emcom.json']
        }).verify();
    });
});
```

Sources:
- [Pact documentation](https://docs.pact.io/)
- [Pact Event Driven Systems](https://docs.pact.io/implementation_guides/javascript/docs/messages)
- [Microservices.io Contract Testing Pattern](https://microservices.io/patterns/testing/service-integration-contract-test.html)

### 2.2 Testing Prompt Injection from Orchestrator to Agent

The team's architecture has pty-win injecting prompts into agent sessions via PTY stdin. Testing this requires PTY-aware test harnesses:

#### pexpect (Python)

The most mature tool for testing interactive PTY-based processes:

```python
# Testing prompt injection and agent response
# Source: https://pexpect.readthedocs.io/en/stable/
import pexpect

def test_checkpoint_injection():
    """Verify that a pty-win checkpoint prompt reaches the agent
    and produces the expected behavior."""
    # Spawn a Claude Code session
    child = pexpect.spawn('claude', timeout=60)

    # Wait for agent to be ready (idle prompt)
    child.expect(r'\$\s*$', timeout=30)

    # Inject a pty-win checkpoint prompt
    checkpoint_prompt = (
        '[pty-win:checkpoint-light:routine:silent:skip-if-busy]\n'
        'Checkpoint: update tracker.md timestamp, commit if changes.'
    )
    child.sendline(checkpoint_prompt)

    # Verify agent acknowledges (produces output or commits)
    index = child.expect([
        'No changes to commit',      # idle case
        'committed',                  # had changes
        pexpect.TIMEOUT               # agent didn't respond
    ], timeout=120)

    assert index != 2, "Agent did not respond to checkpoint injection"
```

Source: [pexpect documentation](https://pexpect.readthedocs.io/en/stable/)

#### Microsoft tui-test (TypeScript)

For testing PTY interactions from TypeScript (closer to pty-win's own stack):

```typescript
// Testing prompt injection with tui-test
// Source: https://github.com/microsoft/tui-test
import { test, expect } from '@microsoft/tui-test';

test('agent responds to emcom injection', async ({ terminal }) => {
    // Launch agent process
    await terminal.execute('claude --session test-agent');

    // Wait for ready state
    await expect(terminal).toContainText('$');

    // Inject emcom check prompt
    terminal.write('[pty-win:emcom-inbox:normal:brief]\nCheck emcom inbox.\n');

    // Verify agent processes the injection
    await expect(terminal).toContainText('inbox', { timeout: 30000 });
});

test('agent handles malformed pty-win tag gracefully', async ({ terminal }) => {
    await terminal.execute('claude --session test-agent');
    await expect(terminal).toContainText('$');

    // Malformed tag (missing fields)
    terminal.write('[pty-win:broken]\nDo something.\n');

    // Should treat as normal priority per team standards
    await expect(terminal).not.toContainText('error', { timeout: 10000 });
});
```

Source: [Microsoft tui-test](https://github.com/microsoft/tui-test)

### 2.3 Synthetic Transactions for End-to-End Verification

Synthetic transactions simulate real workflows at regular intervals. Applied to the multi-agent system:

```typescript
// Synthetic transaction: full coordinator-worker round-trip
// Pattern from microservices testing
// Source: https://totalshiftleft.ai/blog/end-to-end-testing-strategies-microservices

interface SyntheticTransaction {
    name: string;
    interval: string;     // e.g., '5m'
    timeout: string;      // e.g., '2m'
    steps: TransactionStep[];
}

const emcomRoundTrip: SyntheticTransaction = {
    name: 'emcom-round-trip',
    interval: '15m',
    timeout: '5m',
    steps: [
        {
            action: 'send',
            params: { to: 'test-agent', subject: 'synthetic-ping', body: 'ack-requested' }
        },
        {
            action: 'wait-for-reply',
            params: { from: 'test-agent', timeout: '3m' },
            assert: (reply) => {
                expect(reply.subject).toContain('synthetic-ping');
                expect(reply.tags).toContain('handled');
            }
        },
        {
            action: 'verify-message-lifecycle',
            params: { messageId: '${steps[0].result.id}' },
            assert: (msg) => {
                // Verify full lifecycle was traversed
                expect(msg.tagHistory).toEqual(['unread', 'pending', 'handled']);
            }
        }
    ]
};
```

### 2.4 Testing Eventual Consistency in Async Workflows

When multiple agents operate concurrently, eventual consistency patterns apply:

**Poll-until-consistent assertions**:
```typescript
// Adapted from MassTransit's sagaHarness.Exists pattern
async function assertEventualState<T>(
    query: () => Promise<T | null>,
    predicate: (value: T) => boolean,
    timeout: number = 30000,
    interval: number = 500
): Promise<T> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const value = await query();
        if (value && predicate(value)) return value;
        await sleep(interval);
    }
    throw new Error(`State did not converge within ${timeout}ms`);
}

// Usage: verify agent processed the emcom message
const handledMsg = await assertEventualState(
    () => emcom.getMessage(msgId),
    (msg) => msg.tags.includes('handled'),
    60000  // 1 minute timeout for agent processing
);
```

**Property-based consistency checks** (adapted from CRDT verification patterns):
```typescript
// Verify emcom message state convergence
// Source: pattern from https://arxiv.org/abs/1707.01747
fc.assert(
    fc.asyncProperty(
        fc.array(emcomOperation(), { minLength: 2, maxLength: 10 }),
        async (operations) => {
            // Apply operations in different orders
            const result1 = await applyInOrder(operations);
            const result2 = await applyInOrder(shuffle(operations));

            // Commutative operations should converge to same state
            // (tag operations on the same message)
            expect(result1.finalState).toEqual(result2.finalState);
        }
    )
);
```

Source: [Verifying Strong Eventual Consistency](https://arxiv.org/abs/1707.01747)

### 2.5 Azure Durable Functions Orchestrator-Worker Testing

Azure Durable Functions provides an in-memory test harness for orchestrator-worker patterns that maps directly to pty-win's architecture:

```typescript
// Durable Task SDK test harness (TypeScript)
// Source: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-unit-testing
import {
    InMemoryOrchestrationBackend,
    TestOrchestrationClient,
    TestOrchestrationWorker
} from '@microsoft/durabletask-js';

describe('Agent orchestration', () => {
    it('coordinator dispatches task and receives result', async () => {
        const backend = new InMemoryOrchestrationBackend();
        const worker = new TestOrchestrationWorker(backend);
        const client = new TestOrchestrationClient(backend);

        // Register orchestrator (coordinator logic)
        worker.addOrchestrator('dispatch-research', async (ctx) => {
            const result = await ctx.callActivity('do-research', {
                topic: 'SDK comparison'
            });
            return { status: 'complete', findings: result };
        });

        // Register activity (worker logic)
        worker.addActivity('do-research', async (ctx) => {
            return 'Findings: SDK X is better than SDK Y';
        });

        await worker.start();

        // Schedule and wait for orchestration
        const id = await client.scheduleNewOrchestration('dispatch-research');
        const result = await client.waitForOrchestrationCompletion(id, 30000);

        expect(result.status).toBe('complete');
        expect(result.findings).toContain('SDK X');

        await worker.stop();
    });
});
```

Source: [Azure Durable Functions Unit Testing](https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-unit-testing)

---

## Part 3: Terminal Multiplexer Testing

### 3.1 How Similar Projects Test PTY Management

#### xterm.js (Reference Implementation)

xterm.js uses a **two-tier test architecture**:

| Tier | Framework | Scope | Config |
|------|-----------|-------|--------|
| Unit | Mocha + nyc | Individual components | Standard Node.js test runner |
| Integration | Playwright | Browser rendering, cross-browser | `out-esbuild-test/playwright/playwright.config.js` |

- Unit tests have a minimum **40% line coverage** threshold enforced via nyc (Istanbul)
- Integration tests run across **Chromium, Firefox, and WebKit** via Playwright
- Each addon has its own separate Playwright config at `addons/addon-*/out-esbuild-test/playwright.config.js`
- Known limitation: **WebGL addon does not render correctly** in Playwright with Chromium or Firefox; only WebKit works

Source: [xterm.js Development and Testing (DeepWiki)](https://deepwiki.com/xtermjs/xterm.js/8-development-and-testing)

#### Microsoft tui-test (Most Relevant to pty-win)

tui-test is the **closest analog** to pty-win's testing needs. It is a dedicated terminal testing framework built on:
- **@homebridge/node-pty-prebuilt-multiarch** for PTY management
- **@xterm/headless** for terminal output rendering
- **workerpool** for parallel test execution

Key architecture decisions:

| Feature | Implementation |
|---------|---------------|
| Test isolation | New PTY + terminal context per test, ~milliseconds overhead |
| Parallel execution | Worker processes via workerpool |
| Assertions | `terminal.getByText()`, regex matching, snapshot testing |
| Debugging | Traces stored in `tui-traces/`, replayable via `show-trace` |
| Platform support | macOS, Linux, Windows (ConPTY) |

```typescript
// tui-test example
// Source: https://github.com/microsoft/tui-test
import { test, expect } from '@microsoft/tui-test';

test.describe('Terminal application', () => {
    test('renders welcome message', async ({ terminal }) => {
        await terminal.execute('node my-app.js');
        await expect(terminal).toContainText('Welcome');
    });

    test('responds to keyboard input', async ({ terminal }) => {
        await terminal.execute('node my-app.js');
        terminal.write('q');  // send keypress
        await expect(terminal).toContainText('Goodbye');
    });

    test('snapshot matches expected output', async ({ terminal }) => {
        await terminal.execute('node my-app.js --status');
        await expect(terminal).toMatchSnapshot('status-output');
    });
});
```

**Recommendation**: tui-test should be the primary testing framework for pty-win's terminal management layer. It already solves the key problems: real PTY interaction, cross-platform support, snapshot testing, and parallel execution.

Source: [Microsoft tui-test](https://github.com/microsoft/tui-test)

#### ttyd (C-based Web Terminal)

ttyd is built on **libwebsockets** (C) and uses xterm.js as its frontend. The project does **not have a formal automated test suite** in its repository. Testing is primarily manual or relies on the underlying libraries' own test suites.

**Unverified**: The ttyd repository at https://github.com/tsl0922/ttyd does not appear to contain a `tests/` directory or CI test configuration based on the search results. This would need to be verified by examining the repository directly.

Source: [ttyd GitHub](https://github.com/tsl0922/ttyd)

#### GoTTY (Go-based Web Terminal)

GoTTY relays terminal output via WebSocket. Like ttyd, there is **no dedicated test suite visible** in the public repository.

Source: [GoTTY GitHub](https://github.com/yudai/gotty)

#### Hyper Terminal (Electron)

Hyper uses node-pty for PTY management within Electron. Testing approaches for Electron apps include:

- **Custom test drivers** using Node.js child_process API -- test suite spawns Electron process and uses IPC-over-STDIO messaging protocol
- **Spectron** (deprecated) or **Playwright for Electron** for automated UI testing
- node-pty can be rebuilt for testing: `yarn run rebuild-node-pty`

Source: [Electron Automated Testing docs](https://www.electronjs.org/docs/latest/tutorial/automated-testing)

### 3.2 Testing WebSocket Streaming of Terminal Data

#### Playwright WebSocket Interception

Playwright now has first-class WebSocket route support, ideal for testing pty-win's xterm.js <-> server WebSocket channel:

```typescript
// Testing WebSocket terminal data streaming with Playwright
// Source: https://playwright.dev/docs/api/class-websocketroute

test('terminal data streams via WebSocket', async ({ page }) => {
    const messages: string[] = [];

    // Intercept WebSocket and record messages
    await page.routeWebSocket('ws://localhost:*/ws', ws => {
        ws.onMessage(message => {
            messages.push(String(message));
        });

        // Connect to real server but intercept
        const server = ws.connectToServer();
        server.onMessage(message => {
            messages.push(`server: ${String(message)}`);
            ws.send(message);  // forward to client
        });
    });

    await page.goto('http://localhost:8080');

    // Type a command in the terminal
    await page.locator('.xterm-helper-textarea').type('echo hello\n');

    // Verify the command was sent via WebSocket
    await expect.poll(() => messages.some(m => m.includes('echo hello'))).toBe(true);

    // Verify response came back
    await expect.poll(() => messages.some(m => m.includes('hello'))).toBe(true);
});

// Mock WebSocket for offline testing
test('terminal handles WebSocket disconnect', async ({ page }) => {
    await page.routeWebSocket('ws://localhost:*/ws', ws => {
        // Accept connection then close after 1 second
        setTimeout(() => ws.close(), 1000);
    });

    await page.goto('http://localhost:8080');

    // Verify reconnection UI appears
    await expect(page.locator('.reconnect-overlay')).toBeVisible({ timeout: 5000 });
});
```

Source: [Playwright WebSocketRoute](https://playwright.dev/docs/api/class-websocketroute)

#### ws Library Direct Testing

For server-side WebSocket testing (without browser):

```typescript
// Direct WebSocket testing with ws library
// Source: https://github.com/websockets/ws
import WebSocket from 'ws';
import { createServer } from '../src/server';

describe('Terminal WebSocket server', () => {
    let server: ReturnType<typeof createServer>;
    let ws: WebSocket;

    beforeEach(async () => {
        server = await createServer({ port: 0 }); // random port
    });

    afterEach(async () => {
        ws?.close();
        await server.close();
    });

    it('streams PTY output to WebSocket client', async () => {
        const port = server.address().port;
        ws = new WebSocket(`ws://localhost:${port}/ws`);

        const messages: Buffer[] = [];
        ws.on('message', (data) => messages.push(data as Buffer));

        await new Promise(resolve => ws.on('open', resolve));

        // Send input to terminal
        ws.send(JSON.stringify({ type: 'input', data: 'echo test\r' }));

        // Wait for output
        await new Promise(resolve => setTimeout(resolve, 2000));

        const output = Buffer.concat(messages).toString();
        expect(output).toContain('test');
    });

    it('handles binary frames for terminal data', async () => {
        const port = server.address().port;
        ws = new WebSocket(`ws://localhost:${port}/ws`);

        await new Promise(resolve => ws.on('open', resolve));

        // Send binary data (ANSI escape sequences)
        const ansiData = Buffer.from('\x1b[31mred text\x1b[0m');
        ws.send(ansiData);

        // Verify server processes binary frames
        // (implementation-specific assertions)
    });
});
```

Source: [ws library](https://github.com/websockets/ws)

#### jest-websocket-mock for Unit Testing

For isolated WebSocket testing without real connections:

```typescript
// Mock WebSocket testing
// Source: https://www.npmjs.com/package/jest-websocket-mock
import WS from 'jest-websocket-mock';

describe('Terminal client WebSocket', () => {
    let mockServer: WS;

    beforeEach(async () => {
        mockServer = new WS('ws://localhost:8080/ws');
    });

    afterEach(() => {
        WS.clean();
    });

    it('sends terminal input and receives output', async () => {
        // Client connects (your app code)
        const client = new TerminalClient('ws://localhost:8080/ws');

        await mockServer.connected;

        // Client sends input
        client.sendInput('ls\r');
        await expect(mockServer).toReceiveMessage(
            expect.stringContaining('ls')
        );

        // Server sends back terminal output
        mockServer.send('file1.txt  file2.txt\r\n$ ');

        expect(client.getOutput()).toContain('file1.txt');
    });
});
```

Source: [jest-websocket-mock](https://www.npmjs.com/package/jest-websocket-mock)

### 3.3 Testing PTY Output Parsing and Prompt Injection

#### Two-Tier Strategy

Following the pattern established in previous research (research/node-pty-testing-patterns.md):

**Tier 1: Unit tests with @xterm/headless** (no real PTY)
```typescript
// Unit test: parse terminal output without real PTY
// Source: pattern from xterm.js headless usage
import { Terminal } from '@xterm/headless';

function parsePromptState(terminal: Terminal): 'idle' | 'busy' | 'unknown' {
    const buffer = terminal.buffer.active;
    const lastLine = buffer.getLine(buffer.cursorY)?.translateToString() ?? '';
    if (lastLine.match(/\$\s*$/)) return 'idle';
    if (lastLine.match(/\.\.\.\s*$/)) return 'busy';
    return 'unknown';
}

describe('Prompt state parser', () => {
    let term: Terminal;

    beforeEach(() => {
        term = new Terminal({ rows: 24, cols: 80 });
    });

    it('detects idle state from $ prompt', () => {
        term.write('user@host:~$ ');
        expect(parsePromptState(term)).toBe('idle');
    });

    it('detects busy state during command execution', () => {
        term.write('Compiling...');
        expect(parsePromptState(term)).toBe('busy');
    });
});
```

**Tier 2: Integration tests with real PTY** (using tui-test or pexpect)
```typescript
// Integration test: real PTY prompt injection
import { test, expect } from '@microsoft/tui-test';

test('pty-win prompt injection reaches agent', async ({ terminal }) => {
    await terminal.execute('bash');
    await expect(terminal).toContainText('$');

    // Simulate pty-win checkpoint injection
    terminal.write('[pty-win:checkpoint-light:routine:silent]\n');
    terminal.write('Run checkpoint.\n');

    // The agent should process this (implementation-specific assertion)
    // For bash, it would just echo the text
    await expect(terminal).toContainText('checkpoint');
});
```

### 3.4 Testing Frontend Rendering

For pty-win's browser-based frontend (xterm.js + Express):

```typescript
// Playwright E2E test for terminal frontend
// Source: adapted from xterm.js Playwright patterns
import { test, expect } from '@playwright/test';

test.describe('Terminal UI', () => {
    test('renders terminal and accepts input', async ({ page }) => {
        await page.goto('http://localhost:8080');

        // Verify xterm.js terminal is rendered
        const terminal = page.locator('.xterm');
        await expect(terminal).toBeVisible();

        // Verify terminal has focus
        const textarea = page.locator('.xterm-helper-textarea');
        await expect(textarea).toBeFocused();

        // Type a command
        await textarea.type('echo hello world');
        await textarea.press('Enter');

        // Verify output appears in terminal
        // Note: xterm.js renders to canvas, so text assertions need
        // to use the buffer API or screen reader mode
        await page.waitForTimeout(1000);

        // Use accessibility tree or terminal buffer for assertions
        const terminalText = await page.evaluate(() => {
            // Access xterm.js terminal instance
            const term = (window as any).__terminal;
            const buffer = term.buffer.active;
            const lines: string[] = [];
            for (let i = 0; i <= buffer.cursorY; i++) {
                lines.push(buffer.getLine(i)?.translateToString() ?? '');
            }
            return lines.join('\n');
        });

        expect(terminalText).toContain('hello world');
    });

    test('displays multiple terminal sessions', async ({ page }) => {
        await page.goto('http://localhost:8080');

        // Verify session tabs/panels
        const sessions = page.locator('.session-panel');
        await expect(sessions).toHaveCount(await getExpectedSessionCount());
    });

    test('handles session disconnect gracefully', async ({ page }) => {
        await page.goto('http://localhost:8080');

        // Kill the backend process for one session
        await killSession('test-session');

        // Verify disconnect indicator
        await expect(page.locator('[data-session="test-session"] .status'))
            .toHaveText('disconnected');
    });
});
```

### 3.5 End-to-End Test Patterns for Browser-Based Terminal Applications

A complete E2E test for pty-win would cover the full stack:

```
Browser (xterm.js) <-> WebSocket <-> Express server <-> node-pty <-> Agent process
```

#### Recommended Test Architecture

| Layer | Tool | What to Test |
|-------|------|-------------|
| PTY management | tui-test | Process spawn/kill, PTY resize, output streaming |
| WebSocket transport | ws + Vitest | Message framing, binary data, reconnection |
| WebSocket E2E | Playwright routeWebSocket | Full client-server round-trip |
| Terminal rendering | Playwright + @xterm/headless | Visual output, input handling, ANSI rendering |
| Prompt injection | tui-test or pexpect | Injection reaches agent, agent responds correctly |
| Full stack E2E | Playwright | Browser -> WebSocket -> PTY -> Agent -> response |
| Multi-session | Playwright | Session management, tab switching, concurrent I/O |

#### Full-Stack E2E Example

```typescript
// Full-stack E2E test for pty-win
import { test, expect } from '@playwright/test';

test('full round-trip: browser input -> PTY -> agent -> browser output', async ({ page }) => {
    // Start pty-win server with a test agent
    const server = await startPtyWin({ agents: ['test-echo-agent'] });

    try {
        await page.goto(`http://localhost:${server.port}`);

        // Wait for terminal to be ready
        const textarea = page.locator('.xterm-helper-textarea');
        await expect(textarea).toBeFocused({ timeout: 10000 });

        // Send input through the browser terminal
        await textarea.type('hello from browser\n');

        // Wait for the response to appear in terminal
        // (the echo agent should echo back the input)
        await expect(async () => {
            const text = await getTerminalText(page);
            expect(text).toContain('hello from browser');
        }).toPass({ timeout: 10000 });

    } finally {
        await server.stop();
    }
});
```

---

## Framework Recommendations

### For emcom message bus testing

| Priority | Framework | Use For |
|----------|-----------|---------|
| 1 | **Vitest + custom harness** | Adapt MassTransit's saga test harness pattern to TypeScript/Node.js for emcom message lifecycle testing |
| 2 | **@xstate/graph** | Generate exhaustive test paths for the message state machine (unread/pending/handled/stale) |
| 3 | **fast-check** | Property-based fuzzing of state transitions to find edge cases |
| 4 | **Pact** | Contract testing between emcom CLI and server |

### For cross-process integration testing

| Priority | Framework | Use For |
|----------|-----------|---------|
| 1 | **@microsoft/tui-test** | PTY interaction testing, prompt injection verification |
| 2 | **pexpect** (Python) | Cross-platform PTY test scripting (alternative to tui-test) |
| 3 | **Pact** | Contract testing for emcom message format between agents |
| 4 | **Custom synthetic transactions** | End-to-end coordinator-worker round-trip verification |

### For terminal multiplexer testing

| Priority | Framework | Use For |
|----------|-----------|---------|
| 1 | **@microsoft/tui-test** | PTY management, terminal output assertions, snapshot testing |
| 2 | **Playwright** | Browser E2E, WebSocket interception, terminal UI rendering |
| 3 | **@xterm/headless** | Unit testing terminal output parsing without a browser |
| 4 | **jest-websocket-mock** | Isolated WebSocket unit testing |
| 5 | **ws** | Server-side WebSocket integration testing |

---

## Sources

### Multi-Agent Frameworks
- [AutoGen v0.4 Announcement](https://www.microsoft.com/en-us/research/blog/autogen-v0-4-reimagining-the-foundation-of-agentic-ai-for-scale-extensibility-and-robustness/)
- [AG2 GroupChat API](https://docs.ag2.ai/latest/docs/api-reference/autogen/GroupChat/)
- [CrewAI Testing docs](https://docs.crewai.com/en/concepts/testing)
- [LangGraph Test docs](https://docs.langchain.com/oss/python/langgraph/test)
- [Semantic Kernel Agent Chat](https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-chat)
- [Microsoft Multi-Agent Reference Architecture](https://microsoft.github.io/multi-agent-reference-architecture/docs/agents-communication/Message-Driven.html)

### Message Bus & State Machine Testing
- [MassTransit Testing docs](https://masstransit.io/documentation/concepts/testing)
- [MassTransit Saga State Machine](https://masstransit.massient.com/guides/unit-testing/saga)
- [MassTransit State Machine Requests](https://masstransit.io/documentation/configuration/sagas/requests)
- [Temporal TypeScript Testing Suite](https://docs.temporal.io/develop/typescript/testing-suite)
- [Temporal Workflow Message Passing](https://docs.temporal.io/encyclopedia/workflow-message-passing)
- [XState Testing](https://stately.ai/docs/testing)
- [@xstate/test](https://stately.ai/docs/xstate-test)
- [Multi-Agent Reliability (Maxim)](https://www.getmaxim.ai/articles/multi-agent-system-reliability-failure-patterns-root-causes-and-production-validation-strategies/)

### Contract & Integration Testing
- [Pact documentation](https://docs.pact.io/)
- [Pact Event Driven Systems](https://docs.pact.io/implementation_guides/javascript/docs/messages)
- [Microservices.io Contract Testing](https://microservices.io/patterns/testing/service-integration-contract-test.html)
- [Azure Durable Functions Unit Testing](https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-unit-testing)
- [Verifying Strong Eventual Consistency (arXiv)](https://arxiv.org/abs/1707.01747)

### PTY & Terminal Testing
- [pexpect documentation](https://pexpect.readthedocs.io/en/stable/)
- [Microsoft tui-test](https://github.com/microsoft/tui-test)
- [xterm.js Development and Testing](https://deepwiki.com/xtermjs/xterm.js/8-development-and-testing)
- [xterm.js GitHub](https://github.com/xtermjs/xterm.js)
- [ttyd GitHub](https://github.com/tsl0922/ttyd)
- [GoTTY GitHub](https://github.com/yudai/gotty)
- [Electron Automated Testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing)

### WebSocket Testing
- [Playwright WebSocketRoute](https://playwright.dev/docs/api/class-websocketroute)
- [ws library](https://github.com/websockets/ws)
- [jest-websocket-mock](https://www.npmjs.com/package/jest-websocket-mock)

### Prompt & Agent Testing
- [promptfoo](https://github.com/promptfoo/promptfoo)
- [FakeListLLM (LangChain)](https://langchain-contrib.readthedocs.io/en/latest/llms/fake.html)
