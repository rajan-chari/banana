"""LLM client abstraction layer using PydanticAI."""

from assistant.llm.client import (
    AssistantDependencies,
    AssistantResponse,
    assistant_agent,
    chat,
    chat_simple,
)
from assistant.llm.config import (
    LLMConfig,
    LLMProvider,
    get_config,
    reload_config,
    set_config,
)
from assistant.llm.tool_bridge import (
    create_pydantic_tool,
    get_pydantic_tools,
)

__all__ = [
    "AssistantDependencies",
    "AssistantResponse",
    "assistant_agent",
    "chat",
    "chat_simple",
    "LLMConfig",
    "LLMProvider",
    "get_config",
    "reload_config",
    "set_config",
    "create_pydantic_tool",
    "get_pydantic_tools",
]
