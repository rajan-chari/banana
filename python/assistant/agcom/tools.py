"""
Tool wrappers for agcom functionality.

Registers agcom operations as LLM-callable tools, bridging the AgcomClient
with the assistant's tool execution framework.
"""

import asyncio
import json
import logging
import uuid
from typing import Any

from assistant.tools.registry import Tool, ToolParameter, ParameterType, ToolRegistry
from assistant.tools.storage import ToolStorage
from .client import AgcomClient

logger = logging.getLogger(__name__)


def _generate_send_message_script() -> str:
    """Generate script for sending agcom messages."""
    return '''"""Send a message to another agent via agcom."""
import asyncio
import json
from assistant.agcom import AgcomClient, load_agcom_config

# Parameters (injected at runtime)
to_handle: str
subject: str
body: str

async def main():
    # Load configuration and create client
    config = load_agcom_config()

    async with AgcomClient(config) as client:
        # Send message
        message = await client.send_message(
            to_handles=[to_handle],
            subject=subject,
            body=body,
        )

        # Format output
        result = {
            "message_id": message.message_id,
            "thread_id": message.thread_id,
            "from": message.from_handle,
            "to": message.to_handles,
            "subject": message.subject,
            "created_at": message.created_at.isoformat(),
        }

        print("Message sent successfully!")
        print(f"Message ID: {result['message_id']}")
        print(f"Thread ID: {result['thread_id']}")
        print(f"To: {', '.join(result['to'])}")
        print(f"Subject: {result['subject']}")

if __name__ == "__main__":
    asyncio.run(main())
'''


def _generate_list_contacts_script() -> str:
    """Generate script for listing agcom contacts."""
    return '''"""List available agents in the agcom address book."""
import asyncio
from assistant.agcom import AgcomClient, load_agcom_config

async def main():
    # Load configuration and create client
    config = load_agcom_config()
    my_handle = config.handle  # The assistant's own handle

    async with AgcomClient(config) as client:
        # List contacts
        contacts = await client.list_contacts(active_only=True)

        if not contacts:
            print("No contacts found in address book.")
            return

        # Filter out self and count others
        other_contacts = [c for c in contacts if c.handle != my_handle]

        print(f"My handle: {my_handle}")
        print(f"Found {len(other_contacts)} other agent(s):\\n")

        for contact in contacts:
            is_me = contact.handle == my_handle
            label = " (me)" if is_me else ""
            print(f"Handle: {contact.handle}{label}")
            if contact.display_name:
                print(f"  Display Name: {contact.display_name}")
            if contact.description:
                print(f"  Description: {contact.description}")
            if contact.tags:
                print(f"  Tags: {', '.join(contact.tags)}")
            print()

if __name__ == "__main__":
    asyncio.run(main())
'''


def _generate_get_inbox_script() -> str:
    """Generate script for getting inbox messages."""
    return '''"""Get recent messages from agcom inbox."""
import asyncio
import json
from assistant.agcom import AgcomClient, load_agcom_config

# Parameters (injected at runtime)
limit: int = 10

async def main():
    # Load configuration and create client
    config = load_agcom_config()

    async with AgcomClient(config) as client:
        # Get recent messages
        messages = await client.list_messages(limit=limit)

        if not messages:
            print("No messages in inbox.")
            return

        print(f"Found {len(messages)} message(s):\\n")

        for msg in messages:
            print(f"[{msg.created_at.strftime('%Y-%m-%d %H:%M')}] {msg.subject}")
            print(f"  From: {msg.from_handle}")
            print(f"  To: {', '.join(msg.to_handles)}")
            print(f"  ID: {msg.message_id}")
            print(f"  Body: {msg.body[:100]}{'...' if len(msg.body) > 100 else ''}")
            print()

if __name__ == "__main__":
    asyncio.run(main())
'''


