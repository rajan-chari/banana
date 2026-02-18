"""
Coder agent - generates code from natural language descriptions.
"""

import logging
from typing import Any

from .base import BaseAgent, AgentConfig, AgentContext, AgentResponse
from .personas import CODER_PERSONA

logger = logging.getLogger(__name__)


class CoderAgent(BaseAgent):
    """
    Coder agent that generates code from natural language.

    Responsibilities:
    - Receive coding tasks from EM
    - Write clean, working Python code
    - Follow best practices
    - Report code back to EM for review
    """

    def __init__(
        self,
        api_url: str = "http://localhost:8700",
        model: str = "openai:gpt-5.1",
    ):
        """
        Initialize the Coder agent.

        Args:
            api_url: agcom API URL
            model: LLM model to use
        """
        config = AgentConfig(
            handle=CODER_PERSONA.handle,
            display_name=CODER_PERSONA.display_name,
            system_prompt=CODER_PERSONA.system_prompt,
            model=model,
            api_url=api_url,
            poll_interval_seconds=2.0,
        )
        super().__init__(config)

    async def process_message(
        self, context: AgentContext, message_body: str
    ) -> AgentResponse | None:
        """
        Process coding task and generate code.

        Args:
            context: Message context
            message_body: Task description

        Returns:
            AgentResponse with generated code
        """
        coding_prompt = f"""Task: {message_body}

Write Python code to accomplish this. Put it in a ```python block."""

        # Use raw LLM output - structured output fights with code blocks
        raw_output = await self._generate_raw_response(coding_prompt)

        # Wrap in AgentResponse for the messaging system
        return AgentResponse(
            message=raw_output,
            task_complete=False,  # Coder never completes - runner executes
        )

    def get_tools(self) -> list[Any]:
        """Coder doesn't need special tools - just generates code."""
        return []
