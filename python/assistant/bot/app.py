"""
Teams Bot - Main entry point for the assistant.

This module initializes and runs the Teams SDK application with DevTools support.
"""

import asyncio
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from microsoft_teams.api import MessageActivity, TypingActivityInput
from microsoft_teams.apps import ActivityContext, App
from microsoft_teams.devtools import DevToolsPlugin

from assistant.llm import chat, get_config
from assistant.scripts import execute_script, save_script, ScriptResult
from assistant.permissions import (
    PermissionChecker,
    PermissionLevel,
    get_audit_logger,
    create_development_policy,
)
from assistant.tools import (
    ToolRegistry,
    ToolStorage,
    ToolPromoter,
    ToolExecutor,
)
from assistant.agcom import (
    AgcomClient,
    load_agcom_config,
    is_identity_configured,
    configure_identity,
    load_identity,
)
from assistant.agcom.client import AgcomError, AgcomNotFoundError
from assistant.agcom.tools import register_agcom_tools, register_user_identity_tool, try_register_agcom_tools_if_configured
from assistant.agents.delegation import EMDelegator

# Load environment variables
load_dotenv()

# Determine config directory (relative to this file's package)
CONFIG_DIR = Path(__file__).parent.parent.parent / "config"
SCRIPTS_DIR = Path(__file__).parent.parent.parent / "scripts"
LOGS_DIR = Path(__file__).parent.parent.parent / "logs"
DATA_DIR = Path(__file__).parent.parent.parent / "data"

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Initialize permission checker with development policy (more permissive for now)
permission_checker = PermissionChecker(policy=create_development_policy())
audit_logger = get_audit_logger(log_dir=LOGS_DIR)

# Initialize tool system
DATA_DIR.mkdir(parents=True, exist_ok=True)
tool_storage = ToolStorage(DATA_DIR / "tools.db")
tool_registry = ToolRegistry()
tool_promoter = ToolPromoter(tool_registry, tool_storage)
tool_executor = ToolExecutor(tool_registry, tool_storage)

# Load existing tools from storage
tool_storage.load_into_registry(tool_registry)

# Always register user identity tool (needed for first-time setup)
register_user_identity_tool(tool_registry, tool_storage)

# Initialize agcom integration
agcom_settings = load_agcom_config()
agcom_client = None
em_delegator = None

if agcom_settings.is_configured and agcom_settings.enabled:
    try:
        agcom_client = AgcomClient(agcom_settings)
        em_delegator = EMDelegator(agcom_client)
        # Register agcom tools in the tool registry
        register_agcom_tools(tool_registry, tool_storage, agcom_client)
        logger.info(
            f"Communication tools enabled - 6 tools registered "
            f"(user: {agcom_settings.user_handle}, "
            f"assistant: {agcom_settings.handle})"
        )
    except Exception as e:
        logger.warning(f"agcom integration failed: {e}")
        logger.warning("Communication tools will not be available")
elif not agcom_settings.is_configured:
    logger.info(
        "Identity not configured - communication tools will register after setup"
    )

# Initialize the Teams App with DevTools plugin for local development
app = App(plugins=[DevToolsPlugin()])


# Track last generated script for promotion
_last_script: dict | None = None


async def register_assistant_in_backend() -> bool:
    """
    Register the assistant in the agcom-api backend.

    Called after identity is configured to ensure the agent exists
    in the backend before attempting to send/receive messages.

    Returns:
        True if registration succeeded, False otherwise
    """
    global agcom_client, em_delegator

    try:
        # Reload config with new identity
        settings = load_agcom_config()

        if not settings.is_configured:
            logger.warning("Cannot register in backend - identity not configured")
            return False

        # Create a new client with the updated settings
        agcom_client = AgcomClient(settings)
        em_delegator = EMDelegator(agcom_client)

        # Login to create session
        login_info = await agcom_client.login(
            handle=settings.handle,
            display_name=settings.display_name
        )

        # Register self in address_book so other agents can find us
        try:
            await agcom_client.get_contact(settings.handle)
            logger.info(f"Assistant '{settings.handle}' already registered in backend")
        except AgcomNotFoundError:
            # Not registered yet - add ourselves
            await agcom_client.add_contact(
                handle=settings.handle,
                display_name=settings.display_name,
                description=f"Assistant for {settings.user_handle}",
            )
            logger.info(
                f"Registered assistant '{settings.handle}' in agcom-api backend "
                f"(display_name: {settings.display_name})"
            )

        return True

    except AgcomError as e:
        logger.warning(f"Failed to register in agcom-api backend: {e}")
        logger.warning("Agent communication may not work until server is available")
        return False
    except Exception as e:
        logger.error(f"Unexpected error registering in backend: {e}")
        return False


