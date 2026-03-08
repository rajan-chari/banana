"""
Test harness for agents with real LLM, stubbed transport.

Creates real agent instances with real system prompts and real LLM calls.
Only the agcom transport (_client) is stubbed since there's no server during tests.
"""

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

from pydantic_ai import Agent

from assistant.agcom.models import Message
from assistant.agents.base import AgentContext, AgentResponse
from assistant.agents.em import EMAgent, TaskRecord
from assistant.agents.runner import RunnerAgent
from assistant.agents.coder import CoderAgent


DEFAULT_MODEL = "openai:gpt-5.1"


def make_message(
    from_handle: str,
    body: str,
    to_handle: str = "em",
    subject: str = "Task: test",
    tags: list[str] | None = None,
    message_id: str = "msg-test-001",
    thread_id: str = "thread-test-001",
) -> Message:
    """Create a fake Message for testing."""
    return Message(
        message_id=message_id,
        thread_id=thread_id,
        from_handle=from_handle,
        to_handles=[to_handle],
        subject=subject,
        body=body,
        created_at=datetime.now(timezone.utc),
        tags=tags,
    )


def make_context(message: Message) -> AgentContext:
    """Create an AgentContext from a Message."""
    return AgentContext(
        incoming_message=message,
        conversation_thread_id=message.thread_id,
        sender_handle=message.from_handle,
        subject=message.subject,
    )


class AgentTestHarness:
    """Test harness for agents with real LLM, stubbed transport."""

    def __init__(self, model: str = DEFAULT_MODEL):
        self.model = model
        self.sent_messages: list[tuple[str, dict]] = []

    def create_em(self) -> EMAgent:
        """Create an EM agent with stubbed client."""
        em = EMAgent(model=self.model)
        self._stub_client(em)
        return em

    def create_runner(self) -> RunnerAgent:
        """Create a Runner agent with stubbed client."""
        runner = RunnerAgent(model=self.model)
        self._stub_client(runner)
        return runner

    def create_coder(self) -> CoderAgent:
        """Create a Coder agent with stubbed client."""
        coder = CoderAgent(model=self.model)
        self._stub_client(coder)
        return coder

    def seed_task(
        self,
        em: EMAgent,
        task_id: str,
        description: str,
        assigned_to: str = "coder",
        requester: str = "assistant",
    ) -> TaskRecord:
        """Pre-create a TaskRecord in EM's task tracking."""
        task = TaskRecord(
            task_id=task_id,
            description=description,
            requester=requester,
            requester_thread_id="thread-req-001",
            requester_message_id="msg-req-001",
            status="in_progress",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            assigned_to=assigned_to,
        )
        em._tasks[task_id] = task
        return task

    async def inject(
        self,
        agent,
        from_handle: str,
        body: str,
        tags: list[str] | None = None,
        subject: str = "Task: test",
        to_handle: str | None = None,
    ) -> AgentResponse | None:
        """Inject a message into an agent and return its response."""
        target = to_handle or agent.handle
        msg = make_message(
            from_handle=from_handle,
            body=body,
            to_handle=target,
            subject=subject,
            tags=tags,
        )
        ctx = make_context(msg)
        return await agent.process_message(ctx, body)

    def _stub_client(self, agent) -> None:
        """Replace _client with a mock that captures send/reply calls."""
        mock_client = MagicMock()

        # Make async methods return coroutines that capture args
        async def capture_send(**kwargs):
            self.sent_messages.append(("send_message", kwargs))
            return make_message(
                from_handle=agent.handle,
                body=kwargs.get("body", ""),
                to_handle=kwargs.get("to_handles", ["unknown"])[0],
                subject=kwargs.get("subject", ""),
                tags=kwargs.get("tags"),
            )

        async def capture_reply(**kwargs):
            self.sent_messages.append(("reply_to_message", kwargs))
            return None

        mock_client.send_message = AsyncMock(side_effect=capture_send)
        mock_client.reply_to_message = AsyncMock(side_effect=capture_reply)

        agent._client = mock_client


async def judge(response_text: str, criterion: str) -> bool:
    """LLM judge — evaluates whether a response meets a criterion.

    Uses gpt-5.1 for cheap/fast evaluation.
    Returns True if criterion is met, False otherwise.
    """
    judge_agent = Agent(
        "openai:gpt-5.1",
        system_prompt="You evaluate AI agent responses. Answer True or False only.",
        output_type=bool,
    )
    result = await judge_agent.run(
        f"Response to evaluate:\n{response_text}\n\nCriterion: {criterion}"
    )
    return result.output
