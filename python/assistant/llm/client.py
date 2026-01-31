"""
LLM Client - PydanticAI-based assistant agent.

This module provides the core LLM interaction layer using PydanticAI.
Supports multiple providers: OpenAI, Azure OpenAI, Anthropic, Ollama, Groq.
"""

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta

from pydantic import BaseModel
from pydantic_ai import Agent, UsageLimits
from pydantic_ai.messages import ModelMessage

logger = logging.getLogger(__name__)

# Conversation history storage
# Maps conversation_id -> list of ModelMessage
_conversation_history: dict[str, list[ModelMessage]] = defaultdict(list)
_conversation_timestamps: dict[str, datetime] = {}

# History settings
MAX_HISTORY_MESSAGES = 20  # Keep last N messages per conversation
HISTORY_EXPIRY_MINUTES = 60  # Clear history after inactivity


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
BASE_SYSTEM_PROMPT = """You are a helpful personal assistant with access to tools.

GETTING TO KNOW YOUR USER:
- On first interaction, ask for their name: "Hi! I'm your assistant. What's your name?"
- When they tell you, call remember_user_name with their name
- Never mention technical terms like "agcom", "handles", or "backend"

KEY TOOLS:
- remember_user_name: Call when user tells you their name
- send_task_to_team: Send tasks to your team for execution

USE send_task_to_team FOR:
- Screenshots, files, directories
- System info (time, date, etc.)
- Code execution
- Anything requiring action on user's machine

RESPOND DIRECTLY FOR:
- Greetings, conversation
- Knowledge questions
- Explanations, advice

Be friendly and concise. The user doesn't need to know about the team."""

# Create the main assistant agent
# Model can be configured via environment variable or config
assistant_agent = Agent(
    "openai:gpt-4o",  # Default model, can be overridden
    deps_type=AssistantDependencies,
    output_type=AssistantResponse,
    system_prompt=BASE_SYSTEM_PROMPT,
)


def _get_conversation_history(conversation_id: str) -> list[ModelMessage]:
    """
    Get conversation history for a conversation, clearing if expired.

    Args:
        conversation_id: Unique conversation identifier

    Returns:
        List of previous messages in this conversation
    """
    # Check if history exists and hasn't expired
    last_activity = _conversation_timestamps.get(conversation_id)
    if last_activity:
        if datetime.now() - last_activity > timedelta(minutes=HISTORY_EXPIRY_MINUTES):
            # History expired, clear it
            logger.info(f"[HISTORY] Conversation {conversation_id} expired, clearing history")
            _conversation_history[conversation_id] = []
            del _conversation_timestamps[conversation_id]
            return []

    return _conversation_history[conversation_id]


def _update_conversation_history(
    conversation_id: str,
    new_messages: list[ModelMessage],
) -> None:
    """
    Update conversation history with new messages.

    Args:
        conversation_id: Unique conversation identifier
        new_messages: New messages to add to history
    """
    history = _conversation_history[conversation_id]
    history.extend(new_messages)

    # Trim to max size (keep most recent)
    if len(history) > MAX_HISTORY_MESSAGES:
        _conversation_history[conversation_id] = history[-MAX_HISTORY_MESSAGES:]

    # Update timestamp
    _conversation_timestamps[conversation_id] = datetime.now()
    logger.info(f"[HISTORY] Conversation {conversation_id} now has {len(_conversation_history[conversation_id])} messages")


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

    # Log conversation input
    logger.info(f"[CONVERSATION] User message: {user_message}")
    if identity:
        logger.info(f"[CONVERSATION] Identity: {identity.get('handle')} for user {identity.get('user_handle')}")
    else:
        logger.info(f"[CONVERSATION] Identity: NOT CONFIGURED")
    logger.info(f"[CONVERSATION] Available tools: {[t.name for t in pydantic_tools]}")

    # Get conversation history
    history = _get_conversation_history(conversation_id)
    logger.info(f"[CONVERSATION] History: {len(history)} previous messages")

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
            result = await assistant_agent.run(
                message_with_context,
                deps=deps,
                usage_limits=usage_limits,
                message_history=history if history else None,
            )
    else:
        result = await assistant_agent.run(
            message_with_context,
            deps=deps,
            usage_limits=usage_limits,
            message_history=history if history else None,
        )

    # Update conversation history with new messages
    _update_conversation_history(conversation_id, result.new_messages())

    # Log conversation output
    logger.info(f"[CONVERSATION] LLM response message: {result.output.message}")
    if result.output.should_execute_script:
        logger.info(f"[CONVERSATION] LLM wants to execute script: {result.output.script_description}")

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
