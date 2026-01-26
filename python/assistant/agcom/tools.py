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
import json
from assistant.agcom import AgcomClient, load_agcom_config

async def main():
    # Load configuration and create client
    config = load_agcom_config()

    async with AgcomClient(config) as client:
        # List contacts
        contacts = await client.list_contacts(active_only=True)

        if not contacts:
            print("No contacts found in address book.")
            return

        print(f"Found {len(contacts)} contact(s):\\n")

        for contact in contacts:
            print(f"Handle: {contact.handle}")
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

    # Check if agcom tools are already registered (from previous session)
    if registry.get_by_name("send_agcom_message"):
        logger.info("agcom tools already loaded from storage, skipping registration")
        return

    # Tool 1: Send Message
    send_tool = Tool(
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
    )
    registry.register(send_tool)
    storage.save(send_tool)
    logger.info(f"Registered tool: {send_tool.name}")

    # Tool 2: List Contacts
    contacts_tool = Tool(
        id=str(uuid.uuid4()),
        name="list_agcom_contacts",
        description="List all available agents in the agcom address book",
        source_code=_generate_list_contacts_script(),
        parameters=[],
        tags=["agcom", "contacts", "discovery"],
    )
    registry.register(contacts_tool)
    storage.save(contacts_tool)
    logger.info(f"Registered tool: {contacts_tool.name}")

    # Tool 3: Get Inbox
    inbox_tool = Tool(
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
    )
    registry.register(inbox_tool)
    storage.save(inbox_tool)
    logger.info(f"Registered tool: {inbox_tool.name}")

    # Tool 4: Search Messages
    search_tool = Tool(
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
    )
    registry.register(search_tool)
    storage.save(search_tool)
    logger.info(f"Registered tool: {search_tool.name}")

    # Tool 5: Reply to Message
    reply_tool = Tool(
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
    )
    registry.register(reply_tool)
    storage.save(reply_tool)
    logger.info(f"Registered tool: {reply_tool.name}")

    # Tool 6: List Threads
    threads_tool = Tool(
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
    )
    registry.register(threads_tool)
    storage.save(threads_tool)
    logger.info(f"Registered tool: {threads_tool.name}")

    logger.info(f"Successfully registered 6 agcom tools")