def _generate_search_messages_script() -> str:
    """Generate script for searching messages."""
    return '''"""Search message history in agcom."""
import asyncio
import json
from assistant.agcom import AgcomClient, load_agcom_config

# Parameters (injected at runtime)
query: str
limit: int = 10

async def main():
    # Load configuration and create client
    config = load_agcom_config()

    async with AgcomClient(config) as client:
        # Search messages
        messages = await client.search_messages(
            query=query,
            in_subject=True,
            in_body=True,
            limit=limit,
        )

        if not messages:
            print(f"No messages found matching '{query}'.")
            return

        print(f"Found {len(messages)} message(s) matching '{query}':\\n")

        for msg in messages:
            print(f"[{msg.created_at.strftime('%Y-%m-%d %H:%M')}] {msg.subject}")
            print(f"  From: {msg.from_handle}")
            print(f"  To: {', '.join(msg.to_handles)}")
            print(f"  ID: {msg.message_id}")
            print(f"  Body: {msg.body[:100]}{'...' if len(msg.body) > 100 else ''}")
            print()

if __name__ == "__main__":
    asyncio.run(main())
'''


def _generate_reply_message_script() -> str:
    """Generate script for replying to messages."""
    return '''"""Reply to a specific agcom message."""
import asyncio
import json
from assistant.agcom import AgcomClient, load_agcom_config

# Parameters (injected at runtime)
message_id: str
body: str

async def main():
    # Load configuration and create client
    config = load_agcom_config()

    async with AgcomClient(config) as client:
        # Reply to message
        reply = await client.reply_to_message(
            message_id=message_id,
            body=body,
        )

        # Format output
        result = {
            "message_id": reply.message_id,
            "thread_id": reply.thread_id,
            "in_reply_to": reply.in_reply_to,
            "created_at": reply.created_at.isoformat(),
        }

        print("Reply sent successfully!")
        print(f"Reply ID: {result['message_id']}")
        print(f"Thread ID: {result['thread_id']}")
        print(f"In Reply To: {result['in_reply_to']}")

if __name__ == "__main__":
    asyncio.run(main())
'''


def _generate_list_threads_script() -> str:
    """Generate script for listing conversation threads."""
    return '''"""List conversation threads in agcom."""
import asyncio
import json
from assistant.agcom import AgcomClient, load_agcom_config

# Parameters (injected at runtime)
limit: int = 10

async def main():
    # Load configuration and create client
    config = load_agcom_config()

    async with AgcomClient(config) as client:
        # List threads
        threads = await client.list_threads(limit=limit)

        if not threads:
            print("No conversation threads found.")
            return

        print(f"Found {len(threads)} thread(s):\\n")

        for thread in threads:
            print(f"Subject: {thread.subject}")
            print(f"  Thread ID: {thread.thread_id}")
            print(f"  Participants: {', '.join(thread.participant_handles)}")
            print(f"  Created: {thread.created_at.strftime('%Y-%m-%d %H:%M')}")
            print(f"  Last Activity: {thread.last_activity_at.strftime('%Y-%m-%d %H:%M')}")
            if thread.metadata:
                print(f"  Metadata: {json.dumps(thread.metadata, indent=4)}")
            print()

if __name__ == "__main__":
    asyncio.run(main())
'''


def register_user_identity_tool(
    registry: ToolRegistry,
    storage: ToolStorage,
) -> None:
    """
    Register user identity tool (always available).

    This tool allows the LLM to learn the user's name naturally and configure
    the assistant for multi-agent communication.

    Args:
        registry: Tool registry to register tools in
        storage: Tool storage for persistence
    """
    # Check if already registered
    if registry.get_by_name("remember_user_name"):
        logger.info("User identity tool already registered")
        return

    identity_tool = Tool(
        id=str(uuid.uuid4()),
        name="remember_user_name",
        description=(
            "Remember and save the user's name to configure the assistant for multi-agent communication. "
            "Call this when the user tells you their name (e.g., 'My name is Alice', 'I'm Bob', 'Call me Charlie'). "
            "Extract the name from their message and pass it as the user_name parameter. "
            "After this tool runs, communication features become available immediately."
        ),
        source_code='''"""Remember the user's name and configure the assistant."""
import os
import sys
from pathlib import Path

# Fix Windows encoding for stdout
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Parameters (injected at runtime)
user_name: str

# Import identity configuration
from assistant.agcom.identity import configure_identity, name_to_handle
import assistant

# Convert name to handle
user_handle = name_to_handle(user_name)

# Find the correct .env file location
# Get the assistant package directory and go up one level to python/ directory
assistant_dir = Path(assistant.__file__).parent.parent
env_file = assistant_dir / ".env"

print(f"DEBUG: Using .env file at: {env_file}")

# Configure identity and save to .env
identity = configure_identity(user_handle, env_file, user_name=user_name)

print(f"Identity configured for {user_name}")
print(f"__RELOAD_AGCOM_TOOLS__")
print(f"All set! Communication tools are now available.")
''',
        parameters=[
            ToolParameter(
                name="user_name",
                description="The user's full name exactly as they stated it. Extract from phrases like 'My name is Alice' or 'I'm Bob Smith'. Examples: 'Alice', 'Bob Smith', 'Charlie Johnson'",
                param_type=ParameterType.STRING,
                required=True,
            ),
        ],
        tags=["setup", "configuration", "identity"],
    )

    registry.register(identity_tool)
    storage.save(identity_tool)
    logger.info("Registered user identity tool")


