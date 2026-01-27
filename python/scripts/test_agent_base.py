"""
Test script for agent base components.

Tests:
1. Persona loading
2. AgentConfig creation
3. AgentResponse model
4. BaseAgent instantiation (without running)

Run: cd python && source .venv/Scripts/activate && python scripts/test_agent_base.py
"""

import asyncio
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_personas():
    """Test persona loading."""
    print("\n=== Testing Personas ===")

    from assistant.agents.personas import PERSONAS, get_persona, list_personas

    # Check all personas exist
    expected = ["em", "planner", "coder", "reviewer", "security", "runner"]
    for handle in expected:
        persona = get_persona(handle)
        assert persona is not None, f"Persona '{handle}' not found"
        assert persona.handle == handle
        assert persona.display_name
        assert persona.system_prompt
        print(f"  OK: {handle} -> {persona.display_name}")

    # Check list_personas
    all_personas = list_personas()
    assert len(all_personas) == 6, f"Expected 6 personas, got {len(all_personas)}"
    print(f"  OK: list_personas() returned {len(all_personas)} personas")

    print("Personas: PASSED")


def test_agent_config():
    """Test AgentConfig creation."""
    print("\n=== Testing AgentConfig ===")

    from assistant.agents.base import AgentConfig, AgentState

    # Create config
    config = AgentConfig(
        handle="test_agent",
        display_name="Test Agent",
        system_prompt="You are a test agent.",
        model="openai:gpt-5.1",
        api_url="http://localhost:8700",
    )

    assert config.handle == "test_agent"
    assert config.display_name == "Test Agent"
    assert config.poll_interval_seconds == 2.0  # default
    assert config.max_tool_calls == 5  # default
    print(f"  OK: AgentConfig created with handle={config.handle}")

    # Check AgentState enum
    assert AgentState.STOPPED.value == "stopped"
    assert AgentState.RUNNING.value == "running"
    print("  OK: AgentState enum values correct")

    print("AgentConfig: PASSED")


def test_agent_response():
    """Test AgentResponse model."""
    print("\n=== Testing AgentResponse ===")

    from assistant.agents.base import AgentResponse

    # Basic response
    resp = AgentResponse(message="Hello")
    assert resp.message == "Hello"
    assert resp.action_needed == False
    assert resp.target_agent is None
    assert resp.task_complete == False
    print("  OK: Basic AgentResponse created")

    # Delegation response
    resp = AgentResponse(
        message="Delegating to coder",
        action_needed=True,
        target_agent="coder",
    )
    assert resp.action_needed == True
    assert resp.target_agent == "coder"
    print("  OK: Delegation AgentResponse created")

    # Completion response
    resp = AgentResponse(
        message="Task done",
        task_complete=True,
    )
    assert resp.task_complete == True
    print("  OK: Completion AgentResponse created")

    print("AgentResponse: PASSED")


def test_em_agent_creation():
    """Test EMAgent instantiation."""
    print("\n=== Testing EMAgent Creation ===")

    from assistant.agents.em import EMAgent
    from assistant.agents.base import AgentState

    # Create EM agent
    em = EMAgent(api_url="http://localhost:8700")

    assert em.handle == "em"
    assert em.config.display_name == "Engineering Manager"
    assert em.state == AgentState.STOPPED
    assert em.is_running == False
    print(f"  OK: EMAgent created with handle={em.handle}")

    # Check status
    status = em.get_status()
    assert status["handle"] == "em"
    assert status["state"] == "stopped"
    assert "active_tasks" in status
    print(f"  OK: EMAgent status: {status}")

    print("EMAgent Creation: PASSED")


async def test_em_agent_lifecycle():
    """Test EMAgent start/stop (requires agcom-api running)."""
    print("\n=== Testing EMAgent Lifecycle ===")

    import aiohttp

    # Check if agcom-api is running
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:8700/api/health") as resp:
                if resp.status != 200:
                    print("  SKIP: agcom-api not available")
                    return
    except Exception:
        print("  SKIP: agcom-api not running (start with: agcom-api)")
        return

    from assistant.agents.em import EMAgent
    from assistant.agents.base import AgentState

    em = EMAgent(api_url="http://localhost:8700")

    # Start agent
    await em.start()
    assert em.state == AgentState.RUNNING
    assert em.is_running == True
    print("  OK: EMAgent started successfully")

    # Check status while running
    status = em.get_status()
    assert status["state"] == "running"
    print(f"  OK: Running status: {status}")

    # Stop agent
    await em.stop()
    assert em.state == AgentState.STOPPED
    assert em.is_running == False
    print("  OK: EMAgent stopped successfully")

    print("EMAgent Lifecycle: PASSED")


def main():
    """Run all tests."""
    print("=" * 50)
    print("Testing Agent Base Components")
    print("=" * 50)

    # Sync tests
    test_personas()
    test_agent_config()
    test_agent_response()
    test_em_agent_creation()

    # Async tests
    asyncio.run(test_em_agent_lifecycle())

    print("\n" + "=" * 50)
    print("All tests PASSED!")
    print("=" * 50)


if __name__ == "__main__":
    main()
