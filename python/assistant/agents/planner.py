"""
Planner agent - breaks down complex tasks into steps.
"""

import logging
from typing import Any

from .base import BaseAgent, AgentConfig, AgentContext, AgentResponse
from .personas import PLANNER_PERSONA

logger = logging.getLogger(__name__)


class PlannerAgent(BaseAgent):
    """
    Planner agent that decomposes complex tasks.

    Responsibilities:
    - Analyze complex task descriptions
    - Break them into actionable steps
    - Identify dependencies
    - Flag ambiguities
    - Recommend team assignments
    """

    def __init__(
        self,
        api_url: str = "http://localhost:8700",
        model: str = "openai:gpt-5.1",
    ):
        """
        Initialize the Planner agent.

        Args:
            api_url: agcom API URL
            model: LLM model to use
        """
        config = AgentConfig(
            handle=PLANNER_PERSONA.handle,
            display_name=PLANNER_PERSONA.display_name,
            system_prompt=PLANNER_PERSONA.system_prompt,
            model=model,
            api_url=api_url,
            poll_interval_seconds=2.0,
        )
        super().__init__(config)

    async def process_message(
        self, context: AgentContext, message_body: str
    ) -> AgentResponse | None:
        """
        Break down a task into steps.

        Args:
            context: Message context
            message_body: Task to plan

        Returns:
            AgentResponse with task breakdown
        """
        planning_prompt = f"""Task planning requested by {context.sender_handle}:

Subject: {context.subject}
Task description:
{message_body}

Create a detailed plan:
1. Break the task into atomic, actionable steps
2. Identify dependencies between steps
3. Note any ambiguities or missing information
4. Recommend which team members should handle each step
   (coder, reviewer, security, runner)

The plan should be executable - each step should have clear inputs/outputs."""

        response = await self._generate_llm_response(planning_prompt)

        # Plans are deliverables - always mark complete
        response.task_complete = True
        return response

    def get_tools(self) -> list[Any]:
        """Planner relies on LLM reasoning, no special tools."""
        return []