async def handle_command(
    ctx: ActivityContext[MessageActivity],
    command_text: str,
    user_id: str,
    conversation_id: str,
) -> None:
    """Handle slash commands for tool management."""
    global _last_script
    
    parts = command_text.split(maxsplit=2)
    cmd = parts[0].lower()
    args = parts[1:] if len(parts) > 1 else []
    
    logger.info(f"Handling command: {cmd} with args: {args}")
    
    if cmd == "/help":
        # Check for advanced help
        if args and args[0].lower() == "advanced":
            help_text = """**Advanced Commands:**

📨 **Direct Communication:**
- `/agcom-send <handle> <subject> <body>` - Send message
- `/agcom-inbox [limit]` - List recent messages
- `/agcom-threads [limit]` - List conversations
- `/agcom-contacts` - List contacts
- `/agcom-reply <msg_id> <body>` - Reply to message
- `/agcom-search <query>` - Search messages
- `/agcom-status` - Show detailed connection info
- `/agcom-setup <your_name>` - Manual identity setup

_Tip: You can also just ask me to communicate with other assistants naturally!_
"""
        else:
            help_text = """**Available Commands:**

📦 **Tool Management:**
- `/tools` - List all registered tools
- `/tool <name>` - Show tool details
- `/promote <name> [description]` - Promote last script to a tool
- `/run <name> [args...]` - Execute a registered tool
- `/delete <name>` - Delete a tool

📝 **Script Management:**
- `/scripts` - List recent scripts
- `/script <filename>` - View a script

💬 **Agent Communication:**
- Just ask me! "Tell Bob's assistant about the meeting"
- I can communicate with other assistants on your behalf

ℹ️ **Info:**
- `/help` - Show this help
- `/help advanced` - Show advanced commands
- `/status` - Show system status
"""
        await ctx.send(help_text)
        return
    
    elif cmd == "/tools":
        tools = tool_registry.list_all(enabled_only=False)
        if not tools:
            await ctx.send("📦 No tools registered yet.\n\n_Use `/promote <name>` after generating a script to create a tool._")
            return
        
        lines = ["📦 **Registered Tools:**\n"]
        for tool in tools:
            status = "✅" if tool.enabled else "⏸️"
            usage = f"(used {tool.usage_count}x)" if tool.usage_count > 0 else ""
            lines.append(f"- {status} **{tool.name}** - {tool.description[:50]}... {usage}")
        
        await ctx.send("\n".join(lines))
        return
    
    elif cmd == "/tool" and args:
        tool_name = args[0]
        tool = tool_registry.get_by_name(tool_name)
        if not tool:
            await ctx.send(f"❌ Tool '{tool_name}' not found.")
            return
        
        params_str = ""
        if tool.parameters:
            params_str = "\n**Parameters:**\n"
            for p in tool.parameters:
                req = "required" if p.required else "optional"
                params_str += f"- `{p.name}` ({p.param_type.value}, {req}): {p.description}\n"
        
        details = f"""**🔧 Tool: {tool.name}**

{tool.description}

**ID:** `{tool.id}`
**Version:** {tool.version}
**Enabled:** {"Yes" if tool.enabled else "No"}
**Created:** {tool.created_at.strftime('%Y-%m-%d %H:%M')}
**Usage Count:** {tool.usage_count}
{params_str}
**Source Code:**
```python
{tool.source_code[:500]}{'...' if len(tool.source_code) > 500 else ''}
```
"""
        await ctx.send(details)
        return
    
    elif cmd == "/promote" and args:
        tool_name = args[0]
        description = args[1] if len(args) > 1 else None
        
        if not _last_script:
            await ctx.send("❌ No script to promote. Generate a script first, then use `/promote <name>`.")
            return
        
        if not description:
            description = _last_script.get("description", f"Tool promoted from script")
        
        result = tool_promoter.promote_script(
            name=tool_name,
            description=description,
            source_code=_last_script["code"],
            source_script_path=_last_script.get("filepath"),
        )
        
        if result.success:
            msg = f"✅ {result.message}\n\n_Use `/run {tool_name}` to execute it._"
            if result.warnings:
                msg += "\n\n⚠️ Warnings:\n" + "\n".join(f"- {w}" for w in result.warnings)
            await ctx.send(msg)
            _last_script = None  # Clear after promotion
        else:
            await ctx.send(f"❌ {result.message}")
        return
    
    elif cmd == "/run" and args:
        tool_name = args[0]
        # Parse remaining args as key=value pairs
        params = {}
        for arg in args[1:]:
            if "=" in arg:
                key, value = arg.split("=", 1)
                params[key] = value

        await ctx.send(f"⏳ Running tool `{tool_name}`...")

        result = await tool_executor.execute(tool_name, params)

        # Check if identity was just configured and register tools dynamically
        if result.success and result.output and "__RELOAD_AGCOM_TOOLS__" in result.output:
            logger.info("Identity configuration detected - registering communication tools dynamically")
            # Reload .env since tool runs in subprocess
            load_dotenv(override=True)
            if try_register_agcom_tools_if_configured(tool_registry, tool_storage):
                logger.info("Dynamically registered communication tools")
                # Reload tools into executor
                tool_storage.load_into_registry(tool_registry)

            # Register the assistant in agcom-api backend (always, regardless of tool registration)
            await register_assistant_in_backend()

            # Remove technical marker from output
            result.output = result.output.replace("__RELOAD_AGCOM_TOOLS__\n", "")

        if result.success:
            output = result.output or "(no output)"
            if len(output) > 2000:
                output = output[:2000] + "\n... (truncated)"
            await ctx.send(f"✅ **Tool executed successfully** ({result.duration_ms}ms)\n\n```\n{output}\n```")
        else:
            await ctx.send(f"❌ **Tool execution failed**\n\n{result.error}")
        return
    
    elif cmd == "/delete" and args:
        tool_name = args[0]
        tool = tool_registry.get_by_name(tool_name)
        if not tool:
            await ctx.send(f"❌ Tool '{tool_name}' not found.")
            return
        
        tool_registry.unregister(tool.id)
        tool_storage.delete(tool.id)
        await ctx.send(f"✅ Deleted tool '{tool_name}'")
        return
    
    elif cmd == "/scripts":
        scripts = sorted(SCRIPTS_DIR.glob("*.py"), reverse=True)[:10]
        if not scripts:
            await ctx.send("📝 No scripts found.")
            return
        
        lines = ["📝 **Recent Scripts:**\n"]
        for script in scripts:
            lines.append(f"- `{script.name}`")
        lines.append(f"\n_Use `/script <filename>` to view one._")
        await ctx.send("\n".join(lines))
        return
    
    elif cmd == "/status":
        stats = tool_storage.get_stats()

        # Check identity status
        identity_status = "✅ Configured" if is_identity_configured() else "⚠️ Not configured"
        identity_info = ""
        if is_identity_configured():
            from assistant.agcom import load_identity
            identity = load_identity()
            if identity:
                identity_info = f"\n👤 **Your Assistant:** {identity.display_name or identity.assistant_handle}"

        status = f"""**System Status**

{identity_status}{identity_info}

🔧 **Tools:** {stats['total_tools']} registered ({stats['enabled_tools']} enabled)
📊 **Total Invocations:** {stats['total_invocations']}
📝 **Scripts Directory:** `{SCRIPTS_DIR}`
📁 **Data Directory:** `{DATA_DIR}`
"""
        await ctx.send(status)
        return

    # agcom Commands
    elif cmd == "/agcom-setup":
        await handle_agcom_setup(ctx, command_text)
        return

    elif cmd == "/agcom-send":
        await handle_agcom_send(ctx, command_text)
        return

    elif cmd == "/agcom-inbox":
        await handle_agcom_inbox(ctx, command_text)
        return

    elif cmd == "/agcom-threads":
        await handle_agcom_threads(ctx, command_text)
        return

    elif cmd == "/agcom-contacts":
        await handle_agcom_contacts(ctx)
        return

    elif cmd == "/agcom-reply":
        await handle_agcom_reply(ctx, command_text)
        return

    elif cmd == "/agcom-search":
        await handle_agcom_search(ctx, command_text)
        return

    elif cmd == "/agcom-status":
        await handle_agcom_status(ctx)
        return

    else:
        await ctx.send(f"❓ Unknown command: `{cmd}`\n\nType `/help` for available commands.")


