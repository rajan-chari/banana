"""
Agent LLM decision tests — real LLM, stubbed transport.

Tests what the LLM *actually decides* when agents get different inputs.
Only agcom transport is stubbed; all LLM calls are real.

Run with: pytest tests/test_agent_llm_decisions.py -v -s
"""

import pytest

from tests.agent_harness import AgentTestHarness, judge


# ---------------------------------------------------------------------------
# EM routing tests (em.py — fixes 1, 2, 4)
# ---------------------------------------------------------------------------


class TestEMRouting:
    """Test EM's LLM-driven routing decisions."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.harness = AgentTestHarness()

    @pytest.mark.asyncio
    async def test_em_routes_code_to_runner(self):
        """Coder sends python code → EM should route to runner."""
        em = self.harness.create_em()
        self.harness.seed_task(em, "task-1", "Write hello world", assigned_to="coder")

        code_msg = '''Here's the code:

```python
print("Hello, world!")
```
'''
        result = await self.harness.inject(
            em, from_handle="coder", body=code_msg, tags=["task", "task-1"]
        )

        # Fix 1: EM always returns None for team responses
        assert result is None, f"EM should return None for team responses, got {result}"

        # Check that EM delegated to runner (via send_message or _delegate_task)
        sends = [s for s in self.harness.sent_messages if s[0] == "send_message"]
        runner_sends = [s for s in sends if "runner" in str(s[1].get("to_handles", []))]
        assert len(runner_sends) > 0, (
            f"EM should delegate to runner when coder sends code. "
            f"Sent messages: {self.harness.sent_messages}"
        )

    @pytest.mark.asyncio
    async def test_em_routes_runner_error_to_coder(self):
        """Runner sends traceback → EM should route back to coder."""
        em = self.harness.create_em()
        self.harness.seed_task(em, "task-1", "Write hello world", assigned_to="runner")

        error_msg = """Code failed: Traceback (most recent call last):
  File "script.py", line 3, in <module>
    import nonexistent_package
ModuleNotFoundError: No module named 'nonexistent_package'
Artifact: data/artifacts/task-1"""

        result = await self.harness.inject(
            em, from_handle="runner", body=error_msg, tags=["task", "task-1"]
        )

        assert result is None, "EM should return None for team responses"

        sends = [s for s in self.harness.sent_messages if s[0] == "send_message"]
        coder_sends = [s for s in sends if "coder" in str(s[1].get("to_handles", []))]
        assert len(coder_sends) > 0, (
            f"EM should route runner errors back to coder. "
            f"Sent messages: {self.harness.sent_messages}"
        )

    @pytest.mark.asyncio
    async def test_em_completes_on_runner_success(self):
        """Runner sends success → EM should complete the task."""
        em = self.harness.create_em()
        task = self.harness.seed_task(em, "task-1", "Print current time", assigned_to="runner")

        success_msg = """Execution succeeded.
Artifact: data/artifacts/task-1/output.txt
Preview:
The current time is 14:32:05"""

        result = await self.harness.inject(
            em, from_handle="runner", body=success_msg, tags=["task", "task-1"]
        )

        assert result is None, "EM should return None for team responses"
        assert task.status == "completed", f"Task should be completed, got {task.status}"

    @pytest.mark.asyncio
    async def test_em_always_returns_none(self):
        """EM should always return None for any team response (Fix 1)."""
        em = self.harness.create_em()
        self.harness.seed_task(em, "task-1", "Do something", assigned_to="coder")

        # Try various team member messages
        for handle in ["coder", "runner", "reviewer"]:
            self.harness.sent_messages.clear()
            result = await self.harness.inject(
                em,
                from_handle=handle,
                body="Here is my response to the task.",
                tags=["task", "task-1"],
            )
            assert result is None, f"EM should return None for {handle}'s response, got {result}"

    @pytest.mark.asyncio
    async def test_em_result_history_preserved(self):
        """Multiple runner responses should all be preserved in task.results (Fix 2)."""
        em = self.harness.create_em()
        task = self.harness.seed_task(em, "task-1", "Iterative task", assigned_to="runner")

        # First runner response (failure)
        await self.harness.inject(
            em,
            from_handle="runner",
            body="Code failed: NameError: name 'x' is not defined",
            tags=["task", "task-1"],
        )

        # Second runner response (success)
        await self.harness.inject(
            em,
            from_handle="runner",
            body="Execution succeeded.\nPreview:\nResult: 42",
            tags=["task", "task-1"],
        )

        runner_results = task.results.get("runner", [])
        assert len(runner_results) == 2, (
            f"Should have 2 runner results preserved, got {len(runner_results)}: {runner_results}"
        )


# ---------------------------------------------------------------------------
# Runner intelligence tests (runner.py — fix 5)
# ---------------------------------------------------------------------------


class TestRunnerIntelligence:
    """Test Runner's LLM-driven response to different message types."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.harness = AgentTestHarness()

    @pytest.mark.asyncio
    async def test_runner_status_update(self):
        """Runner should use LLM to respond to status updates (not a hardcoded string)."""
        runner = self.harness.create_runner()

        result = await self.harness.inject(
            runner,
            from_handle="em",
            body="Still working - currently with coder",
            subject="Task: test status",
        )

        assert result is not None, "Runner should return a response"
        # The key fix: runner consults the LLM instead of returning a hardcoded string.
        # The LLM's system prompt may still influence it to mention "no code", but the
        # response should reference "status" or "update" or "working" — showing awareness
        # of the message content rather than a generic error.
        msg_lower = result.message.lower()
        aware = any(w in msg_lower for w in ["status", "update", "working", "progress", "coder"])
        assert aware, (
            f"Runner should show awareness of the status update message. Got: {result.message}"
        )

    @pytest.mark.asyncio
    async def test_runner_description_only(self):
        """Runner should identify descriptions vs actual code."""
        runner = self.harness.create_runner()

        result = await self.harness.inject(
            runner,
            from_handle="em",
            body="I will write a script that captures a screenshot of the desktop using the PIL library and saves it to a file.",
            subject="Task: screenshot",
        )

        assert result is not None, "Runner should return a response"
        assert await judge(
            result.message,
            "identifies this as a description or plan, not executable code"
        ), f"Runner said: {result.message}"

    @pytest.mark.asyncio
    async def test_runner_executes_real_code(self):
        """Runner should execute actual code and report success."""
        runner = self.harness.create_runner()

        code_msg = '''```python
print("hello from test")
```'''

        result = await self.harness.inject(
            runner,
            from_handle="em",
            body=code_msg,
            subject="Task: hello",
            tags=["task", "task-test"],
        )

        assert result is not None, "Runner should return a response"
        assert result.task_complete is True, f"Runner should mark task complete, got task_complete={result.task_complete}"
        assert await judge(
            result.message,
            "reports successful execution of code"
        ), f"Runner said: {result.message}"