def register_agcom_tools(
    registry: ToolRegistry,
    storage: ToolStorage,
    client: AgcomClient,
) -> None:
    """
    Register agcom tools in the assistant's tool registry.

    Creates 6 tools for agent-to-agent communication:
    - send_agcom_message: Send a message to another agent
    - list_agcom_contacts: List available agents
    - get_agcom_inbox: Get recent messages
    - search_agcom_messages: Search message history
    - reply_agcom_message: Reply to a specific message
    - list_agcom_threads: List conversation threads

    Args:
        registry: Tool registry to register tools in
        storage: Tool storage for persistence
        client: AgcomClient instance (for validation)
    """
    logger.info("Registering agcom tools...")

    # Helper to register a tool only if it doesn't exist
    def register_if_missing(tool: Tool) -> bool:
        if registry.get_by_name(tool.name):
            return False
        registry.register(tool)
        storage.save(tool)
        logger.info(f"Registered tool: {tool.name}")
        return True

    # Tool 1: Send Message
    register_if_missing(Tool(
        id=str(uuid.uuid4()),
        name="send_agcom_message",
        description="Send a message to another agent via agcom communication system",
        source_code=_generate_send_message_script(),
        parameters=[
            ToolParameter(
                name="to_handle",
                description="Handle of the recipient agent",
                param_type=ParameterType.STRING,
                required=True,
            ),
            ToolParameter(
                name="subject",
                description="Subject line of the message",
                param_type=ParameterType.STRING,
                required=True,
            ),
            ToolParameter(
                name="body",
                description="Body content of the message",
                param_type=ParameterType.STRING,
                required=True,
            ),
        ],
        tags=["agcom", "communication", "messaging"],
    ))

    # Tool 2: List Contacts
    register_if_missing(Tool(
        id=str(uuid.uuid4()),
        name="list_agcom_contacts",
        description="List all available agents in the agcom address book",
        source_code=_generate_list_contacts_script(),
        parameters=[],
        tags=["agcom", "contacts", "discovery"],
    ))

    # Tool 3: Get Inbox
    register_if_missing(Tool(
        id=str(uuid.uuid4()),
        name="get_agcom_inbox",
        description="Get recent messages from agcom inbox",
        source_code=_generate_get_inbox_script(),
        parameters=[
            ToolParameter(
                name="limit",
                description="Maximum number of messages to retrieve",
                param_type=ParameterType.INTEGER,
                required=False,
                default=10,
            ),
        ],
        tags=["agcom", "messaging", "inbox"],
    ))

    # Tool 4: Search Messages
    register_if_missing(Tool(
        id=str(uuid.uuid4()),
        name="search_agcom_messages",
        description="Search through message history by keyword or phrase",
        source_code=_generate_search_messages_script(),
        parameters=[
            ToolParameter(
                name="query",
                description="Search query string to match in subject or body",
                param_type=ParameterType.STRING,
                required=True,
            ),
            ToolParameter(
                name="limit",
                description="Maximum number of results to return",
                param_type=ParameterType.INTEGER,
                required=False,
                default=10,
            ),
        ],
        tags=["agcom", "messaging", "search"],
    ))

    # Tool 5: Reply to Message
    register_if_missing(Tool(
        id=str(uuid.uuid4()),
        name="reply_agcom_message",
        description="Reply to a specific message in an existing conversation thread",
        source_code=_generate_reply_message_script(),
        parameters=[
            ToolParameter(
                name="message_id",
                description="ID of the message to reply to",
                param_type=ParameterType.STRING,
                required=True,
            ),
            ToolParameter(
                name="body",
                description="Body content of the reply",
                param_type=ParameterType.STRING,
                required=True,
            ),
        ],
        tags=["agcom", "messaging", "reply"],
    ))

    # Tool 6: List Threads
    register_if_missing(Tool(
        id=str(uuid.uuid4()),
        name="list_agcom_threads",
        description="List conversation threads with participants and activity info",
        source_code=_generate_list_threads_script(),
        parameters=[
            ToolParameter(
                name="limit",
                description="Maximum number of threads to retrieve",
                param_type=ParameterType.INTEGER,
                required=False,
                default=10,
            ),
        ],
        tags=["agcom", "messaging", "threads"],
    ))

    # Tool 7: Send Task to Team
    register_if_missing(Tool(
        id=str(uuid.uuid4()),
        name="send_task_to_team",
        description=(
            "Send a task to the engineering team for execution. Use this when the user needs: "
            "code written or executed, files read/written/listed, system information (time, screenshots, etc.), "
            "network requests, or any task requiring Python execution. "
            "The team will handle the work and return results."
        ),
        source_code=_generate_send_task_to_team_script(),
        parameters=[
            ToolParameter(
                name="task_description",
                description="Clear description of what the user needs done. Include all relevant context.",
                param_type=ParameterType.STRING,
                required=True,
            ),
        ],
        tags=["agcom", "team", "execution", "delegation"],
    ))

    logger.info("agcom tools registration complete")


