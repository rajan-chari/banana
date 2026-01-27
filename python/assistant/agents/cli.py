"""
CLI for managing the agent team.

Commands:
- agent-team start: Start all agents
- agent-team stop: Stop all agents (via signal file)
- agent-team status: Show agent status
- agent-team demo: Run a demo task

Usage:
    agent-team start [--model MODEL] [--api-url URL]
    agent-team stop
    agent-team status
    agent-team demo "Task description"
"""

import argparse
import asyncio
import logging
import os
import signal
import sys
from pathlib import Path

from .orchestrator import TeamOrchestrator, TeamConfig

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("agent-team")

# Signal file for graceful shutdown
STOP_FILE = Path.home() / ".agent-team-stop"


def create_parser() -> argparse.ArgumentParser:
    """Create the argument parser."""
    parser = argparse.ArgumentParser(
        prog="agent-team",
        description="Manage the multi-agent team",
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # start command
    start_parser = subparsers.add_parser("start", help="Start all agents")
    start_parser.add_argument(
        "--model",
        default="openai:gpt-5.1",
        help="LLM model to use (default: openai:gpt-5.1)",
    )
    start_parser.add_argument(
        "--api-url",
        default="http://localhost:8700",
        help="agcom API URL (default: http://localhost:8700)",
    )
    start_parser.add_argument(
        "--agents",
        default="all",
        help="Comma-separated list of agents to start, or 'all' (default: all)",
    )
    start_parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )

    # stop command
    subparsers.add_parser("stop", help="Stop running agents")

    # status command
    status_parser = subparsers.add_parser("status", help="Show agent status")
    status_parser.add_argument(
        "--api-url",
        default="http://localhost:8700",
        help="agcom API URL (default: http://localhost:8700)",
    )

    # demo command
    demo_parser = subparsers.add_parser("demo", help="Run a demo task")
    demo_parser.add_argument(
        "task",
        help="Task description to send to the team",
    )
    demo_parser.add_argument(
        "--model",
        default="openai:gpt-5.1",
        help="LLM model to use (default: openai:gpt-5.1)",
    )
    demo_parser.add_argument(
        "--api-url",
        default="http://localhost:8700",
        help="agcom API URL (default: http://localhost:8700)",
    )
    demo_parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="Timeout in seconds (default: 120)",
    )

    return parser


async def cmd_start(args: argparse.Namespace) -> int:
    """Start the agent team."""
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Clean up any existing stop file
    if STOP_FILE.exists():
        STOP_FILE.unlink()

    # Parse agent list
    if args.agents == "all":
        config = TeamConfig(
            api_url=args.api_url,
            model=args.model,
        )
    else:
        agent_names = [a.strip() for a in args.agents.split(",")]
        config = TeamConfig(
            api_url=args.api_url,
            model=args.model,
            enable_em="em" in agent_names,
            enable_planner="planner" in agent_names,
            enable_coder="coder" in agent_names,
            enable_reviewer="reviewer" in agent_names,
            enable_security="security" in agent_names,
            enable_runner="runner" in agent_names,
        )

    orchestrator = TeamOrchestrator(config)

    # Set up signal handlers
    shutdown_event = asyncio.Event()

    def handle_signal(signum, frame):
        logger.info(f"Received signal {signum}, shutting down...")
        shutdown_event.set()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    try:
        # Start the team
        logger.info("Starting agent team...")
        await orchestrator.start()

        # Print status
        status = orchestrator.get_status()
        print(f"\nAgent team running with {status['agent_count']} agents:")
        for handle, agent_status in status["agents"].items():
            state = agent_status["state"]
            symbol = "[+]" if state == "running" else "[-]"
            print(f"  {symbol} {handle}: {agent_status['display_name']} ({state})")

        print(f"\nPress Ctrl+C to stop, or run: agent-team stop")
        print(f"Monitoring for messages on {args.api_url}...")

        # Run until shutdown signal or stop file
        while not shutdown_event.is_set():
            # Check for stop file
            if STOP_FILE.exists():
                logger.info("Stop file detected, shutting down...")
                STOP_FILE.unlink()
                break

            # Brief sleep
            try:
                await asyncio.wait_for(shutdown_event.wait(), timeout=1.0)
            except asyncio.TimeoutError:
                pass

    except Exception as e:
        logger.error(f"Error: {e}")
        return 1

    finally:
        # Stop the team
        logger.info("Stopping agent team...")
        await orchestrator.stop()
        print("\nAgent team stopped.")

    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    """Stop running agents by creating stop file."""
    STOP_FILE.touch()
    print(f"Stop signal sent. Agents will stop shortly.")
    return 0


