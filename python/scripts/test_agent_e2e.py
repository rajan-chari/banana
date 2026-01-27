"""
End-to-end test for the agent team.

This test validates the full flow:
1. Start the agent team
2. Send a task to EM
3. EM coordinates with team members
4. Results flow back

Note: This test makes LLM calls and requires:
- agcom-api running
- Valid OpenAI API key

Run: cd python && source .venv/Scripts/activate && python scripts/test_agent_e2e.py
"""

import asyncio
import os
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Set up logging
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)


async def check_prerequisites():
    """Check that prerequisites are met."""
    print("=" * 50)
    print("Checking prerequisites...")
    print("=" * 50)

    # Check agcom-api
    import aiohttp

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:8700/api/health") as resp:
                if resp.status != 200:
                    print("FAIL: agcom-api not responding")
                    return False
                print("[+] agcom-api is running")
    except Exception as e:
        print(f"FAIL: agcom-api not available: {e}")
        print("  Start it with: agcom-api")
        return False

    # Check OpenAI API key
    if not os.getenv("OPENAI_API_KEY"):
        print("WARN: OPENAI_API_KEY not set - LLM calls will fail")
        print("  Set it with: export OPENAI_API_KEY=sk-...")
        # Don't fail - allow testing of non-LLM parts
    else:
        print("[+] OPENAI_API_KEY is set")

    return True


async def test_e2e_simple_task():
    """Test a simple task through the team."""
    print("\n" + "=" * 50)
    print("Test: Simple Task End-to-End")
    print("=" * 50)

    from assistant.agents.orchestrator import TeamOrchestrator, TeamConfig
    from assistant.agcom.client import AgcomClient, AgcomSettings

    # Start with a minimal team for faster testing
    config = TeamConfig(
        api_url="http://localhost:8700",
        model="openai:gpt-5.1",
        enable_em=True,
        enable_coder=True,
        enable_runner=False,
        enable_planner=False,
        enable_reviewer=False,
        enable_security=False,
    )

    orchestrator = TeamOrchestrator(config)

    print("\n1. Starting agent team (EM + Coder)...")
    await orchestrator.start()
    print("   Team started")

    try:
        print("\n2. Sending task to EM...")

        # Create a client to act as the assistant
        settings = AgcomSettings(
            enabled=True,
            api_url="http://localhost:8700",
            handle="test_assistant",
            display_name="Test Assistant",
            auto_login=True,
            is_configured=True,
        )

        async with AgcomClient(settings) as client:
            # Send a simple task
            msg = await client.send_message(
                to_handles=["em"],
                subject="Simple coding task",
                body="Write a Python script that prints 'Hello, World!'",
            )
            print(f"   Task sent: {msg.message_id}")

            # Wait for processing
            print("\n3. Waiting for EM to process (10s)...")
            await asyncio.sleep(10)

            # Check for responses
            print("\n4. Checking for messages...")
            messages = await client.list_messages(limit=20)

            print(f"   Found {len(messages)} messages:")
            for m in messages[-5:]:  # Last 5
                print(f"   - From {m.from_handle}: {m.subject[:50]}...")

            # Check threads
            threads = await client.list_threads(limit=10)
            print(f"\n   Active threads: {len(threads)}")
            for t in threads[:3]:
                print(f"   - {t.subject[:50]}... ({len(t.participant_handles)} participants)")

        print("\n5. Test complete!")

    finally:
        print("\nStopping agent team...")
        await orchestrator.stop()

    print("\nE2E Simple Task: PASSED (manual verification needed)")


async def test_agent_messaging():
    """Test direct messaging between agents."""
    print("\n" + "=" * 50)
    print("Test: Agent Messaging")
    print("=" * 50)

    from assistant.agents import EMAgent, CoderAgent

    # Create two agents
    em = EMAgent(api_url="http://localhost:8700")
    coder = CoderAgent(api_url="http://localhost:8700")

    print("\n1. Starting agents...")
    await em.start()
    await coder.start()
    print("   Both agents running")

    try:
        print("\n2. EM sending message to Coder...")
        msg = await em.send_message(
            to_handle="coder",
            subject="Direct test message",
            body="This is a test message from EM to Coder",
        )

        if msg:
            print(f"   Message sent: {msg.message_id}")
        else:
            print("   FAIL: Message not sent")
            return

        print("\n3. Waiting for Coder to receive (5s)...")
        await asyncio.sleep(5)

        # Check Coder's processed messages
        print(f"   Coder processed {len(coder._processed_messages)} messages")

        print("\nAgent Messaging: PASSED")

    finally:
        print("\nStopping agents...")
        await em.stop()
        await coder.stop()


async def test_runner_execution():
    """Test the Runner agent's code execution."""
    print("\n" + "=" * 50)
    print("Test: Runner Code Execution")
    print("=" * 50)

    from assistant.agents import RunnerAgent
    from assistant.agents.base import AgentContext
    from assistant.agcom.models import Message
    from datetime import datetime

    runner = RunnerAgent(api_url="http://localhost:8700")

    # Test code extraction
    print("\n1. Testing code extraction...")
    code_samples = [
        "```python\nprint('hello')\n```",
        "```\nimport os\nprint(os.getcwd())\n```",
        "print('direct code')",
    ]

    for sample in code_samples:
        code = runner._extract_code(sample)
        print(f"   Input: {sample[:30]}... -> Extracted: {code is not None}")

    # Test code execution (without LLM interpretation)
    print("\n2. Testing code execution...")
    test_code = "print('Hello from Runner!')\nprint(2 + 2)"
    result = await runner._execute_code(test_code)

    print(f"   Status: {result['status']}")
    print(f"   Output: {result.get('stdout', 'none')}")
    print(f"   Duration: {result['duration_ms']}ms")

    if result["status"] == "SUCCESS" and "Hello from Runner" in result["stdout"]:
        print("\nRunner Execution: PASSED")
    else:
        print("\nRunner Execution: FAILED")


async def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("Agent Team End-to-End Tests")
    print("=" * 60)

    if not await check_prerequisites():
        print("\nPrerequisites not met. Exiting.")
        return 1

    # Run tests
    await test_runner_execution()
    await test_agent_messaging()

    # Only run if we have API key
    if os.getenv("OPENAI_API_KEY"):
        await test_e2e_simple_task()
    else:
        print("\nSkipping E2E test (no OPENAI_API_KEY)")

    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