async def handle_agcom_setup(ctx: ActivityContext[MessageActivity], text: str):
    """
    Handle /agcom-setup command: Initial identity configuration.

    Usage: /agcom-setup <your_name>
    """
    parts = text.split(maxsplit=1)
    if len(parts) < 2:
        await ctx.send(
            "❌ **Usage:** `/agcom-setup <your_name>`\n\n"
            "**Example:** `/agcom-setup Alice` or `/agcom-setup Bob Smith`\n\n"
            "_Tip: You can also just tell me your name naturally!_"
        )
        return

    user_name = parts[1].strip()

    try:
        # Import name conversion
        from assistant.agcom.identity import name_to_handle

        # Convert name to handle
        user_handle = name_to_handle(user_name)

        # Configure identity and save to .env
        env_file = Path(__file__).parent.parent.parent / ".env"
        identity = configure_identity(user_handle, env_file, user_name=user_name)

        # Reload .env and try to register tools dynamically
        load_dotenv(override=True)
        if try_register_agcom_tools_if_configured(tool_registry, tool_storage):
            logger.info("Dynamically registered communication tools")
            tool_storage.load_into_registry(tool_registry)

        # Register the assistant in agcom-api backend (always, regardless of tool registration)
        registered = await register_assistant_in_backend()

        if registered:
            await ctx.send(
                f"✅ **Perfect, {user_name}!**\n\n"
                f"I'm all set up as **{identity.display_name}**.\n\n"
                f"I can now communicate with other assistants on your behalf!"
            )
        else:
            await ctx.send(
                f"✅ **Perfect, {user_name}!**\n\n"
                f"I'm set up as **{identity.display_name}**.\n\n"
                f"⚠️ Could not connect to the agent network. "
                f"Make sure agcom-api is running (`agcom-api`)."
            )

    except ValueError as e:
        await ctx.send(f"❌ **Setup failed:** {e}")
    except IOError as e:
        await ctx.send(f"❌ **Failed to save configuration:** {e}")


