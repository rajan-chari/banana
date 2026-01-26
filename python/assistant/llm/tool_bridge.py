"""
Bridge between ToolRegistry and PydanticAI tools.

Converts assistant Tool objects into PydanticAI-callable functions.
"""

import logging
from typing import Any

from pydantic_ai import RunContext
from pydantic_ai.tools import Tool as PydanticTool

from assistant.tools.registry import ToolRegistry, Tool
from assistant.tools.executor import ToolExecutor

logger = logging.getLogger(__name__)


def create_pydantic_tool(
    tool: Tool,
    executor: ToolExecutor,
) -> PydanticTool:
    """
    Convert a ToolRegistry Tool into a PydanticAI Tool.

    Args:
        tool: The tool from the registry
        executor: ToolExecutor to run the tool

    Returns:
        PydanticAI Tool instance
    """
    # Create wrapper function dynamically
    async def tool_wrapper(ctx: RunContext[Any], **kwargs) -> str:
        """Dynamically created tool wrapper."""
        # Execute the tool with provided parameters
        result = await executor.execute(tool.name, parameters=kwargs)

        if result.success:
            return result.output or "Tool executed successfully (no output)"
        else:
            error_msg = f"Tool execution failed: {result.error}"
            logger.error(error_msg)
            return error_msg

    # Set function metadata for PydanticAI
    tool_wrapper.__name__ = tool.name
    tool_wrapper.__doc__ = tool.description

    # Add parameter annotations dynamically
    annotations = {"ctx": "RunContext[Any]", "return": str}
    for param in tool.parameters:
        # Map our ParameterType to Python types
        param_type = _map_parameter_type(param.param_type.value)

        # Add to annotations
        if param.required:
            annotations[param.name] = param_type
        else:
            # Optional with default
            annotations[param.name] = f"{param_type} | None"

    tool_wrapper.__annotations__ = annotations

    # Create PydanticAI tool
    pydantic_tool = PydanticTool(
        tool_wrapper,
        name=tool.name,
        description=tool.description,
    )

    return pydantic_tool


def _map_parameter_type(param_type_str: str) -> str:
    """Map our ParameterType to Python type annotation string."""
    mapping = {
        "string": "str",
        "integer": "int",
        "float": "float",
        "boolean": "bool",
        "list": "list[str]",
        "path": "str",
    }
    return mapping.get(param_type_str, "str")


def get_pydantic_tools(
    registry: ToolRegistry,
    executor: ToolExecutor,
) -> list[PydanticTool]:
    """
    Convert all enabled tools from registry to PydanticAI tools.

    Args:
        registry: Tool registry containing tools
        executor: Tool executor for running tools

    Returns:
        List of PydanticAI Tool instances
    """
    tools = []

    for tool in registry.list_all(enabled_only=True):
        try:
            pydantic_tool = create_pydantic_tool(tool, executor)
            tools.append(pydantic_tool)
            logger.debug(f"Converted tool '{tool.name}' to PydanticAI format")
        except Exception as e:
            logger.error(f"Failed to convert tool '{tool.name}': {e}", exc_info=True)

    logger.info(f"Converted {len(tools)} tools for LLM use")
    return tools