async def cmd_status(args: argparse.Namespace) -> int:
    """Show status of the agent team."""
    import aiohttp

    # Check if agcom-api is available
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{args.api_url}/api/health") as resp:
                if resp.status != 200:
                    print(f"Error: agcom-api not responding at {args.api_url}")
                    return 1
                health = await resp.json()
    except Exception as e:
        print(f"Error: Cannot connect to agcom-api at {args.api_url}")
        print(f"  {e}")
        return 1

    print(f"agcom-api: {health.get('status', 'unknown')} at {args.api_url}")

    # Get contacts to see which agents are registered
    from assistant.agcom.client import AgcomClient, AgcomSettings

    settings = AgcomSettings(
        enabled=True,
        api_url=args.api_url,
        handle="status_check",
        display_name="Status Check",
        auto_login=True,
        is_configured=True,
    )

    try:
        async with AgcomClient(settings) as client:
            contacts = await client.list_contacts(active_only=True)

            agent_handles = {"em", "planner", "coder", "reviewer", "security", "runner"}
            print(f"\nRegistered agents:")

            for contact in contacts:
                if contact.handle in agent_handles:
                    print(f"  [+] {contact.handle}: {contact.display_name or 'no name'}")
                    agent_handles.discard(contact.handle)

            for handle in agent_handles:
                print(f"  [-] {handle}: not registered")

    except Exception as e:
        print(f"\nWarning: Could not list contacts: {e}")

    return 0


async def cmd_demo(args: argparse.Namespace) -> int:
    """Run a demo task through the team."""
    import aiohttp

    # Check if agcom-api is available
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{args.api_url}/api/health") as resp:
                if resp.status != 200:
                    print(f"Error: agcom-api not responding at {args.api_url}")
                    return 1
    except Exception as e:
        print(f"Error: Cannot connect to agcom-api at {args.api_url}")
        return 1

    config = TeamConfig(
        api_url=args.api_url,
        model=args.model,
    )
    orchestrator = TeamOrchestrator(config)

    print(f"Starting agent team for demo...")
    await orchestrator.start()

    try:
        print(f"\nDelegating task to EM: {args.task[:100]}...")

        # Delegate the task
        success = await orchestrator.delegate_to_em(
            from_handle="demo_user",
            subject="Demo Task",
            body=args.task,
        )

        if not success:
            print("Error: Failed to delegate task")
            return 1

        print(f"Task delegated. Waiting for completion (timeout: {args.timeout}s)...")

        # Wait for completion
        result = await orchestrator.wait_for_completion(
            from_handle="demo_user",
            timeout_seconds=args.timeout,
        )

        if result:
            print(f"\n{'='*50}")
            print("Task completed!")
            print(f"{'='*50}")
            print(result)
        else:
            print("\nTimeout: Task did not complete within the timeout period.")
            print("The agents may still be working. Check agcom messages for details.")

    finally:
        print("\nStopping agent team...")
        await orchestrator.stop()

    return 0


def main() -> int:
    """Main entry point."""
    parser = create_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    if args.command == "start":
        return asyncio.run(cmd_start(args))
    elif args.command == "stop":
        return cmd_stop(args)
    elif args.command == "status":
        return asyncio.run(cmd_status(args))
    elif args.command == "demo":
        return asyncio.run(cmd_demo(args))
    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())
