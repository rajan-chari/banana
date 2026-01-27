"""
Delegation helper for Assistant to communicate with EM via agcom.

Provides functions for:
- Sending tasks to EM
- Waiting for EM's response
- Polling for completion
"""

import asyncio
import logging
from datetime import datetime
from typing import Any

from assistant.agcom.client import AgcomClient, AgcomError
from assistant.agcom.models import Message

logger = logging.getLogger(__name__)


class EMDelegator:
    """
    Handles delegation from Assistant to Engineering Manager.

    The Assistant uses this to:
    1. Send tasks to EM
    2. Wait for EM's response
    3. Return results to display to user
    """

    def __init__(self, agcom_client: AgcomClient):
        """
        Initialize the delegator.

        Args:
            agcom_client: Configured agcom client for the assistant
        """
        self.client = agcom_client
        self._pending_tasks: dict[str, dict[str, Any]] = {}

    async def delegate_task(
        self,
        task_description: str,
        context: str | None = None,
        timeout_seconds: float = 120,
        poll_interval: float = 2.0,
    ) -> str:
        """
        Delegate a task to EM and wait for completion.

        Args:
            task_description: What needs to be done
            context: Additional context (e.g., user preferences)
            timeout_seconds: Max time to wait for response
            poll_interval: Seconds between polls

        Returns:
            EM's response/result as a string
        """
        # Build the message body
        body = f"Task from user:\n{task_description}"
        if context:
            body += f"\n\nAdditional context:\n{context}"

        # Send to EM
        try:
            message = await self.client.send_message(
                to_handles=["em"],
                subject="User Request",
                body=body,
                tags=["user-task", "delegation"],
            )
            logger.info(f"Delegated task to EM: {message.message_id}")

            # Track the task
            task_info = {
                "message_id": message.message_id,
                "thread_id": message.thread_id,
                "sent_at": datetime.now(),
                "description": task_description[:100],
            }
            self._pending_tasks[message.thread_id] = task_info

            # Wait for response
            response = await self._wait_for_response(
                thread_id=message.thread_id,
                timeout_seconds=timeout_seconds,
                poll_interval=poll_interval,
            )

            # Clean up
            del self._pending_tasks[message.thread_id]

            return response

        except AgcomError as e:
            logger.error(f"Failed to delegate to EM: {e}")
            return f"Failed to reach the engineering team: {e}"

    async def _wait_for_response(
        self,
        thread_id: str,
        timeout_seconds: float,
        poll_interval: float,
    ) -> str:
        """
        Wait for EM's response in a thread.

        Args:
            thread_id: Thread to monitor
            timeout_seconds: Max wait time
            poll_interval: Seconds between polls

        Returns:
            Response body text
        """
        import time
        start_time = time.time()
        seen_messages: set[str] = set()

        # Get the original message ID to skip it
        task_info = self._pending_tasks.get(thread_id)
        if task_info:
            seen_messages.add(task_info["message_id"])

        while time.time() - start_time < timeout_seconds:
            try:
                # Get messages in this thread
                messages = await self.client.get_thread_messages(
                    thread_id=thread_id,
                    limit=20,
                )

                # Look for new messages from EM (or task-complete tagged)
                for msg in messages:
                    if msg.message_id in seen_messages:
                        continue
                    seen_messages.add(msg.message_id)

                    # Check if this is a response from EM
                    if msg.from_handle == "em":
                        logger.info(f"Received response from EM: {msg.message_id}")

                        # Check for completion tag
                        if msg.tags and "task-complete" in msg.tags:
                            logger.info("Task marked complete")
                            return msg.body

                        # Even without tag, return EM's response
                        # (EM might send intermediate updates)
                        return msg.body

            except AgcomError as e:
                logger.warning(f"Error polling for response: {e}")

            await asyncio.sleep(poll_interval)

        logger.warning(f"Timeout waiting for EM response after {timeout_seconds}s")
        return "The team is still working on this. Check back later or ask me to follow up."

    async def check_em_available(self) -> bool:
        """
        Check if EM agent is registered and presumably available.

        Returns:
            True if EM is in contacts
        """
        try:
            contact = await self.client.get_contact("em")
            return contact.is_active
        except AgcomError:
            return False

    def get_pending_tasks(self) -> list[dict[str, Any]]:
        """Get list of pending task delegations."""
        return list(self._pending_tasks.values())


def should_delegate_to_team(user_message: str, llm_response: Any) -> bool:
    """
    Determine if a task should be delegated to the agent team.

    Args:
        user_message: The user's request
        llm_response: The LLM's response (AssistantResponse)

    Returns:
        True if this should go to the team
    """
    # If LLM wants to execute a script, delegate instead
    if hasattr(llm_response, 'should_execute_script') and llm_response.should_execute_script:
        return True

    # Keywords that suggest team work needed
    team_keywords = [
        "write code", "create script", "build", "implement",
        "execute", "run", "code review", "security check",
        "analyze code", "debug", "fix bug", "refactor",
    ]

    lower_message = user_message.lower()
    for keyword in team_keywords:
        if keyword in lower_message:
            return True

    return False
