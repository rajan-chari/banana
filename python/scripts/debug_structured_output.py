"""Test if structured output causes tool looping."""

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
    async def tool_func() -> str:
        call_counts[name] = call_counts.get(name, 0) + 1
        logger.info(f"[TOOL] {name} called (count: {call_counts[name]})")
        return response

    tool_func.__name__ = name
    tool_func.__doc__ = description
    return tool_func


async def test_agent(name: str, agent: Agent, prompt: str):
    global call_counts
    call_counts = {}

    logger.info(f"\n{'='*60}")
    logger.info(f"TESTING: {name}")
    logger.info(f"{'='*60}")

    try:
        result = await agent.run(
            prompt,
            usage_limits=UsageLimits(request_limit=10, tool_calls_limit=5),
        )
        output = result.output
        if hasattr(output, 'message'):
            logger.info(f"FINAL: {output.message}")
        else:
            logger.info(f"FINAL: {output}")
        logger.info(f"TOOL CALLS: {call_counts}")
    except Exception as e:
        logger.error(f"ERROR: {e}")
        logger.info(f"TOOL CALLS BEFORE ERROR: {call_counts}")


async def main():
    tool_response = "Found 1 contact: bob_assistant (Bob's Assistant)"

    models_to_test = [
        "gpt-5.1",
    ]

    for model in models_to_test:
        try:
            agent = Agent(
                f"openai:{model}",
                output_type=AssistantResponse,
                system_prompt="You are a helpful assistant.",
                tools=[make_tool("list_contacts", "List all available agents", tool_response)],
            )
            await test_agent(f"{model} + structured output", agent, "list agents")
        except Exception as e:
            logger.error(f"{model}: {e}")


if __name__ == "__main__":
    asyncio.run(main())