# ---------------------------------------------------------------------------
# Coder output tests (coder.py)
# ---------------------------------------------------------------------------


class TestCoderOutput:
    """Test Coder's code generation."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.harness = AgentTestHarness()

    @pytest.mark.asyncio
    async def test_coder_generates_python(self):
        """Coder should generate valid Python code for a coding request."""
        coder = self.harness.create_coder()

        result = await self.harness.inject(
            coder,
            from_handle="em",
            body="Write code to print the current date and time",
            subject="Task: current time",
        )

        assert result is not None, "Coder should return a response"
        assert result.task_complete is False, "Coder should not mark task complete (runner does that)"
        assert await judge(
            result.message,
            "contains valid Python code that prints the current date/time, with an import statement"
        ), f"Coder said: {result.message}"


# ---------------------------------------------------------------------------
# Dedup logic tests (delegation.py — fix 3, pure logic, no LLM)
# ---------------------------------------------------------------------------


class TestDedupLogic:
    """Test delegation dedup — pure logic, no LLM needed."""

    def test_dedup_blocks_similar(self):
        """Same task twice should return 'already working' message."""
        from assistant.agents.delegation import EMDelegator
        from unittest.mock import MagicMock

        client = MagicMock()
        delegator = EMDelegator(client)

        # Simulate a pending task
        delegator._pending_tasks["thread-1"] = {
            "message_id": "msg-1",
            "thread_id": "thread-1",
            "description": "write code to print current time",
            "sent_at": None,
        }

        # Try to find similar
        result = delegator._find_similar_pending("write code to print current time")
        assert result is not None, "Should detect similar pending task"

    def test_dedup_allows_different(self):
        """Different tasks should not be blocked."""
        from assistant.agents.delegation import EMDelegator
        from unittest.mock import MagicMock

        client = MagicMock()
        delegator = EMDelegator(client)

        delegator._pending_tasks["thread-1"] = {
            "message_id": "msg-1",
            "thread_id": "thread-1",
            "description": "write code to print current time",
            "sent_at": None,
        }

        result = delegator._find_similar_pending("take a screenshot of the desktop")
        assert result is None, "Different tasks should not be blocked"


# ---------------------------------------------------------------------------
# Cancel logic tests (em.py — fix 4, pure logic, no LLM)
# ---------------------------------------------------------------------------


class TestCancelLogic:
    """Test EM's cancel-similar-tasks logic — pure logic, no LLM."""

    def test_cancel_similar_on_completion(self):
        """Completing a task should cancel similar active tasks."""
        harness = AgentTestHarness()
        em = harness.create_em()

        # Create two similar tasks
        task1 = harness.seed_task(em, "task-1", "print the current time in python")
        task2 = harness.seed_task(
            em, "task-2", "print the current time in python please",
            requester=task1.requester,
        )

        # Complete task-2
        task2.status = "completed"
        em._cancel_similar_tasks(task2)

        assert task1.status == "cancelled", f"task-1 should be cancelled, got {task1.status}"

    def test_cancel_does_not_affect_different(self):
        """Completing a task should NOT cancel unrelated tasks."""
        harness = AgentTestHarness()
        em = harness.create_em()

        task1 = harness.seed_task(em, "task-1", "take a screenshot of the desktop")
        task2 = harness.seed_task(
            em, "task-2", "print the current time",
            requester=task1.requester,
        )

        task2.status = "completed"
        em._cancel_similar_tasks(task2)

        assert task1.status == "in_progress", f"task-1 should still be in_progress, got {task1.status}"
