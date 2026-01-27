"""
Reviewer agent - reviews code for bugs and improvements.
"""

import logging
from typing import Any

from .base import BaseAgent, AgentConfig, AgentContext, AgentResponse
from .personas import REVIEWER_PERSONA

logger = logging.getLogger(__name__)


class ReviewerAgent(BaseAgent):
    """
    Reviewer agent that reviews code for quality issues.

    Responsibilities:
    - Check code for bugs and logic errors
    - Suggest improvements for readability
    - Verify code meets requirements
    - Ensure good error handling
    """

    def __init__(
        self,
        api_url: str = "http://localhost:8700",
        model: str = "openai:gpt-5.1",
    ):
        """
        Initialize the Reviewer agent.

        Args:
            api_url: agcom API URL
            model: LLM model to use
        """
        config = AgentConfig(
            handle=REVIEWER_PERSONA.handle,
            display_name=REVIEWER_PERSONA.display_name,
            system_prompt=REVIEWER_PERSONA.system_prompt,
            model=model,
            api_url=api_url,
            poll_interval_seconds=2.0,
        )
        super().__init__(config)

    async def process_message(
        self, context: AgentContext, message_body: str
    ) -> AgentResponse | None:
        """
        Review code and provide feedback.

        Args:
            context: Message context
            message_body: Code to review

        Returns:
            AgentResponse with review results
        """
        review_prompt = f"""Code review requested by {context.sender_handle}:

Subject: {context.subject}
Code to review:
{message_body}

Perform a thorough review:
1. Does the code accomplish its stated goal?
2. Are there any bugs or logic errors?
3. Is error handling adequate?
4. Is the code readable and maintainable?
5. Are there edge cases that aren't handled?

Provide a verdict: APPROVED, CHANGES NEEDED, or BLOCKED."""

        response = await self._generate_llm_response(review_prompt)
        return response

    def get_tools(self) -> list[Any]:
        """Reviewer relies on LLM analysis, no special tools."""
        return []
