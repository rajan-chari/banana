"""
Tool Executor - Execute registered tools with parameter injection.
"""

import ast
import asyncio
import logging
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from assistant.tools.registry import Tool, ToolRegistry
from assistant.tools.storage import ToolStorage

logger = logging.getLogger(__name__)


@dataclass
class ToolExecutionResult:
    """Result of a tool execution."""
    
    success: bool
    """Whether execution succeeded."""
    
    output: str
    """Stdout from the tool."""
    
    error: str
    """Stderr from the tool."""
    
    return_code: int
    """Process return code."""
    
    duration_ms: int
    """Execution time in milliseconds."""
    
    tool_name: str
    """Name of the executed tool."""
    
    parameters_used: dict
    """Parameters that were passed."""


class ToolExecutor:
    """
    Executes registered tools with parameter injection.
    
    Parameters are injected by prepending variable assignments
    to the tool's source code before execution.
    """
    
    def __init__(
        self,
        registry: ToolRegistry,
        storage: ToolStorage,
        timeout_seconds: int = 30,
        max_output_bytes: int = 100_000,
    ):
        self.registry = registry
        self.storage = storage
        self.timeout_seconds = timeout_seconds
        self.max_output_bytes = max_output_bytes
    
    async def execute(
        self,
        tool_name: str,
        parameters: dict | None = None,
    ) -> ToolExecutionResult:
        """
        Execute a tool by name with the given parameters.
        
        Args:
            tool_name: Name of the tool to execute
            parameters: Dict of parameter name -> value
        
        Returns:
            ToolExecutionResult with output and status
        """
        parameters = parameters or {}
        start_time = datetime.now()
        
        # Get the tool
        tool = self.registry.get_by_name(tool_name)
        if not tool:
            return ToolExecutionResult(
                success=False,
                output="",
                error=f"Tool '{tool_name}' not found",
                return_code=-1,
                duration_ms=0,
                tool_name=tool_name,
                parameters_used=parameters,
            )
        
        if not tool.enabled:
            return ToolExecutionResult(
                success=False,
                output="",
                error=f"Tool '{tool_name}' is disabled",
                return_code=-1,
                duration_ms=0,
                tool_name=tool_name,
                parameters_used=parameters,
            )
        
        # Validate parameters
        validation_error = self._validate_parameters(tool, parameters)
        if validation_error:
            return ToolExecutionResult(
                success=False,
                output="",
                error=validation_error,
                return_code=-1,
                duration_ms=0,
                tool_name=tool_name,
                parameters_used=parameters,
            )
        
        # Build executable code with parameter injection
        executable_code = self._inject_parameters(tool.source_code, parameters)
        
        # Execute in subprocess
        try:
            result = await self._run_code(executable_code)
            
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            
            # Update usage stats
            self.registry.increment_usage(tool.id)
            self.storage.update_usage(tool.id)
            
            logger.info(f"Executed tool '{tool_name}': success={result['success']}, duration={duration_ms}ms")
            
            return ToolExecutionResult(
                success=result["success"],
                output=result["stdout"],
                error=result["stderr"],
                return_code=result["return_code"],
                duration_ms=duration_ms,
                tool_name=tool_name,
                parameters_used=parameters,
            )
            
        except asyncio.TimeoutError:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            return ToolExecutionResult(
                success=False,
                output="",
                error=f"Tool execution timed out after {self.timeout_seconds} seconds",
                return_code=-1,
                duration_ms=duration_ms,
                tool_name=tool_name,
                parameters_used=parameters,
            )
        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            logger.error(f"Tool execution failed: {e}", exc_info=True)
            return ToolExecutionResult(
                success=False,
                output="",
                error=str(e),
                return_code=-1,
                duration_ms=duration_ms,
                tool_name=tool_name,
                parameters_used=parameters,
            )
    
    def _validate_parameters(self, tool: Tool, parameters: dict) -> str | None:
        """
        Validate parameters against tool definition.
        
        Returns error message if validation fails, None if OK.
        """
        # Check required parameters
        for param in tool.parameters:
            if param.required and param.name not in parameters:
                if param.default is None:
                    return f"Missing required parameter: {param.name}"
        
        # Check for unknown parameters (warning only, don't fail)
        known_params = {p.name for p in tool.parameters}
        for name in parameters:
            if name not in known_params:
                logger.warning(f"Unknown parameter '{name}' for tool '{tool.name}'")
        
        return None
    
    def _inject_parameters(self, source_code: str, parameters: dict) -> str:
        """
        Inject parameters into source code.
        
        Prepends variable assignments for each parameter.
        """
        if not parameters:
            return source_code
        
        # Build parameter assignments
        assignments = []
        for name, value in parameters.items():
            # Safe repr for the value
            assignments.append(f"{name} = {repr(value)}")
        
        # Prepend to source code
        param_block = "\n".join(assignments)
        return f"# Injected parameters\n{param_block}\n\n# Tool code\n{source_code}"
    
    async def _run_code(self, code: str) -> dict:
        """Run code in a subprocess and return results."""
        # Write to temp file
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".py",
            delete=False,
            encoding="utf-8",
        ) as f:
            f.write(code)
            temp_path = Path(f.name)
        
        try:
            # Run in subprocess
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                str(temp_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=temp_path.parent,
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=self.timeout_seconds,
            )
            
            # Decode and truncate output
            stdout_str = stdout.decode("utf-8", errors="replace")
            stderr_str = stderr.decode("utf-8", errors="replace")
            
            if len(stdout_str) > self.max_output_bytes:
                stdout_str = stdout_str[:self.max_output_bytes] + "\n... (output truncated)"
            if len(stderr_str) > self.max_output_bytes:
                stderr_str = stderr_str[:self.max_output_bytes] + "\n... (output truncated)"
            
            return {
                "success": process.returncode == 0,
                "stdout": stdout_str,
                "stderr": stderr_str,
                "return_code": process.returncode or 0,
            }
            
        finally:
            # Clean up temp file
            try:
                temp_path.unlink()
            except Exception:
                pass
    
    def execute_sync(
        self,
        tool_name: str,
        parameters: dict | None = None,
    ) -> ToolExecutionResult:
        """Synchronous wrapper for execute()."""
        return asyncio.run(self.execute(tool_name, parameters))
