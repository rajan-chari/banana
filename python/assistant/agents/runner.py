"""
Runner agent - executes code and interprets results.
"""

import asyncio
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

from .base import BaseAgent, AgentConfig, AgentContext, AgentResponse
from .personas import RUNNER_PERSONA
from assistant.scripts import save_script

logger = logging.getLogger(__name__)

# Directory for persisting generated scripts
SCRIPTS_DIR = Path(os.getenv("AGCOM_SCRIPTS_DIR", "data/scripts"))

# Directory for execution artifacts (outputs, scripts, metadata)
ARTIFACTS_DIR = Path(os.getenv("AGCOM_ARTIFACTS_DIR", "data/artifacts"))

# Default execution timeout (seconds) - needs to be long enough for pip installs + network calls
DEFAULT_EXECUTION_TIMEOUT = int(os.getenv("AGCOM_EXECUTION_TIMEOUT", "90"))


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
        execution_timeout: int = DEFAULT_EXECUTION_TIMEOUT,
    ):
        """
        Initialize the Runner agent.

        Args:
            api_url: agcom API URL
            model: LLM model to use
            execution_timeout: Max seconds for code execution (default 90s, configurable via AGCOM_EXECUTION_TIMEOUT env var)
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
        # Extract task_id from message tags for artifact naming
        task_id = self._extract_task_id(context.incoming_message.tags)
        logger.info(f"[RUNNER] Processing message (task_id={task_id}), extracting code...")

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

        # Save the script for visibility/debugging
        try:
            saved = save_script(code, SCRIPTS_DIR, description=context.subject)
            logger.info(f"[RUNNER] Saved script to {saved.filepath}")
        except Exception as e:
            logger.warning(f"[RUNNER] Failed to save script: {e}")

        # Analyze code and send progress update to EM
        analysis = self._analyze_code(code)
        if analysis:
            logger.info(f"[RUNNER] Code analysis: {analysis}")
            # Send progress message to EM (non-blocking)
            await self._send_progress_to_em(context, analysis)

        # Execute the code
        logger.info("[RUNNER] Executing code...")
        result = await self._execute_code(code)
        logger.info(f"[RUNNER] Execution result: status={result['status']}, stdout={result.get('stdout', '')[:200]}, stderr={result.get('stderr', '')[:200]}")

        # Save artifacts (for both success and failure)
        artifact_dir = await self._save_artifact(task_id, code, result)

        # If execution failed, report error and don't mark complete
        if result['status'] != 'SUCCESS':
            error_msg = result.get('stderr') or result.get('stdout') or 'Unknown error'
            return AgentResponse(
                message=f"Code failed: {error_msg}\nArtifact: {artifact_dir}",
                task_complete=False,
            )

        # Success - report the output with artifact path and preview
        output = result.get('stdout', '').strip()
        preview = output[:500] + "..." if len(output) > 500 else output

        if output:
            return AgentResponse(
                message=f"Execution succeeded.\nArtifact: {artifact_dir}\nPreview:\n{preview}",
                task_complete=True,
            )
        else:
            return AgentResponse(
                message=f"Code ran successfully (no output).\nArtifact: {artifact_dir}",
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

    def _analyze_code(self, code: str) -> str | None:
        """
        Analyze code to predict what it will do.

        Returns a brief description for progress reporting.
        """
        hints = []

        # Check for package installs
        if "pip install" in code or "subprocess.check_call" in code:
            # Try to extract package names
            import re
            packages = re.findall(r'pip install["\s]+(\w+)', code)
            if packages:
                hints.append(f"installing {', '.join(packages)}")
            else:
                hints.append("may install packages")

        # Check for network operations
        network_libs = ["requests", "urllib", "httpx", "aiohttp", "yfinance", "pandas_datareader"]
        for lib in network_libs:
            if lib in code:
                hints.append(f"fetching data ({lib})")
                break

        # Check for file operations
        if "open(" in code and ("'w'" in code or '"w"' in code):
            hints.append("writing files")

        if not hints:
            return None

        return "Executing: " + ", ".join(hints)

    async def _send_progress_to_em(self, context: AgentContext, message: str) -> None:
        """Send a progress update to EM during execution."""
        try:
            # Send as a separate message to EM (the sender)
            await self.send_message(
                to_handle=context.sender_handle,
                subject=f"Progress: {context.subject[:30]}...",
                body=message,
                tags=["progress"] + (context.incoming_message.tags or []),
            )
        except Exception as e:
            logger.warning(f"[RUNNER] Failed to send progress to EM: {e}")

    def _extract_task_id(self, tags: list[str] | None) -> str:
        """Extract task ID from message tags, or generate a fallback."""
        if tags:
            for tag in tags:
                if tag.startswith("task-"):
                    return tag
        # Fallback: generate a unique ID based on timestamp
        import time
        return f"run-{int(time.time() * 1000)}"

    async def _save_artifact(self, task_id: str, code: str, result: dict) -> Path:
        """
        Save execution artifacts to filesystem.

        Args:
            task_id: Task identifier for directory naming
            code: The Python code that was executed
            result: Execution result dict with status, stdout, stderr, etc.

        Returns:
            Path to the artifact directory
        """
        artifact_dir = ARTIFACTS_DIR / task_id
        artifact_dir.mkdir(parents=True, exist_ok=True)

        # Save the script
        (artifact_dir / "script.py").write_text(code, encoding="utf-8")

        # Save stdout if present
        stdout = result.get("stdout", "")
        if stdout:
            (artifact_dir / "output.txt").write_text(stdout, encoding="utf-8")

        # Save stderr if present
        stderr = result.get("stderr", "")
        if stderr:
            (artifact_dir / "error.txt").write_text(stderr, encoding="utf-8")

        # Save metadata
        metadata = {
            "status": result.get("status"),
            "duration_ms": result.get("duration_ms"),
            "return_code": result.get("return_code"),
        }
        (artifact_dir / "result.json").write_text(
            json.dumps(metadata, indent=2), encoding="utf-8"
        )

        logger.info(f"[RUNNER] Saved artifacts to {artifact_dir}")
        return artifact_dir

    def get_tools(self) -> list[Any]:
        """Runner doesn't need LLM tools - it executes code directly."""
        return []
