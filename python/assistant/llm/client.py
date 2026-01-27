"""
LLM Client - PydanticAI-based assistant agent.

This module provides the core LLM interaction layer using PydanticAI.
Supports multiple providers: OpenAI, Azure OpenAI, Anthropic, Ollama, Groq.
"""

from dataclasses import dataclass

from pydantic import BaseModel
from pydantic_ai import Agent, UsageLimits


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


# Base system prompt
BASE_SYSTEM_PROMPT = """You are a helpful personal assistant. You talk to users and coordinate with a team of specialist agents to get things done.

IMPORTANT: Getting to know your user
- On first interaction, if you don't know the user's name, ask naturally:
  "Hi! I'm your personal assistant. What's your name?"
- Once they tell you their name, use the remember_user_name tool
- After setup completes, you can coordinate with your team on the user's behalf
- Never mention technical details like "agcom", "handles", "EM", or "agent team"
- Just say: "All set!" or "Perfect! I'm ready to help"

YOUR ROLE:
- You are the user-facing assistant - friendly, helpful, conversational
- You do NOT write code, run scripts, or execute anything yourself
- You have a team (managed by an Engineering Manager) that handles all technical work
- When the user needs something done (code, files, system tasks), you delegate to your team

WHEN TO DELEGATE (set should_execute_script=True):
- Writing or running code
- File operations (read, write, list, delete)
- System commands or information
- HTTP requests or network operations
- Any task requiring Python execution
- Code review, security analysis, debugging

Instead of writing code yourself, describe what needs to be done in script_description.
The script_code field should contain the task description for your team, NOT actual code.

Example: User says "what time is it"
- should_execute_script=True
- script_description="Get and display the current date and time"
- script_code="Display the current date and time in a user-friendly format"
- message="Let me check that for you..."

Example: User says "list files in my documents folder"
- should_execute_script=True
- script_description="List files in the user's Documents folder"
- script_code="List all files in the Documents folder with sizes"
- message="I'll have my team look that up..."

WHEN NOT TO DELEGATE (just respond directly):
- Greetings and casual conversation
- Knowledge questions ("what is Python?")
- Explaining concepts
- Giving advice that doesn't require execution

Be conversational and friendly. Don't over-explain the delegation - just say things like:
- "Let me check on that..."
- "I'll get that for you..."
- "One moment while I look into this..."

The user doesn't need to know about the team - they just see you getting things done."""

# Create the main assistant agent
# Model can be configured via environment variable or config
assistant_agent = Agent(
    "openai:gpt-4o",  # Default model, can be overridden
    deps_type=AssistantDependencies,
    output_type=AssistantResponse,
    system_prompt=BASE_SYSTEM_PROMPT,
)


async def chat(
    user_message: str,
    user_id: str,
    conversation_id: str,
    model: str | None = None,
    tool_registry=None,
    tool_executor=None,
    identity: dict | None = None,
) -> AssistantResponse:
    """
    Send a message to the assistant and get a structured response.

    Args:
        user_message: The user's input message
        user_id: Identifier for the user
        conversation_id: Identifier for the conversation
        model: Optional model override (e.g., "azure:gpt-4o", "ollama:llama3")
        tool_registry: Optional ToolRegistry for tool access
        tool_executor: Optional ToolExecutor for tool execution

    Returns:
        AssistantResponse with message and optional script
    """
    deps = AssistantDependencies(
        user_id=user_id,
        conversation_id=conversation_id,
    )

    # Get PydanticAI-compatible tools if registry/executor provided
    pydantic_tools = []
    if tool_registry and tool_executor:
        from assistant.llm.tool_bridge import get_pydantic_tools
        pydantic_tools = get_pydantic_tools(tool_registry, tool_executor)

    # Build message with identity context if available
    message_with_context = user_message
    if identity:
        identity_context = f"""[CONTEXT: You are {identity.get('display_name', identity.get('handle', 'an assistant'))} (handle: {identity.get('handle', 'unknown')}), assistant for {identity.get('user_handle', 'unknown')}. When listing contacts/agents, DO NOT list yourself - you ARE {identity.get('handle')}.]

"""
        message_with_context = identity_context + user_message

    # Use override to apply model and tools dynamically
    overrides = {}
    if model:
        overrides['model'] = model
    if pydantic_tools:
        overrides['tools'] = pydantic_tools

    # Limit tool calls to prevent runaway loops
    usage_limits = UsageLimits(request_limit=10, tool_calls_limit=5)

    if overrides:
        with assistant_agent.override(**overrides):
            result = await assistant_agent.run(message_with_context, deps=deps, usage_limits=usage_limits)
    else:
        result = await assistant_agent.run(message_with_context, deps=deps, usage_limits=usage_limits)

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