async def handle_agcom_send(ctx: ActivityContext[MessageActivity], text: str):
    """
    Handle /agcom-send command: Send a message to another agent.

    Usage: /agcom-send <handle> <subject> <body>
    """
    if not agcom_client:
        await ctx.send("⚠️ agcom is not configured. Set environment variables:\n- `AGCOM_ENABLED=true`\n- `AGCOM_API_URL=http://localhost:8000`\n- `AGCOM_HANDLE=<your_handle>`")
        return

    parts = text.split(maxsplit=3)
    if len(parts) < 4:
        await ctx.send("❌ **Usage:** `/agcom-send <handle> <subject> <body>`\n\n**Example:** `/agcom-send bob \"Project update\" \"Hi Bob, the project is ready.\"`")
        return

    _, to_handle, subject, body = parts

    # Remove quotes if present
    subject = subject.strip('"\'')
    body = body.strip('"\'')

    try:
        message = await agcom_client.send_message([to_handle], subject, body)
        await ctx.send(f"✅ **Message sent to {to_handle}**\n\n**Subject:** {message.subject}\n**ID:** `{message.message_id}`\n**Thread:** `{message.thread_id}`")
    except AgcomError as e:
        await ctx.send(f"❌ **Failed to send message:** {e}")


async def handle_agcom_inbox(ctx: ActivityContext[MessageActivity], text: str):
    """
    Handle /agcom-inbox command: List recent messages.

    Usage: /agcom-inbox [limit]
    """
    if not agcom_client:
        await ctx.send("⚠️ agcom is not configured.")
        return

    # Parse optional limit
    parts = text.split(maxsplit=1)
    limit = 10
    if len(parts) > 1:
        try:
            limit = int(parts[1])
        except ValueError:
            await ctx.send("❌ Invalid limit. Usage: `/agcom-inbox [limit]`")
            return

    try:
        messages = await agcom_client.list_messages(limit=limit)

        if not messages:
            await ctx.send("📭 **Inbox is empty**\n\n_No messages found._")
            return

        lines = [f"📬 **Inbox ({len(messages)} messages)**\n"]
        for i, msg in enumerate(messages, 1):
            timestamp = msg.created_at.strftime("%Y-%m-%d %H:%M")
            lines.append(f"{i}. **From:** {msg.from_handle}")
            lines.append(f"   **Subject:** {msg.subject}")
            lines.append(f"   **ID:** `{msg.message_id}`")
            lines.append(f"   **Time:** {timestamp}\n")

        lines.append("_Use `/agcom-reply <msg_id> <body>` to reply._")
        await ctx.send("\n".join(lines))

    except AgcomError as e:
        await ctx.send(f"❌ **Failed to list messages:** {e}")


