"""Test if error responses cause LLM to retry."""

import asyncio
import logging
from pydantic import BaseModel
from pydantic_ai import Agent, UsageLimits

logging.basicConfig(level=logging.INFO, format='%(name)s - %(message)s')
logger = logging.getLogger(__name__)

call_counts = {}


class AssistantResponse(BaseModel):
    message: str
    should_execute_script: bool = False
    script_code: str | None = None
    script_description: str | None = None


def make_tool(name: str, description: str, response: str):
    """Create a tool with a specific response."""
    async def tool_func() -> str:
        call_counts[name] = call_counts.get(name, 0) + 1
        logger.info(f"[TOOL] {name} called (count: {call_counts[name]})")
        return response

    tool_func.__name__ = name
    tool_func.__doc__ = description
    return tool_func


async def test_with_response(response_type: str, response: str):
    """Test how LLM handles different tool responses."""
    global call_counts
    call_counts = {}

    agent = Agent(
        "openai:gpt-5.2",
        output_type=AssistantResponse,
        system_prompt="You are a helpful assistant. Use tools when asked.",
        tools=[
            make_tool("list_contacts", "List all available agents", response),
        ],
    )

    logger.info(f"\n{'='*60}")
    logger.info(f"TESTING: {response_type}")
    logger.info(f"RESPONSE: {response[:80]}...")
    logger.info(f"{'='*60}")

    try:
        result = await agent.run(
            "list agents",
            usage_limits=UsageLimits(request_limit=10, tool_calls_limit=5),
        )
        logger.info(f"FINAL: {result.output.message}")
        logger.info(f"TOOL CALLS: {call_counts}")
    except Exception as e:
        logger.error(f"ERROR: {e}")
        logger.info(f"TOOL CALLS BEFORE ERROR: {call_counts}")


async def main():
    # Test 1: Normal success response
    await test_with_response(
        "SUCCESS",
        "Found 1 contact(s):\n\nHandle: bob_assistant\n  Display Name: Bob's Assistant\n"
    )

    # Test 2: Empty result
    await test_with_response(
        "EMPTY",
        "No contacts found in address book."
    )

    # Test 3: Error message (like what tool_bridge returns on failure)
    await test_with_response(
        "ERROR STRING",
        "Tool execution failed: AgcomError: agcom integration is disabled in settings"
    )

    # Test 4: Traceback (what subprocess errors look like)
    await test_with_response(
        "TRACEBACK",
        """Tool execution failed: Traceback (most recent call last):
  File "/tmp/script.py", line 30, in <module>
    asyncio.run(main())
  File "client.py", line 112, in _ensure_authenticated
    raise AgcomError("agcom integration is disabled in settings")
AgcomError: agcom integration is disabled in settings"""
    )


if __name__ == "__main__":
    asyncio.run(main())
