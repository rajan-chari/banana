"""
LLM Client - PydanticAI-based assistant agent.

This module provides the core LLM interaction layer using PydanticAI.
Supports multiple providers: OpenAI, Azure OpenAI, Anthropic, Ollama, Groq.
"""

from dataclasses import dataclass

from pydantic import BaseModel
from pydantic_ai import Agent


@dataclass
class AssistantDependencies:
    """Dependencies injected into the agent at runtime."""

    user_id: str
    conversation_id: str
    # Future: permission_checker, tool_registry, script_executor


class AssistantResponse(BaseModel):
    """Structured response from the assistant."""

    message: str
    """The assistant's response message."""

    should_execute_script: bool = False
    """Whether the response contains a script that should be executed."""

    script_code: str | None = None
    """Python script code if should_execute_script is True."""

    script_description: str | None = None
    """Description of what the script does."""


# Create the main assistant agent
# Model can be configured via environment variable or config
assistant_agent = Agent(
    "openai:gpt-4o",  # Default model, can be overridden
    deps_type=AssistantDependencies,
    output_type=AssistantResponse,
    system_prompt="""You are a helpful local assistant running on the user's computer.
You have the ability to generate and execute Python scripts locally.

IMPORTANT: When a user asks you to:
- Read, write, or list files
- Make HTTP/network requests
- Run system commands
- Get system information (date, time, directories, etc.)
- Perform any task that can be done with Python code

You MUST generate a script. Set should_execute_script=True and provide the code.
Do NOT ask clarifying questions for simple tasks - use reasonable defaults.
For file operations without a specific path, use the current directory or a temp file.

Example: "read a file" → generate a script that reads a sample file or lists available files
Example: "what time is it" → generate a script that prints datetime.now()
Example: "list files" → generate a script using os.listdir('.')

For pure knowledge questions (like "what is Python?"), just answer directly.

Always be proactive about executing code. The user wants to see things happen.""",
)


async def chat(
    user_message: str,
    user_id: str,
    conversation_id: str,
    model: str | None = None,
) -> AssistantResponse:
    """
    Send a message to the assistant and get a structured response.

    Args:
        user_message: The user's input message
        user_id: Identifier for the user
        conversation_id: Identifier for the conversation
        model: Optional model override (e.g., "azure:gpt-4o", "ollama:llama3")

    Returns:
        AssistantResponse with message and optional script
    """
    deps = AssistantDependencies(
        user_id=user_id,
        conversation_id=conversation_id,
    )

    # Use specified model or default
    if model:
        with assistant_agent.override(model=model):
            result = await assistant_agent.run(user_message, deps=deps)
    else:
        result = await assistant_agent.run(user_message, deps=deps)
    
    return result.output


async def chat_simple(
    user_message: str,
    model: str | None = None,
) -> str:
    """
    Simple chat that returns just a string response.

    Args:
        user_message: The user's input message
        model: Optional model override

    Returns:
        String response from the assistant
    """
    # Create a simple text-only agent
    simple_agent = Agent(
        model or "openai:gpt-4o",
        system_prompt="You are a helpful assistant. Be concise.",
    )

    result = await simple_agent.run(user_message)
    return result.output