async def handle_agcom_threads(ctx: ActivityContext[MessageActivity], text: str):
    """
    Handle /agcom-threads command: List conversation threads.

    Usage: /agcom-threads [limit]
    """
    if not agcom_client:
        await ctx.send("⚠️ agcom is not configured.")
        return

    # Parse optional limit
    parts = text.split(maxsplit=1)
    limit = 10
    if len(parts) > 1:
        try:
            limit = int(parts[1])
        except ValueError:
            await ctx.send("❌ Invalid limit. Usage: `/agcom-threads [limit]`")
            return

    try:
        threads = await agcom_client.list_threads(limit=limit)

        if not threads:
            await ctx.send("📭 **No conversations**\n\n_No threads found._")
            return

        lines = [f"💬 **Conversations ({len(threads)} threads)**\n"]
        for i, thread in enumerate(threads, 1):
            timestamp = thread.last_activity_at.strftime("%Y-%m-%d %H:%M")
            participants = ", ".join(thread.participant_handles)
            lines.append(f"{i}. **Subject:** {thread.subject}")
            lines.append(f"   **Participants:** {participants}")
            lines.append(f"   **ID:** `{thread.thread_id}`")
            lines.append(f"   **Last Activity:** {timestamp}\n")

        await ctx.send("\n".join(lines))

    except AgcomError as e:
        await ctx.send(f"❌ **Failed to list threads:** {e}")


async def handle_agcom_contacts(ctx: ActivityContext[MessageActivity]):
    """
    Handle /agcom-contacts command: List contacts from address book.

    Usage: /agcom-contacts
    """
    if not agcom_client:
        await ctx.send("⚠️ agcom is not configured.")
        return

    try:
        contacts = await agcom_client.list_contacts(active_only=True)

        if not contacts:
            await ctx.send("📇 **No contacts**\n\n_Address book is empty._")
            return

        lines = [f"📇 **Contacts ({len(contacts)})**\n"]
        for contact in contacts:
            display = contact.display_name or contact.handle
            desc = f" - {contact.description}" if contact.description else ""
            tags = f" [{', '.join(contact.tags)}]" if contact.tags else ""
            lines.append(f"- **{display}** (`{contact.handle}`){desc}{tags}")

        await ctx.send("\n".join(lines))

    except AgcomError as e:
        await ctx.send(f"❌ **Failed to list contacts:** {e}")


async def handle_agcom_reply(ctx: ActivityContext[MessageActivity], text: str):
    """
    Handle /agcom-reply command: Reply to a message.

    Usage: /agcom-reply <msg_id> <body>
    """
    if not agcom_client:
        await ctx.send("⚠️ agcom is not configured.")
        return

    parts = text.split(maxsplit=2)
    if len(parts) < 3:
        await ctx.send("❌ **Usage:** `/agcom-reply <msg_id> <body>`\n\n**Example:** `/agcom-reply abc123 \"Thanks for the update!\"`")
        return

    _, message_id, body = parts
    body = body.strip('"\'')

    try:
        reply = await agcom_client.reply_to_message(message_id, body)
        await ctx.send(f"✅ **Reply sent**\n\n**Reply ID:** `{reply.message_id}`\n**Thread:** `{reply.thread_id}`")

    except AgcomError as e:
        await ctx.send(f"❌ **Failed to reply:** {e}")


