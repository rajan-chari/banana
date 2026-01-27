"""Debug script to investigate LLM tool call looping."""

import asyncio
import logging
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from pydantic import BaseModel
from pydantic_ai import Agent, UsageLimits

from assistant.tools.registry import ToolRegistry
from assistant.tools.storage import ToolStorage
from assistant.tools.executor import ToolExecutor
from assistant.llm.tool_bridge import get_pydantic_tools

logging.basicConfig(level=logging.INFO, format='%(name)s - %(message)s')
logger = logging.getLogger(__name__)

# Use real tools or mock?
USE_REAL_TOOLS = "--real" in sys.argv

call_counts = {}

class AssistantResponse(BaseModel):
    """Same structured output as the real agent."""
    message: str
    should_execute_script: bool = False
    script_code: str | None = None
    script_description: str | None = None


# Mock tools for comparison
TOOL_RESPONSES = {
    "get_agcom_inbox": "No messages in inbox.",
    "list_agcom_contacts": "Found 1 contact(s):\n\nHandle: rajan_assistant\n  Display Name: Rajan's Assistant\n",
}


def make_mock_tool(name: str, description: str):
    """Create a mock tool that returns canned responses."""
    async def tool_func() -> str:
        call_counts[name] = call_counts.get(name, 0) + 1
        response = TOOL_RESPONSES.get(name, f"{name} executed successfully")
        logger.info(f"[MOCK TOOL] {name} called (count: {call_counts[name]}), returning: {response[:100]}")
        return response

    tool_func.__name__ = name
    tool_func.__doc__ = description
    return tool_func


def setup_real_tools():
    """Set up real tool registry and executor."""
    data_dir = Path(__file__).parent.parent / "data"
    tool_registry = ToolRegistry()
    tool_storage = ToolStorage(data_dir / "tools.db")
    tool_storage.load_into_registry(tool_registry)
    tool_executor = ToolExecutor(tool_registry, tool_storage)
    return get_pydantic_tools(tool_registry, tool_executor)


def setup_mock_tools():
    """Set up mock tools."""
    return [
        make_mock_tool("get_agcom_inbox", "Get recent messages from inbox"),
        make_mock_tool("list_agcom_contacts", "List all available agents"),
    ]


# Create agent
tools = setup_real_tools() if USE_REAL_TOOLS else setup_mock_tools()
logger.info(f"Using {'REAL' if USE_REAL_TOOLS else 'MOCK'} tools: {[t.name for t in tools]}")

agent = Agent(
    "openai:gpt-5.2",
    output_type=AssistantResponse,
    system_prompt="""You are a helpful local assistant running on the user's computer.

IMPORTANT: Getting to know your user
- On first interaction, if you don't know the user's name, ask naturally
- After setup completes, you can communicate with other agents on the user's behalf

Agent communication:
- You can send messages to other assistants
- Use communication tools internally but don't expose technical details
""",
    tools=tools,
)


async def test_scenario(prompt: str, identity: dict | None = None):
    """Test a prompt and see how many tool calls happen."""
    global call_counts
    call_counts = {}

    message = prompt
    if identity:
        context = f"[CONTEXT: You are {identity['display_name']} (handle: {identity['handle']}), assistant for {identity['user_handle']}.]"
        message = context + "\n\n" + prompt

    logger.info(f"\n{'='*60}")
    logger.info(f"PROMPT: {prompt}")
    logger.info(f"WITH IDENTITY: {identity is not None}")
    logger.info(f"{'='*60}")

    try:
        result = await agent.run(
            message,
            usage_limits=UsageLimits(request_limit=10, tool_calls_limit=5),
        )
        logger.info(f"\nFINAL RESPONSE: {result.output.message}")
        logger.info(f"TOOL CALL COUNTS: {call_counts}")
    except Exception as e:
        logger.error(f"\nERROR: {e}")
        logger.info(f"TOOL CALL COUNTS BEFORE ERROR: {call_counts}")


async def main():
    # Test 1: Simple "any agents?" without identity
    await test_scenario("any agents?")

    print("\n" + "="*80 + "\n")

    # Test 2: Same with identity context
    await test_scenario(
        "any agents?",
        identity={
            "handle": "rajan_assistant",
            "user_handle": "rajan",
            "display_name": "Rajan's Assistant",
        }
    )

    print("\n" + "="*80 + "\n")

    # Test 3: "this is rajan" - the problematic case
    await test_scenario("this is rajan")


if __name__ == "__main__":
    asyncio.run(main())
