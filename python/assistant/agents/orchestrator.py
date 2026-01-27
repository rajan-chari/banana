"""
Team orchestrator - manages the agent team lifecycle.

Provides helper methods for starting, stopping, and monitoring
the multi-agent team.
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

from assistant.agcom.client import AgcomClient, AgcomSettings

from .base import BaseAgent, AgentState
from .em import EMAgent
from .coder import CoderAgent
from .runner import RunnerAgent
from .security import SecurityAgent
from .reviewer import ReviewerAgent
from .planner import PlannerAgent

logger = logging.getLogger(__name__)


@dataclass
class TeamConfig:
    """Configuration for the agent team."""

    api_url: str = "http://localhost:8700"
    model: str = "openai:gpt-5.1"
    enable_em: bool = True
    enable_planner: bool = True
    enable_coder: bool = True
    enable_reviewer: bool = True
    enable_security: bool = True
    enable_runner: bool = True


class TeamOrchestrator:
    """
    Orchestrates the multi-agent team.

    Handles:
    - Starting all agents
    - Stopping all agents
    - Monitoring team status
    - Delegating from assistant to EM
    """

    def __init__(self, config: TeamConfig | None = None):
        """
        Initialize the orchestrator.

        Args:
            config: Team configuration (uses defaults if not provided)
        """
        self.config = config or TeamConfig()
        self._agents: dict[str, BaseAgent] = {}
        self._running = False

        # Create agents based on config
        self._create_agents()

    def _create_agents(self) -> None:
        """Create agent instances based on configuration."""
        api_url = self.config.api_url
        model = self.config.model

        if self.config.enable_em:
            self._agents["em"] = EMAgent(api_url=api_url, model=model)

        if self.config.enable_planner:
            self._agents["planner"] = PlannerAgent(api_url=api_url, model=model)

        if self.config.enable_coder:
            self._agents["coder"] = CoderAgent(api_url=api_url, model=model)

        if self.config.enable_reviewer:
            self._agents["reviewer"] = ReviewerAgent(api_url=api_url, model=model)

        if self.config.enable_security:
            self._agents["security"] = SecurityAgent(api_url=api_url, model=model)

        if self.config.enable_runner:
            self._agents["runner"] = RunnerAgent(api_url=api_url, model=model)

        logger.info(f"Created {len(self._agents)} agents: {list(self._agents.keys())}")

    @property
    def is_running(self) -> bool:
        """Check if the team is running."""
        return self._running

    @property
    def agents(self) -> dict[str, BaseAgent]:
        """Get all agents."""
        return self._agents

    def get_agent(self, handle: str) -> BaseAgent | None:
        """Get an agent by handle."""
        return self._agents.get(handle)

    async def start(self) -> None:
        """
        Start all agents in the team.

        Starts agents in parallel for efficiency.
        """
        if self._running:
            logger.warning("Team is already running")
            return

        logger.info("Starting agent team...")

        # Start all agents in parallel
        start_tasks = [agent.start() for agent in self._agents.values()]
        results = await asyncio.gather(*start_tasks, return_exceptions=True)

        # Check for failures
        for agent, result in zip(self._agents.values(), results):
            if isinstance(result, Exception):
                logger.error(f"Failed to start agent '{agent.handle}': {result}")
            else:
                logger.info(f"Agent '{agent.handle}' started successfully")

        self._running = True
        logger.info(f"Agent team started with {len(self._agents)} agents")

    async def stop(self) -> None:
        """
        Stop all agents in the team.

        Stops agents in parallel for efficiency.
        """
        if not self._running:
            return

        logger.info("Stopping agent team...")

        # Stop all agents in parallel
        stop_tasks = [agent.stop() for agent in self._agents.values()]
        await asyncio.gather(*stop_tasks, return_exceptions=True)

        self._running = False
        logger.info("Agent team stopped")

    def get_status(self) -> dict[str, Any]:
        """
        Get status of all agents.

        Returns:
            Dict with team status and per-agent status
        """
        return {
            "running": self._running,
            "agent_count": len(self._agents),
            "agents": {
                handle: agent.get_status()
                for handle, agent in self._agents.items()
            },
        }

    async def delegate_to_em(
        self,
        from_handle: str,
        subject: str,
        body: str,
        api_url: str | None = None,
    ) -> bool:
        """
        Delegate a task to the EM via agcom.

        This is the main entry point for the assistant to send work
        to the agent team.

        Args:
            from_handle: Handle of the delegating agent (e.g., assistant)
            subject: Task subject
            body: Task description
            api_url: Optional API URL override

        Returns:
            True if delegation succeeded
        """
        if "em" not in self._agents:
            logger.error("Cannot delegate - EM agent not configured")
            return False

        # Create a temporary client for the delegating agent
        settings = AgcomSettings(
            enabled=True,
            api_url=api_url or self.config.api_url,
            handle=from_handle,
            display_name=from_handle,
            auto_login=True,
            is_configured=True,
        )

        try:
            async with AgcomClient(settings) as client:
                await client.send_message(
                    to_handles=["em"],
                    subject=subject,
                    body=body,
                    tags=["delegation", "assistant-request"],
                )
                logger.info(f"Delegated task to EM: {subject}")
                return True
        except Exception as e:
            logger.error(f"Failed to delegate to EM: {e}")
            return False

    async def wait_for_completion(
        self,
        from_handle: str,
        timeout_seconds: float = 300,
        poll_interval: float = 2.0,
        api_url: str | None = None,
    ) -> str | None:
        """
        Wait for EM to report task completion.

        Polls for messages from EM with "task-complete" tag.

        Args:
            from_handle: Handle to receive completion on
            timeout_seconds: Max wait time
            poll_interval: Seconds between polls
            api_url: Optional API URL override

        Returns:
            Completion message body, or None on timeout
        """
        settings = AgcomSettings(
            enabled=True,
            api_url=api_url or self.config.api_url,
            handle=from_handle,
            display_name=from_handle,
            auto_login=True,
            is_configured=True,
        )

        import time

        start_time = time.time()

        try:
            async with AgcomClient(settings) as client:
                seen_messages = set()

                while time.time() - start_time < timeout_seconds:
                    messages = await client.list_messages(limit=20)

                    for msg in messages:
                        if msg.message_id in seen_messages:
                            continue
                        seen_messages.add(msg.message_id)

                        # Check if this is a completion from EM
                        if (
                            msg.from_handle == "em"
                            and from_handle in msg.to_handles
                            and msg.tags
                            and "task-complete" in msg.tags
                        ):
                            logger.info(f"Received completion from EM")
                            return msg.body

                    await asyncio.sleep(poll_interval)

                logger.warning(f"Timeout waiting for EM completion after {timeout_seconds}s")
                return None

        except Exception as e:
            logger.error(f"Error waiting for completion: {e}")
            return None
