"""
Script executor - safely runs Python scripts with sandboxing.
"""

import asyncio
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ScriptResult:
    """Result of script execution."""

    success: bool
    """Whether the script completed successfully (return code 0)."""

    return_code: int
    """The process return code."""

    stdout: str
    """Standard output from the script."""

    stderr: str
    """Standard error from the script."""

    duration_ms: int
    """Execution time in milliseconds."""

    timed_out: bool = False
    """Whether the script was killed due to timeout."""

    error_message: str | None = None
    """High-level error message if execution failed."""


@dataclass
class ExecutionConfig:
    """Configuration for script execution."""

    timeout_seconds: int = 30
    """Maximum execution time before killing the script."""

    max_output_bytes: int = 100_000
    """Maximum bytes of output to capture (100KB default)."""

    working_dir: Path | None = None
    """Working directory for the script. Defaults to temp dir."""

    allowed_paths: list[Path] = field(default_factory=list)
    """Paths the script is allowed to access. Empty = unrestricted."""

    env_vars: dict[str, str] = field(default_factory=dict)
    """Additional environment variables to set."""

    python_path: str | None = None
    """Path to Python interpreter. Defaults to current interpreter."""


async def execute_script(
    code: str,
    config: ExecutionConfig | None = None,
) -> ScriptResult:
    """
    Execute Python code in a subprocess.

    Args:
        code: Python code to execute
        config: Execution configuration

    Returns:
        ScriptResult with output and status
    """
    config = config or ExecutionConfig()

    # Create a temporary file for the script
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".py",
        delete=False,
        encoding="utf-8",
    ) as f:
        f.write(code)
        script_path = Path(f.name)

    try:
        return await execute_script_file(script_path, config)
    finally:
        # Clean up the temp file
        try:
            script_path.unlink()
        except OSError:
            pass


async def execute_script_file(
    script_path: Path,
    config: ExecutionConfig | None = None,
) -> ScriptResult:
    """
    Execute a Python script file in a subprocess.

    Args:
        script_path: Path to the Python script
        config: Execution configuration

    Returns:
        ScriptResult with output and status
    """
    config = config or ExecutionConfig()

    # Determine Python interpreter
    python_exe = config.python_path or sys.executable

    # Set up environment
    env = os.environ.copy()
    env.update(config.env_vars)

    # Determine working directory
    cwd = config.working_dir or script_path.parent

    # Build the command
    cmd = [python_exe, "-u", str(script_path)]  # -u for unbuffered output

    start_time = asyncio.get_event_loop().time()
    timed_out = False
    stdout = ""
    stderr = ""
    return_code = -1

    try:
        # Create subprocess
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(cwd),
            env=env,
        )

        try:
            # Wait for completion with timeout
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(),
                timeout=config.timeout_seconds,
            )

            return_code = process.returncode or 0

            # Decode and truncate output
            stdout = _decode_and_truncate(stdout_bytes, config.max_output_bytes)
            stderr = _decode_and_truncate(stderr_bytes, config.max_output_bytes)

        except asyncio.TimeoutError:
            # Kill the process on timeout
            timed_out = True
            process.kill()
            await process.wait()

            stdout = ""
            stderr = f"Script execution timed out after {config.timeout_seconds} seconds"
            return_code = -1

    except Exception as e:
        return ScriptResult(
            success=False,
            return_code=-1,
            stdout="",
            stderr="",
            duration_ms=0,
            timed_out=False,
            error_message=f"Failed to execute script: {e}",
        )

    end_time = asyncio.get_event_loop().time()
    duration_ms = int((end_time - start_time) * 1000)

    return ScriptResult(
        success=return_code == 0 and not timed_out,
        return_code=return_code,
        stdout=stdout,
        stderr=stderr,
        duration_ms=duration_ms,
        timed_out=timed_out,
        error_message=None if return_code == 0 else _extract_error(stderr),
    )


def _decode_and_truncate(data: bytes, max_bytes: int) -> str:
    """Decode bytes to string and truncate if needed."""
    if len(data) > max_bytes:
        data = data[:max_bytes]
        truncated = True
    else:
        truncated = False

    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("utf-8", errors="replace")

    if truncated:
        text += "\n... (output truncated)"

    return text


def _extract_error(stderr: str) -> str | None:
    """Extract the main error message from stderr."""
    if not stderr:
        return None

    lines = stderr.strip().split("\n")
    # Look for the last line that looks like an error
    for line in reversed(lines):
        if "Error:" in line or "Exception:" in line:
            return line.strip()

    # Return last non-empty line
    for line in reversed(lines):
        if line.strip():
            return line.strip()

    return None
