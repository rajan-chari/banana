"""
Engineering Manager (EM) agent.

The EM coordinates the agent team, routing tasks to specialists
and tracking progress across multiple agents.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .base import BaseAgent, AgentConfig, AgentContext, AgentResponse
from .personas import EM_PERSONA

logger = logging.getLogger(__name__)

# How often to send progress updates while waiting (seconds)
PROGRESS_UPDATE_INTERVAL = 20

# Max attempts per agent before giving up on that approach
MAX_AGENT_ATTEMPTS = 3


@dataclass
class TaskRecord:
    """Record of a task being coordinated by EM."""

    task_id: str
    description: str
    requester: str
    requester_thread_id: str  # Thread with the requester (assistant)
    requester_message_id: str  # Original message ID to reply to
    status: str  # pending, in_progress, completed, failed
    created_at: datetime
    updated_at: datetime
    steps: list[str] = field(default_factory=list)
    current_step: int = 0
    assigned_to: str | None = None
    results: dict[str, str] = field(default_factory=dict)
    delegation_threads: list[str] = field(default_factory=list)  # Threads with team members

    # Progress tracking
    agent_attempts: dict[str, int] = field(default_factory=dict)  # agent -> attempt count
    last_error: str | None = None  # Last error message (to detect repeated failures)
    waiting_since: datetime | None = None  # When we started waiting for current agent
    progress_task: Any = None  # Background task for periodic updates


class EMAgent(BaseAgent):
    """
    Engineering Manager agent that coordinates the team.

    Responsibilities:
    - Receive requests from assistant
    - Delegate to appropriate specialists
    - Track progress across subtasks
    - Resolve conflicts
    - Report results back to assistant
    """

    def __init__(
        self,
        api_url: str = "http://localhost:8700",
        model: str = "openai:gpt-5.1",
    ):
        """
        Initialize the EM agent.

        Args:
            api_url: agcom API URL
            model: LLM model to use
        """
        config = AgentConfig(
            handle=EM_PERSONA.handle,
            display_name=EM_PERSONA.display_name,
            system_prompt=EM_PERSONA.system_prompt,
            model=model,
            api_url=api_url,
            poll_interval_seconds=2.0,
        )
        super().__init__(config)

        # Task tracking
        self._tasks: dict[str, TaskRecord] = {}
        self._task_counter = 0

    async def process_message(
        self, context: AgentContext, message_body: str
    ) -> AgentResponse | None:
        """
        Process incoming messages and coordinate team response.

        Args:
            context: Message context
            message_body: The message content

        Returns:
            AgentResponse with coordination decision
        """
        # Check if this is a response from a team member
        if context.sender_handle in ["planner", "coder", "reviewer", "security", "runner"]:
            return await self._handle_team_response(context, message_body)

        # This is a new task from the assistant
        return await self._handle_new_task(context, message_body)

    async def _handle_new_task(
        self, context: AgentContext, message_body: str
    ) -> AgentResponse:
        """
        Handle a new task request from the assistant.

        Args:
            context: Message context
            message_body: Task description

        Returns:
            AgentResponse with delegation plan
        """
        # Check for duplicate/similar task already in progress
        existing_task = self._find_similar_active_task(context.sender_handle, message_body)
        if existing_task:
            logger.info(f"EM found similar active task {existing_task.task_id}, sending status update")
            status_msg = f"Still working on this task (ID: {existing_task.task_id}). Currently assigned to: {existing_task.assigned_to or 'pending'}."
            return AgentResponse(
                message=status_msg,
                task_complete=False,
            )

        # Create task record
        self._task_counter += 1
        task_id = f"task-{self._task_counter}"
        task = TaskRecord(
            task_id=task_id,
            description=message_body,
            requester=context.sender_handle,
            requester_thread_id=context.conversation_thread_id,
            requester_message_id=context.incoming_message.message_id,
            status="pending",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        self._tasks[task_id] = task

        logger.info(f"EM created task {task_id}: {message_body[:100]}...")
        logger.info(f"[EM received from {context.sender_handle}] Full message body:\n{message_body}")

        # Use LLM to decide how to handle the task
        coordination_prompt = f"""New task received from {context.sender_handle}:

Subject: {context.subject}
Request: {message_body}

Decide who on your team should handle this first. Your team: planner, coder, reviewer, security, runner.
If delegating, set action_needed=True and target_agent to the agent handle."""

        logger.info(f"[EM LLM prompt]:\n{coordination_prompt}")
        response = await self._generate_llm_response(coordination_prompt)
        logger.info(f"[EM LLM response] action_needed={response.action_needed}, target_agent={response.target_agent}, task_complete={response.task_complete}")
        logger.info(f"[EM LLM message]: {response.message[:500]}")

        # Update task with assignment
        if response.action_needed and response.target_agent:
            task.status = "in_progress"
            task.assigned_to = response.target_agent
            task.updated_at = datetime.now()

            # Forward the task to the assigned agent
            await self._delegate_task(task, response.target_agent, message_body)

            # Don't reply to requester yet - wait for team to complete
            return None

        return response

    async def _handle_team_response(
        self, context: AgentContext, message_body: str
    ) -> AgentResponse:
        """
        Handle a response from a team member.

        Uses LLM to decide next steps - no hardcoded routing logic.
        """
        # Ignore progress messages - these are informational, not task completion
        tags = context.incoming_message.tags or []
        if "progress" in tags:
            logger.info(f"[EM] Ignoring progress message from {context.sender_handle}: {message_body[:100]}")
            return None

        # Find the task
        task = self._find_task_by_tags(tags)
        if not task:
            task = self._find_task_for_thread(context.conversation_thread_id)

        if not task:
            logger.warning(f"EM received response but couldn't find associated task")
            return AgentResponse(
                message="Received response but no active task found.",
                task_complete=True,
            )

        # Stop periodic progress updates - we got a response
        self._stop_progress_updates(task)

        # Store the result (keep full context for artifact-based workflows)
        task.results[context.sender_handle] = message_body[:20000]
        task.updated_at = datetime.now()

        # Track if this looks like a failure (for progress detection)
        is_failure = self._looks_like_failure(message_body)
        if is_failure:
            task.last_error = message_body[:500]

        logger.info(f"[EM received from {context.sender_handle}] Team response:\n{message_body[:5000]}")

        # Build context for LLM decision
        work_done = ", ".join(task.results.keys()) if task.results else "none yet"
        attempt_info = ", ".join(f"{a}:{c}" for a, c in task.agent_attempts.items())

        coordination_prompt = f"""TEAM RESPONSE RECEIVED

From: {context.sender_handle}
Original task: {task.description}
Work completed so far: {work_done}
Agent attempts: {attempt_info}

Their response:
{message_body[:16000]}