async def handle_agcom_search(ctx: ActivityContext[MessageActivity], text: str):
    """
    Handle /agcom-search command: Search messages.

    Usage: /agcom-search <query>
    """
    if not agcom_client:
        await ctx.send("⚠️ agcom is not configured.")
        return

    parts = text.split(maxsplit=1)
    if len(parts) < 2:
        await ctx.send("❌ **Usage:** `/agcom-search <query>`\n\n**Example:** `/agcom-search project update`")
        return

    query = parts[1]

    try:
        messages = await agcom_client.search_messages(query, limit=10)

        if not messages:
            await ctx.send(f"🔍 **No results for:** \"{query}\"\n\n_Try a different search term._")
            return

        lines = [f"🔍 **Search Results ({len(messages)} matches for \"{query}\")**\n"]
        for i, msg in enumerate(messages, 1):
            timestamp = msg.created_at.strftime("%Y-%m-%d %H:%M")
            body_preview = msg.body[:100] if len(msg.body) <= 100 else msg.body[:100] + "..."
            lines.append(f"{i}. **From:** {msg.from_handle}")
            lines.append(f"   **Subject:** {msg.subject}")
            lines.append(f"   **Preview:** {body_preview}")
            lines.append(f"   **ID:** `{msg.message_id}`")
            lines.append(f"   **Time:** {timestamp}\n")

        await ctx.send("\n".join(lines))

    except AgcomError as e:
        await ctx.send(f"❌ **Search failed:** {e}")


async def handle_agcom_status(ctx: ActivityContext[MessageActivity]):
    """
    Handle /agcom-status command: Show identity and connection status.

    Usage: /agcom-status
    """
    # Check if identity is configured
    if not is_identity_configured():
        await ctx.send(
            "⚠️ **Identity Not Configured**\n\n"
            "To communicate with other assistants, I need to know your name.\n\n"
            "Just tell me: \"My name is Alice\" and I'll set everything up!"
        )
        return

    # Load identity info
    from assistant.agcom import load_identity
    identity = load_identity()

    if not identity:
        await ctx.send("❌ **Configuration error**\n\nPlease tell me your name again.")
        return

    # If client exists, check connection
    if not agcom_client:
        await ctx.send(
            f"✅ **Your Personal Assistant**\n\n"
            f"I'm the assistant for: **{identity.display_name or identity.user_handle}**\n\n"
            f"⚠️ **Communication system not started**\n\n"
            f"Make sure the agcom API server is running in another terminal:\n"
            f"```bash\nagcom-api\n```"
        )
        return

    try:
        # Try health check
        health = await agcom_client.health_check()

        # Get current identity from server
        server_identity = await agcom_client.whoami()

        status_text = f"""✅ **Your Personal Assistant**

I'm the assistant for: **{identity.display_name or identity.user_handle}**

**Status:** Connected to agent network

I can communicate with other assistants on your behalf.

**Technical Details:**
- Identity: {identity.user_handle}
- Assistant Handle: {identity.assistant_handle}
- API: {agcom_client.settings.api_url}
- Version: {health.get('version', 'unknown')}
"""
        await ctx.send(status_text)

    except AgcomError as e:
        await ctx.send(
            f"❌ **Connection Failed**\n\n"
            f"I'm configured as **{identity.display_name or identity.user_handle}'s assistant**, "
            f"but I can't reach the communication server.\n\n"
            f"**Error:** {e}\n\n"
            f"Make sure the agcom API server is running:\n"
            f"```bash\nagcom-api\n```"
        )


