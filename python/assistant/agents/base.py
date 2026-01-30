"""
Base agent class combining LLM + agcom messaging.

Provides the foundation for all specialized agents in the team.
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel
from pydantic_ai import Agent, UsageLimits

from assistant.agcom.client import AgcomClient, AgcomSettings, AgcomError
from assistant.agcom.models import Message

logger = logging.getLogger(__name__)


class AgentState(str, Enum):
    """Agent lifecycle states."""

    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


@dataclass
class AgentConfig:
    """Configuration for an agent instance."""

    handle: str
    display_name: str
    system_prompt: str
    model: str = "openai:gpt-5.1"
    poll_interval_seconds: float = 2.0
    api_url: str = "http://localhost:8700"
    max_tool_calls: int = 5
    request_limit: int = 10


class AgentResponse(BaseModel):
    """Structured response from agent LLM."""

    message: str
    """The agent's response message."""

    action_needed: bool = False
    """Whether follow-up action is required from another agent."""

    target_agent: str | None = None
    """Handle of agent to delegate to (if action_needed)."""

    task_complete: bool = False
    """Whether the assigned task is complete."""


@dataclass
class AgentContext:
    """Context passed to agent during message processing."""

    incoming_message: Message
    conversation_thread_id: str
    sender_handle: str
    subject: str


@dataclass
class ProcessedMessage:
    """Record of a processed message."""

    message_id: str
    processed_at: datetime
    response_sent: bool