---
What should happen next?
- If this is successful output from runner → task_complete=True
- If this is code from coder → send to runner
- If runner failed → send error back to coder to fix
- coder→runner→coder→runner cycles are fine when fixing bugs
- Your message is what the user sees if task_complete=True"""

        logger.info(f"[EM LLM prompt for team response]:\n{coordination_prompt}")
        response = await self._generate_llm_response(coordination_prompt)
        logger.info(f"[EM LLM decision] action_needed={response.action_needed}, target_agent={response.target_agent}, task_complete={response.task_complete}")
        logger.info(f"[EM LLM message]: {response.message[:500]}")

        # Check if we should allow delegation to the same agent
        if response.action_needed and response.target_agent:
            target = response.target_agent
            attempts = task.agent_attempts.get(target, 0)

            # Allow same-agent delegation if under max attempts
            # But block if same error is repeating (no progress)
            if attempts >= MAX_AGENT_ATTEMPTS:
                if is_failure and task.last_error and self._similar_error(task.last_error, message_body):
                    logger.warning(f"Agent {target} has failed {attempts} times with similar errors, giving up")
                    response.action_needed = False
                    response.task_complete = True
                    response.message = f"Unable to complete the task after {attempts} attempts. Last error: {message_body[:2000]}"

        # Handle the LLM's decision
        if response.task_complete:
            task.status = "completed"
            self._stop_progress_updates(task)
            await self._report_completion(task, response.message)
            return None
        elif response.action_needed and response.target_agent:
            task.assigned_to = response.target_agent
            await self._delegate_task(task, response.target_agent, message_body)
            return None

        return response

    def _looks_like_failure(self, message: str) -> bool:
        """Check if a message looks like a failure/error."""
        failure_indicators = [
            "error", "failed", "exception", "traceback",
            "could not", "unable to", "timed out", "timeout"
        ]
        message_lower = message.lower()
        return any(indicator in message_lower for indicator in failure_indicators)

    def _similar_error(self, error1: str, error2: str) -> bool:
        """Check if two error messages are similar (same root cause)."""
        # Simple heuristic: check if key error phrases match
        def extract_error_type(msg: str) -> str:
            # Look for common error patterns
            import re
            patterns = [
                r"(\w+Error):",
                r"(\w+Exception):",
                r"timed out",
                r"timeout",
            ]
            msg_lower = msg.lower()
            for pattern in patterns:
                match = re.search(pattern, msg_lower if "time" in pattern else msg)
                if match:
                    return match.group(1) if match.lastindex else match.group(0)
            return ""

        return extract_error_type(error1) == extract_error_type(error2)

    async def _delegate_task(
        self, task: TaskRecord, target_agent: str, context: str
    ) -> None:
        """
        Delegate a task to a team member.

        Args:
            task: The task being delegated
            target_agent: Agent to delegate to
            context: Context/instructions for the agent
        """
        # Track attempts per agent
        task.agent_attempts[target_agent] = task.agent_attempts.get(target_agent, 0) + 1
        task.waiting_since = datetime.now()

        subject = f"Task: {task.description[:50]}..."

        # Include team context so agents know what's possible
        team_context = """Your team:
- coder: writes Python code
- runner: executes Python on the user's machine (Windows, can pip install packages)
- reviewer: reviews code for bugs
- security: checks for security issues

Code can discover system information - don't ask the user for things code can determine.
If a package is missing, code can pip install it."""

        # Build richer context from previous work
        previous_work = self._build_previous_work_context(task)

        body = f"""Task ID: {task.task_id}
Original request: {task.description}

{team_context}

{previous_work}

