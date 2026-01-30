"""
Runner agent - executes code and interprets results.
"""

import asyncio
import logging
import tempfile
from pathlib import Path
from typing import Any

from .base import BaseAgent, AgentConfig, AgentContext, AgentResponse
from .personas import RUNNER_PERSONA

logger = logging.getLogger(__name__)


class RunnerAgent(BaseAgent):
    """
    Runner agent that executes code and reports results.

    Responsibilities:
    - Receive approved code from EM
    - Execute it in a safe environment
    - Capture output and errors
    - Interpret and report results
    """

    def __init__(
        self,
        api_url: str = "http://localhost:8700",
        model: str = "openai:gpt-5.1",
        execution_timeout: int = 30,
    ):
        """
        Initialize the Runner agent.

        Args:
            api_url: agcom API URL
            model: LLM model to use
            execution_timeout: Max seconds for code execution
        """
        config = AgentConfig(
            handle=RUNNER_PERSONA.handle,
            display_name=RUNNER_PERSONA.display_name,
            system_prompt=RUNNER_PERSONA.system_prompt,
            model=model,
            api_url=api_url,
            poll_interval_seconds=2.0,
        )
        super().__init__(config)
        self._execution_timeout = execution_timeout

    async def process_message(
        self, context: AgentContext, message_body: str
    ) -> AgentResponse | None:
        """
        Execute code and report results.

        Args:
            context: Message context
            message_body: Message containing code to execute

        Returns:
            AgentResponse with execution results
        """
        logger.info(f"[RUNNER] Processing message, extracting code...")

        # Extract code from the message (uses LLM to clean it up)
        code = await self._extract_code(message_body)

        if not code:
            logger.info("[RUNNER] No code found in message")
            return AgentResponse(
                message="No code found in the message to execute. Please provide Python code in a code block.",
                task_complete=False,
            )

        logger.info(f"[RUNNER] Extracted code ({len(code)} chars):\n{code[:500]}")

        # Check syntax first
        syntax_error = self._check_syntax(code)
        if syntax_error:
            logger.info(f"[RUNNER] Syntax error: {syntax_error}")
            return AgentResponse(
                message=f"Syntax error in code: {syntax_error}",
                task_complete=False,
            )

        # Execute the code
        logger.info("[RUNNER] Executing code...")
        result = await self._execute_code(code)
        logger.info(f"[RUNNER] Execution result: status={result['status']}, stdout={result.get('stdout', '')[:200]}, stderr={result.get('stderr', '')[:200]}")

        # If execution failed, report error and don't mark complete
        if result['status'] != 'SUCCESS':
            return AgentResponse(
                message=f"Code failed: {result.get('stderr') or result.get('stdout') or 'Unknown error'}",
                task_complete=False,
            )

        # Success - report the output
        output = result.get('stdout', '').strip()
        return AgentResponse(
            message=output if output else "Code ran successfully (no output)",
            task_complete=True,
        )

    async def _extract_code(self, message: str) -> str | None:
        """
        Extract Python code from a message using LLM.

        The LLM cleans up any prose mixed into code blocks.
        """
        # Quick check - is there any code-like content?
        code_indicators = ["import ", "def ", "class ", "print(", "from ", "```"]
        if not any(indicator in message for indicator in code_indicators):
            return None

        # Use LLM to extract and clean the code
        extraction_prompt = f"""Extract the Python code from this message. Return ONLY valid Python code, nothing else.

If there's prose mixed into the code, remove it. If there are syntax errors you can fix, fix them.

Message:
{message}

Return only the Python code, no markdown, no explanation."""

        response = await self._generate_llm_response(extraction_prompt)

        # The response.message should be clean Python code
        code = response.message.strip()

        # Remove markdown code fences if LLM included them
        if code.startswith("```python"):
            code = code[9:]
        if code.startswith("```"):
            code = code[3:]
        if code.endswith("```"):
            code = code[:-3]

        return code.strip() if code else None

    def _check_syntax(self, code: str) -> str | None:
        """
        Check Python code for syntax errors before execution.

        Returns error message if syntax is invalid, None if OK.
        """
        import ast

        try:
            ast.parse(code)
            return None
        except SyntaxError as e:
            return f"Line {e.lineno}: {e.msg}"

    async def _execute_code(self, code: str) -> dict[str, Any]:
        """
        Execute Python code in a subprocess.

        Args:
            code: Python code to execute

        Returns:
            Dict with status, stdout, stderr, duration
        """
        import time

        # Write code to temp file
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False
        ) as f:
            f.write(code)
            temp_path = Path(f.name)

        start_time = time.time()
        try:
            # Run in subprocess with timeout
            process = await asyncio.create_subprocess_exec(
                "python",
                str(temp_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=self._execution_timeout,
                )

                duration_ms = int((time.time() - start_time) * 1000)

                return {
                    "status": "SUCCESS" if process.returncode == 0 else "FAILED",
                    "return_code": process.returncode,
                    "stdout": stdout.decode("utf-8", errors="replace")[:10000],
                    "stderr": stderr.decode("utf-8", errors="replace")[:10000],
                    "duration_ms": duration_ms,
                }

            except asyncio.TimeoutError:
                process.kill()
                return {
                    "status": "TIMEOUT",
                    "stdout": "",
                    "stderr": f"Execution timed out after {self._execution_timeout}s",
                    "duration_ms": self._execution_timeout * 1000,
                }

        except Exception as e:
            return {
                "status": "ERROR",
                "stdout": "",
                "stderr": str(e),
                "duration_ms": int((time.time() - start_time) * 1000),
            }
        finally:
            # Clean up temp file
            try:
                temp_path.unlink()
            except Exception:
                pass

    def get_tools(self) -> list[Any]:
        """Runner doesn't need LLM tools - it executes code directly."""
        return []
