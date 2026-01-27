"""
Security agent - analyzes code for safety issues.
"""

import logging
from typing import Any

from .base import BaseAgent, AgentConfig, AgentContext, AgentResponse
from .personas import SECURITY_PERSONA

logger = logging.getLogger(__name__)


class SecurityAgent(BaseAgent):
    """
    Security agent that analyzes code for safety issues.

    Responsibilities:
    - Review code for security vulnerabilities
    - Identify dangerous operations
    - Flag privacy concerns
    - Assess risk levels
    - Recommend mitigations
    """

    def __init__(
        self,
        api_url: str = "http://localhost:8700",
        model: str = "openai:gpt-5.1",
    ):
        """
        Initialize the Security agent.

        Args:
            api_url: agcom API URL
            model: LLM model to use
        """
        config = AgentConfig(
            handle=SECURITY_PERSONA.handle,
            display_name=SECURITY_PERSONA.display_name,
            system_prompt=SECURITY_PERSONA.system_prompt,
            model=model,
            api_url=api_url,
            poll_interval_seconds=2.0,
        )
        super().__init__(config)

    async def process_message(
        self, context: AgentContext, message_body: str
    ) -> AgentResponse | None:
        """
        Analyze code for security issues.

        Args:
            context: Message context
            message_body: Code to analyze

        Returns:
            AgentResponse with security analysis
        """
        analysis_prompt = f"""Security review requested by {context.sender_handle}:

Subject: {context.subject}
Content to analyze:
{message_body}

Perform a security analysis:
1. Identify all operations (file, network, shell, etc.)
2. Assess each operation's risk level
3. Look for common vulnerabilities (injection, path traversal, etc.)
4. Check for credential/PII handling
5. Provide a verdict (SAFE/LOW/MEDIUM/HIGH/CRITICAL)

Be thorough but practical for local script execution."""

        response = await self._generate_llm_response(analysis_prompt)
        return response

    def get_tools(self) -> list[Any]:
        """Security agent relies on LLM analysis, no special tools."""
        return []