class BaseAgent(ABC):
    """
    Base class for LLM-powered agents communicating via agcom.

    Handles:
    - Lifecycle management (start/stop)
    - Message polling from agcom
    - LLM-based message processing
    - Response sending via agcom

    Subclasses implement:
    - process_message(): Custom message handling logic
    - get_tools(): Agent-specific tools for LLM
    """

    def __init__(self, config: AgentConfig):
        """
        Initialize the agent.

        Args:
            config: Agent configuration
        """
        self.config = config
        self._state = AgentState.STOPPED
        self._client: AgcomClient | None = None
        self._poll_task: asyncio.Task | None = None
        self._processed_messages: dict[str, ProcessedMessage] = {}
        self._last_poll_time: datetime | None = None
        self._running = False
        self._started_at: datetime | None = None  # Only process messages after this time

        # Create the LLM agent
        self._llm_agent = Agent(
            config.model,
            system_prompt=config.system_prompt,
            output_type=AgentResponse,
        )

        logger.info(f"Agent '{config.handle}' initialized with model '{config.model}'")

    @property
    def state(self) -> AgentState:
        """Get current agent state."""
        return self._state

    @property
    def handle(self) -> str:
        """Get agent handle."""
        return self.config.handle

    @property
    def is_running(self) -> bool:
        """Check if agent is running."""
        return self._state == AgentState.RUNNING and self._running

    async def start(self) -> None:
        """
        Start the agent.

        Connects to agcom and begins polling for messages.
        """
        if self._state == AgentState.RUNNING:
            logger.warning(f"Agent '{self.handle}' is already running")
            return

        self._state = AgentState.STARTING
        logger.info(f"Starting agent '{self.handle}'...")

        try:
            # Create agcom client
            settings = AgcomSettings(
                enabled=True,
                api_url=self.config.api_url,
                handle=self.config.handle,
                display_name=self.config.display_name,
                auto_login=True,
                is_configured=True,
            )
            self._client = AgcomClient(settings)
            await self._client._ensure_session()
            await self._client._ensure_authenticated()

            # Register self in address book (idempotent)
            await self._register_self()

            # Start message polling loop
            self._running = True
            from datetime import timezone
            self._started_at = datetime.now(timezone.utc)
            self._poll_task = asyncio.create_task(self._poll_loop())

            self._state = AgentState.RUNNING
            logger.info(f"Agent '{self.handle}' is now running")

        except Exception as e:
            self._state = AgentState.ERROR
            logger.error(f"Failed to start agent '{self.handle}': {e}")
            raise

    async def stop(self) -> None:
        """
        Stop the agent.

        Stops polling and disconnects from agcom.
        """
        if self._state == AgentState.STOPPED:
            return

        self._state = AgentState.STOPPING
        self._running = False
        logger.info(f"Stopping agent '{self.handle}'...")

        # Cancel poll task
        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass

        # Close agcom client
        if self._client:
            await self._client.close()
            self._client = None

        self._state = AgentState.STOPPED
        logger.info(f"Agent '{self.handle}' stopped")

    async def _register_self(self) -> None:
        """Register this agent in the address book (idempotent)."""
        if not self._client:
            return

        try:
            await self._client.add_contact(
                handle=self.handle,
                display_name=self.config.display_name,
                description=f"Agent: {self.config.display_name}",
                tags=["agent"],
            )
            logger.debug(f"Agent '{self.handle}' registered in address book")
        except AgcomError as e:
            # Ignore "already exists" errors (409 Conflict)
            if "409" in str(e) or "conflict" in str(e).lower():
                logger.debug(f"Agent '{self.handle}' already registered")
            else:
                logger.warning(f"Agent '{self.handle}' failed to register: {e}")

    async def _poll_loop(self) -> None:
        """
        Main polling loop for incoming messages.

        Continuously polls agcom for new messages and processes them.
        """
        logger.debug(f"Agent '{self.handle}' starting poll loop")

        while self._running:
            try:
                await self._poll_and_process()
                self._last_poll_time = datetime.now()
            except asyncio.CancelledError:
                break
            except AgcomError as e:
                logger.warning(f"Agent '{self.handle}' agcom error: {e}")
                # Brief pause on error
                await asyncio.sleep(5)
            except Exception as e:
                logger.error(f"Agent '{self.handle}' poll error: {e}", exc_info=True)
                await asyncio.sleep(5)

            await asyncio.sleep(self.config.poll_interval_seconds)

    async def _poll_and_process(self) -> None:
        """Poll for messages and process any new ones."""
        if not self._client:
            return

        # Get recent messages addressed to this agent
        messages = await self._client.list_messages(limit=20)

        for msg in messages:
            # Skip if we've already processed this message
            if msg.message_id in self._processed_messages:
                continue

            # Skip if not addressed to us
            if self.handle not in msg.to_handles:
                continue

            # Skip messages we sent ourselves
            if msg.from_handle == self.handle:
                continue

            # Skip messages from before we started (stale data)
            if self._started_at and msg.created_at < self._started_at:
                continue

            # Process the message
            logger.info(
                f"Agent '{self.handle}' received message from '{msg.from_handle}': "
                f"'{msg.subject}'"
            )
            logger.info(f"[{msg.from_handle} → {self.handle}] Message body:\n{msg.body[:1000]}")

            try:
                await self._handle_message(msg)
                self._processed_messages[msg.message_id] = ProcessedMessage(
                    message_id=msg.message_id,
                    processed_at=datetime.now(),
                    response_sent=True,
                )
            except Exception as e:
                logger.error(
                    f"Agent '{self.handle}' failed to process message "
                    f"'{msg.message_id}': {e}",
                    exc_info=True,
                )
                self._processed_messages[msg.message_id] = ProcessedMessage(
                    message_id=msg.message_id,
                    processed_at=datetime.now(),
                    response_sent=False,
                )

    async def _handle_message(self, message: Message) -> None:
        """
        Handle an incoming message.

        Args:
            message: The incoming message to process
        """
        context = AgentContext(
            incoming_message=message,
            conversation_thread_id=message.thread_id,
            sender_handle=message.from_handle,
            subject=message.subject,
        )

        # Let subclass process the message
        response = await self.process_message(context, message.body)

        # Send response back via agcom
        if response and response.message:
            await self._send_reply(message, response)

    async def _send_reply(self, original_message: Message, response: AgentResponse) -> None:
        """
        Send a reply to a message.

        Args:
            original_message: The message being replied to
            response: The agent's response
        """
        if not self._client:
            logger.error(f"Agent '{self.handle}' cannot send reply - no client")
            return

        # Preserve task tags from original message
        reply_tags = ["agent-response"]
        if original_message.tags:
            for tag in original_message.tags:
                if tag.startswith("task-") or tag == "task":
                    reply_tags.append(tag)

        try:
            logger.info(f"[{self.handle} → {original_message.from_handle}] Reply:\n{response.message[:1000]}")
            await self._client.reply_to_message(
                message_id=original_message.message_id,
                body=response.message,
                tags=reply_tags,
            )
            logger.debug(
                f"Agent '{self.handle}' sent reply to '{original_message.from_handle}'"
            )
        except AgcomError as e:
            logger.error(f"Agent '{self.handle}' failed to send reply: {e}")

    @abstractmethod
    async def process_message(
        self, context: AgentContext, message_body: str
    ) -> AgentResponse | None:
        """
        Process an incoming message and generate a response.

        Override this method to implement agent-specific behavior.

        Args:
            context: Message context (sender, thread, subject)
            message_body: The message content

        Returns:
            AgentResponse with reply, or None to skip replying
        """
        pass

    async def _generate_llm_response(
        self,
        prompt: str,
        additional_context: str | None = None,
    ) -> AgentResponse:
        """
        Generate a response using the LLM.

        Args:
            prompt: The user/message prompt
            additional_context: Optional context to prepend

        Returns:
            AgentResponse from the LLM
        """
        # Build the full prompt
        full_prompt = prompt
        if additional_context:
            full_prompt = f"{additional_context}\n\n{prompt}"

        # Get agent-specific tools
        tools = self.get_tools()

        # Apply usage limits
        usage_limits = UsageLimits(
            request_limit=self.config.request_limit,
            tool_calls_limit=self.config.max_tool_calls,
        )

        # Run the LLM
        if tools:
            with self._llm_agent.override(tools=tools):
                result = await self._llm_agent.run(full_prompt, usage_limits=usage_limits)
        else:
            result = await self._llm_agent.run(full_prompt, usage_limits=usage_limits)

        return result.output

    def get_tools(self) -> list[Any]:
        """
        Get agent-specific tools for LLM.

        Override this method to provide custom tools.

        Returns:
            List of PydanticAI tools
        """
        return []

    async def send_message(
        self,
        to_handle: str,
        subject: str,
        body: str,
        tags: list[str] | None = None,
    ) -> Message | None:
        """
        Send a new message to another agent.

        Args:
            to_handle: Recipient agent handle
            subject: Message subject
            body: Message body
            tags: Optional tags

        Returns:
            Created message, or None on failure
        """
        if not self._client:
            logger.error(f"Agent '{self.handle}' cannot send message - no client")
            return None

        try:
            message = await self._client.send_message(
                to_handles=[to_handle],
                subject=subject,
                body=body,
                tags=tags or [],
            )
            logger.info(f"Agent '{self.handle}' sent message to '{to_handle}': '{subject}'")
            return message
        except AgcomError as e:
            logger.error(f"Agent '{self.handle}' failed to send message: {e}")
            return None

    def get_status(self) -> dict[str, Any]:
        """
        Get agent status information.

        Returns:
            Status dict with state, stats, and config
        """
        return {
            "handle": self.handle,
            "display_name": self.config.display_name,
            "state": self._state.value,
            "model": self.config.model,
            "messages_processed": len(self._processed_messages),
            "last_poll": self._last_poll_time.isoformat() if self._last_poll_time else None,
        }
