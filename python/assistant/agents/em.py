"""
Engineering Manager (EM) agent.

The EM coordinates the agent team, routing tasks to specialists
and tracking progress across multiple agents.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .base import BaseAgent, AgentConfig, AgentContext, AgentResponse
from .personas import EM_PERSONA

logger = logging.getLogger(__name__)


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

        # Use LLM to decide how to handle the task
        coordination_prompt = f"""New task received from {context.sender_handle}:

Subject: {context.subject}
Request: {message_body}

Analyze this task and decide:
1. Is this simple enough to go directly to coder?
2. Does it need planner to break it down first?
3. What specialist(s) will be needed?

Respond with your coordination plan and who should act first.
If delegating, set action_needed=True and target_agent to the agent handle."""

        response = await self._generate_llm_response(coordination_prompt)

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
        # Find the task
        task = self._find_task_by_tags(context.incoming_message.tags)
        if not task:
            task = self._find_task_for_thread(context.conversation_thread_id)

        if not task:
            logger.warning(f"EM received response but couldn't find associated task")
            return AgentResponse(
                message="Received response but no active task found.",
                task_complete=True,
            )

        # Store the result
        task.results[context.sender_handle] = message_body[:1000]
        task.updated_at = datetime.now()

        # Build context for LLM decision
        work_done = ", ".join(task.results.keys()) if task.results else "none yet"

        coordination_prompt = f"""TEAM RESPONSE RECEIVED

From: {context.sender_handle}
Original task: {task.description}
Work completed so far: {work_done}

Their response:
{message_body[:1500]}

---
What should happen next? Remember:
- If {context.sender_handle} just responded, do NOT delegate back to them
- If this is execution output from runner, the task is likely complete
- If this is code from coder, it probably needs to go to runner
- Your message is what the user sees if task_complete=True"""

        response = await self._generate_llm_response(coordination_prompt)

        # Safety check: prevent delegation back to same agent
        if response.action_needed and response.target_agent == context.sender_handle:
            logger.warning(f"LLM tried to delegate back to {context.sender_handle}, completing instead")
            response.action_needed = False
            response.task_complete = True

        # Handle the LLM's decision
        if response.task_complete:
            task.status = "completed"
            await self._report_completion(task, response.message)
            return None
        elif response.action_needed and response.target_agent:
            task.assigned_to = response.target_agent
            await self._delegate_task(task, response.target_agent, message_body)
            return None

        return response

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
        subject = f"Task: {task.description[:50]}..."

        body = f"""Task ID: {task.task_id}
Original request: {task.description}

Context from previous work:
{context}

Please complete your part of this task and respond with your output."""

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