def _generate_send_task_to_team_script() -> str:
    """Generate script for sending tasks to the engineering team."""
    return '''"""Send a task to the engineering team and wait for completion."""
import asyncio
import platform
import sys
import time
from assistant.agcom import AgcomClient, load_agcom_config

# Parameters (injected at runtime)
task_description: str

async def main():
    config = load_agcom_config()

    # Gather environment info for context
    env_info = f"""Environment:
- OS: {platform.system()} {platform.release()}
- Python: {sys.version.split()[0]}
- Can pip install packages: yes

Workflow: coder writes code → runner executes it → results back to you"""

    async with AgcomClient(config) as client:
        # Send task to EM (Engineering Manager)
        task_body = f"""Task from user:
{task_description}

{env_info}"""

        message = await client.send_message(
            to_handles=["em"],
            subject="User Request",
            body=task_body,
            tags=["user-task"],
        )

        print(f"Task sent to team (thread: {message.thread_id})")
        print("Waiting for response...")

        # Poll for response (max 3 minutes, show progress updates)
        thread_id = message.thread_id
        seen_ids = {message.message_id}
        timeout = 180  # 3 minutes
        start = time.time()

        while time.time() - start < timeout:
            await asyncio.sleep(3)

            # Get thread messages
            messages = await client.get_thread_messages(thread_id, limit=20)

            for msg in messages:
                if msg.message_id in seen_ids:
                    continue
                seen_ids.add(msg.message_id)

                # Response from EM back to us
                if msg.from_handle == "em" and config.handle in msg.to_handles:
                    # Check if it's a progress update or final response
                    tags = msg.tags or []
                    if "progress" in tags:
                        print(f"[Progress] {msg.body}")
                        continue  # Keep waiting for final response
                    elif "task-complete" in tags or not any(t.startswith("progress") for t in tags):
                        print(f"\\n--- Response from team ---\\n{msg.body}")
                        return

        print("Timeout waiting for team response. They may still be working on it.")

if __name__ == "__main__":
    asyncio.run(main())
'''


def try_register_agcom_tools_if_configured(
    registry: ToolRegistry,
    storage: ToolStorage,
) -> bool:
    """
    Try to register agcom tools if identity is now configured.

    This is used for dynamic tool registration after the user provides their name.

    Args:
        registry: Tool registry to register tools in
        storage: Tool storage for persistence

    Returns:
        True if tools were registered, False otherwise
    """
    from .config import load_agcom_config
    from .client import AgcomClient

    agcom_settings = load_agcom_config()
    if agcom_settings.is_configured and agcom_settings.enabled:
        # Check if tools already registered
        if registry.get_by_name("send_agcom_message"):
            logger.info("agcom tools already registered")
            return False  # Already registered

        # Register tools now
        agcom_client = AgcomClient(agcom_settings)
        register_agcom_tools(registry, storage, agcom_client)
        logger.info(f"Dynamically registered agcom tools for {agcom_settings.user_handle}")
        return True

    return False