@app.on_message
async def handle_message(ctx: ActivityContext[MessageActivity]):
    """
    Handle incoming messages from users.

    Routes messages through the LLM and returns structured responses.
    If the LLM generates a script, it will be noted in the response.
    """
    # Show typing indicator while processing
    await ctx.reply(TypingActivityInput())

    user_text = ctx.activity.text.strip() if ctx.activity.text else ""
    user_id = ctx.activity.from_.id if ctx.activity.from_ else "unknown"
    conversation_id = ctx.activity.conversation.id if ctx.activity.conversation else "unknown"

    logger.info(f"Received message from {user_id}: {user_text[:100]}...")

    # Check for tool management commands
    if user_text.startswith("/"):
        await handle_command(ctx, user_text, user_id, conversation_id)
        return

    try:
        # Track if identity was configured before this interaction
        identity_was_configured = is_identity_configured()

        # Get LLM config (from config file + environment variables)
        config = get_config(CONFIG_DIR)
        logger.info(f"Using LLM: {config.model_string} (from {config.config_file_path or 'env'})")

        # Load identity for LLM context
        identity_dict = None
        if is_identity_configured():
            identity = load_identity()
            if identity:
                identity_dict = {
                    "handle": identity.assistant_handle,
                    "user_handle": identity.user_handle,
                    "display_name": identity.display_name,
                }

        logger.info("Calling LLM...")
        response = await chat(
            user_message=user_text,
            user_id=user_id,
            conversation_id=conversation_id,
            model=config.model_string,
            tool_registry=tool_registry,
            tool_executor=tool_executor,
            identity=identity_dict,
        )
        logger.info(f"LLM response received: should_execute_script={response.should_execute_script}")
        logger.info(f"LLM message: {response.message[:200]}...")
        if response.script_code:
            logger.info(f"LLM script_code length: {len(response.script_code)} chars")

        # Check if identity was just configured during LLM interaction
        # Need to reload .env because tool runs in subprocess
        load_dotenv(override=True)
        if not identity_was_configured and is_identity_configured():
            logger.info("Identity configuration detected - registering communication tools dynamically")
            if try_register_agcom_tools_if_configured(tool_registry, tool_storage):
                logger.info("Dynamically registered communication tools")
                # Reload tools into executor
                tool_storage.load_into_registry(tool_registry)

            # Register the assistant in agcom-api backend (always, regardless of tool registration)
            await register_assistant_in_backend()

        # If the assistant wants to delegate to the team
        if response.should_execute_script:
            global em_delegator
            if not em_delegator and agcom_client:
                em_delegator = EMDelegator(agcom_client)

            if em_delegator:
                task = response.script_description or response.script_code or user_text
                result = await em_delegator.delegate_task(
                    task_description=task,
                    context=f"Original user request: {user_text}",
                    timeout_seconds=120,
                )
                await ctx.send(result or response.message)
                return

        # Just respond directly
        await ctx.send(response.message)

    except Exception as e:
        logger.error(f"Error processing message: {e}", exc_info=True)
        error_msg = f"❌ Error: {str(e)}\n\n_Check your LLM provider config._"
        await ctx.send(error_msg)


def format_script_result(result: ScriptResult) -> str:
    """Format a script execution result for display."""
    parts = []

    if result.success:
        parts.append("✅ **Script executed successfully**")
    elif result.timed_out:
        parts.append("⏱️ **Script timed out**")
    else:
        parts.append("❌ **Script failed**")

    parts.append(f"_Duration: {result.duration_ms}ms_")

    if result.stdout:
        # Truncate long output for display
        output = result.stdout
        if len(output) > 2000:
            output = output[:2000] + "\n... (truncated)"
        parts.append(f"\n**Output:**\n```\n{output}\n```")

    if result.stderr and not result.success:
        stderr = result.stderr
        if len(stderr) > 1000:
            stderr = stderr[:1000] + "\n... (truncated)"
        parts.append(f"\n**Errors:**\n```\n{stderr}\n```")

    if result.error_message and not result.stdout:
        parts.append(f"\n**Error:** {result.error_message}")

    return "\n".join(parts)


def main():
    """Entry point for the assistant."""
    logger.info("Starting My Assist - Local LLM Assistant")
    logger.info("Version 0.1.0")
    logger.info("")
    logger.info("DevTools will be available at: http://localhost:3979/devtools")
    
    try:
        asyncio.run(app.start())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        return 0
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