Please complete your part of this task and respond with your output."""

        logger.info(f"[EM → {target_agent}] Delegating:\n{body}")

        message = await self.send_message(
            to_handle=target_agent,
            subject=subject,
            body=body,
            tags=["task", task.task_id],
        )

        # Track the delegation thread so we can find the task when they respond
        if message:
            task.delegation_threads.append(message.thread_id)

        logger.info(f"EM delegated task {task.task_id} to {target_agent}")

        # Send initial progress update to requester
        await self._send_progress_update(task, target_agent)

        # Start background task for periodic progress updates
        self._start_progress_updates(task, target_agent)

    def _start_progress_updates(self, task: TaskRecord, assigned_to: str) -> None:
        """Start a background task to send periodic progress updates."""
        # Cancel any existing progress task
        if task.progress_task and not task.progress_task.done():
            task.progress_task.cancel()

        async def send_periodic_updates():
            update_count = 0
            while True:
                await asyncio.sleep(PROGRESS_UPDATE_INTERVAL)
                update_count += 1
                elapsed = (datetime.now() - task.waiting_since).seconds if task.waiting_since else 0
                await self._send_progress_update(
                    task,
                    assigned_to,
                    message=f"Still working... {assigned_to} is running ({elapsed}s elapsed)"
                )

        task.progress_task = asyncio.create_task(send_periodic_updates())

    def _stop_progress_updates(self, task: TaskRecord) -> None:
        """Stop the background progress update task."""
        if task.progress_task and not task.progress_task.done():
            task.progress_task.cancel()
            task.progress_task = None
        task.waiting_since = None

    def _build_previous_work_context(self, task: TaskRecord) -> str:
        """Build context string from previous work on this task."""
        if not task.results:
            return f"Context from previous work:\n{task.description}"

        parts = ["Previous work on this task:"]
        for agent, result in task.results.items():
            # If result contains artifact path, include full result (paths are important for multi-turn)
            if "Artifact:" in result:
                parts.append(f"\n[{agent}]: {result}")
            else:
                # Truncate non-artifact results to avoid bloat
                parts.append(f"\n[{agent}]:\n{result[:2000]}")

        return "\n".join(parts)

    async def _send_progress_update(
        self, task: TaskRecord, assigned_to: str, message: str | None = None
    ) -> None:
        """Send a progress update to the requester."""
        if not self._client:
            return

        try:
            update_msg = message or f"Working on it - sent to {assigned_to}."
            await self._client.reply_to_message(
                message_id=task.requester_message_id,
                body=update_msg,
                tags=["progress", task.task_id],
            )
            logger.info(f"EM sent progress update to {task.requester}: {update_msg}")
        except Exception as e:
            logger.warning(f"EM couldn't send progress update: {e}")

    async def _report_completion(self, task: TaskRecord, final_result: str) -> None:
        """
        Report task completion back to the requester.

        Uses reply_to_message to respond in the original thread so the
        requester's poll loop can find the response.

        Args:
            task: The completed task
            final_result: The result to send (usually runner's output)
        """
        # Format a user-friendly response - just the result, not internal metadata
        # The final_result from runner should contain the actual output
        body = final_result

        logger.info(f"[EM → {task.requester}] Task complete, sending result:\n{body[:1000]}")

        if not self._client:
            logger.error(f"EM cannot report completion - no client")
            return

        try:
            await self._client.reply_to_message(
                message_id=task.requester_message_id,
                body=body,
                tags=["task-complete", task.task_id],
            )
            logger.info(f"EM reported completion of task {task.task_id} in original thread")
        except Exception as e:
            logger.error(f"EM failed to report completion: {e}")

    def _find_task_for_thread(self, thread_id: str) -> TaskRecord | None:
        """Find the task associated with a thread."""
        for task in self._tasks.values():
            if task.requester_thread_id == thread_id:
                return task
            if thread_id in task.delegation_threads:
                return task
        return None

    def _find_task_by_tags(self, tags: list[str] | None) -> TaskRecord | None:
        """Find a task by looking for task ID in message tags."""
        if not tags:
            return None
        for tag in tags:
            if tag.startswith("task-"):
                task_id = tag
                if task_id in self._tasks:
                    return self._tasks[task_id]
        return None

    def _find_similar_active_task(self, requester: str, description: str) -> TaskRecord | None:
        """
        Find an active task with similar description from the same requester.

        This prevents duplicate tasks when the requester retries.
        """
        # Normalize description for comparison
        desc_normalized = description.strip().lower()[:200]

        for task in self._tasks.values():
            if task.status not in ("pending", "in_progress"):
                continue
            if task.requester != requester:
                continue
            # Check if descriptions are similar (first 200 chars match)
            task_desc_normalized = task.description.strip().lower()[:200]
            if task_desc_normalized == desc_normalized:
                return task

        return None

    def get_tools(self) -> list[Any]:
        """Get EM-specific tools."""
        # EM primarily uses messaging, no special tools needed
        return []

    def get_status(self) -> dict[str, Any]:
        """Get EM status including task tracking."""
        status = super().get_status()
        status.update({
            "active_tasks": len([t for t in self._tasks.values() if t.status == "in_progress"]),
            "completed_tasks": len([t for t in self._tasks.values() if t.status == "completed"]),
            "total_tasks": len(self._tasks),
        })
        return status
