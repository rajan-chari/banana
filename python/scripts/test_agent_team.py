"""
Test script for the full agent team.

Tests:
1. TeamOrchestrator creation
2. All agent types creation
3. Team start/stop lifecycle
4. Agent status monitoring

Run: cd python && source .venv/Scripts/activate && python scripts/test_agent_team.py
"""

import asyncio
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_orchestrator_creation():
    """Test TeamOrchestrator creation."""
    print("\n=== Testing TeamOrchestrator Creation ===")

    from assistant.agents.orchestrator import TeamOrchestrator, TeamConfig

    # Default config - all agents enabled
    orch = TeamOrchestrator()
    assert len(orch.agents) == 6
    assert "em" in orch.agents
    assert "planner" in orch.agents
    assert "coder" in orch.agents
    assert "reviewer" in orch.agents
    assert "security" in orch.agents
    assert "runner" in orch.agents
    print(f"  OK: Created orchestrator with {len(orch.agents)} agents")

    # Partial config
    config = TeamConfig(
        enable_em=True,
        enable_coder=True,
        enable_runner=True,
        enable_planner=False,
        enable_reviewer=False,
        enable_security=False,
    )
    orch = TeamOrchestrator(config)
    assert len(orch.agents) == 3
    assert "em" in orch.agents
    assert "planner" not in orch.agents
    print(f"  OK: Created partial team with {len(orch.agents)} agents")

    print("TeamOrchestrator Creation: PASSED")


def test_all_agent_types():
    """Test all individual agent types can be instantiated."""
    print("\n=== Testing All Agent Types ===")

    from assistant.agents import (
        EMAgent,
        CoderAgent,
        RunnerAgent,
        SecurityAgent,
        ReviewerAgent,
        PlannerAgent,
    )
    from assistant.agents.base import AgentState

    agents = [
        ("em", EMAgent),
        ("coder", CoderAgent),
        ("runner", RunnerAgent),
        ("security", SecurityAgent),
        ("reviewer", ReviewerAgent),
        ("planner", PlannerAgent),
    ]

    for expected_handle, AgentClass in agents:
        agent = AgentClass()
        assert agent.handle == expected_handle
        assert agent.state == AgentState.STOPPED
        assert agent.config.system_prompt  # Has a persona
        print(f"  OK: {AgentClass.__name__} -> handle={agent.handle}")

    print("All Agent Types: PASSED")


def test_orchestrator_status():
    """Test orchestrator status reporting."""
    print("\n=== Testing Orchestrator Status ===")

    from assistant.agents.orchestrator import TeamOrchestrator

    orch = TeamOrchestrator()
    status = orch.get_status()

    assert "running" in status
    assert status["running"] == False
    assert "agent_count" in status
    assert status["agent_count"] == 6
    assert "agents" in status
    assert len(status["agents"]) == 6
    print(f"  OK: Status shows {status['agent_count']} agents, running={status['running']}")

    # Check individual agent status
    for handle, agent_status in status["agents"].items():
        assert "handle" in agent_status
        assert "state" in agent_status
        assert agent_status["state"] == "stopped"
    print("  OK: All agent statuses show 'stopped'")

    print("Orchestrator Status: PASSED")


async def test_team_lifecycle():
    """Test full team start/stop (requires agcom-api running)."""
    print("\n=== Testing Team Lifecycle ===")

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

    from assistant.agents.orchestrator import TeamOrchestrator, TeamConfig

    # Use a minimal team for faster testing
    config = TeamConfig(
        enable_em=True,
        enable_coder=True,
        enable_runner=False,
        enable_planner=False,
        enable_reviewer=False,
        enable_security=False,
    )
    orch = TeamOrchestrator(config)

    # Start team
    await orch.start()
    assert orch.is_running == True
    print(f"  OK: Team started ({len(orch.agents)} agents)")

    # Check status while running
    status = orch.get_status()
    assert status["running"] == True
    running_count = sum(1 for a in status["agents"].values() if a["state"] == "running")
    print(f"  OK: {running_count} agents now running")

    # Brief pause to let agents initialize
    await asyncio.sleep(1)

    # Stop team
    await orch.stop()
    assert orch.is_running == False
    print("  OK: Team stopped")

    # Verify all stopped
    status = orch.get_status()
    stopped_count = sum(1 for a in status["agents"].values() if a["state"] == "stopped")
    assert stopped_count == len(orch.agents)
    print(f"  OK: All {stopped_count} agents stopped")

    print("Team Lifecycle: PASSED")


async def test_delegation_to_em():
    """Test delegating a task to EM (requires agcom-api running)."""
    print("\n=== Testing Delegation to EM ===")

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

    from assistant.agents.orchestrator import TeamOrchestrator, TeamConfig

    # Minimal team
    config = TeamConfig(
        enable_em=True,
        enable_coder=False,
        enable_runner=False,
        enable_planner=False,
        enable_reviewer=False,
        enable_security=False,
    )
    orch = TeamOrchestrator(config)

    # Start EM only
    await orch.start()

    # Delegate a task
    success = await orch.delegate_to_em(
        from_handle="test_assistant",
        subject="Test Task",
        body="Please write a hello world script",
    )
    assert success == True
    print("  OK: Delegated task to EM")

    # Brief pause for EM to receive
    await asyncio.sleep(1)

    # Stop team
    await orch.stop()
    print("  OK: Delegation test complete")

    print("Delegation to EM: PASSED")


def main():
    """Run all tests."""
    print("=" * 50)
    print("Testing Agent Team")
    print("=" * 50)

    # Sync tests
    test_orchestrator_creation()
    test_all_agent_types()
    test_orchestrator_status()

    # Async tests
    asyncio.run(test_team_lifecycle())
    asyncio.run(test_delegation_to_em())

    print("\n" + "=" * 50)
    print("All tests PASSED!")
    print("=" * 50)


if __name__ == "__main__":
    main()
