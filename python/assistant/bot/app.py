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

# Initialize the Teams App with DevTools plugin for local development
app = App(plugins=[DevToolsPlugin()])


# Track last generated script for promotion
_last_script: dict | None = None


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

ℹ️ **Info:**
- `/help` - Show this help
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
        status = f"""**System Status**

🔧 **Tools:** {stats['total_tools']} registered ({stats['enabled_tools']} enabled)
📊 **Total Invocations:** {stats['total_invocations']}
📝 **Scripts Directory:** `{SCRIPTS_DIR}`
📁 **Data Directory:** `{DATA_DIR}`
"""
        await ctx.send(status)
        return
    
    else:
        await ctx.send(f"❓ Unknown command: `{cmd}`\n\nType `/help` for available commands.")


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
        # Get LLM config (from config file + environment variables)
        config = get_config(CONFIG_DIR)
        logger.info(f"Using LLM: {config.model_string} (from {config.config_file_path or 'env'})")

        logger.info("Calling LLM...")
        response = await chat(
            user_message=user_text,
            user_id=user_id,
            conversation_id=conversation_id,
            model=config.model_string,
        )
        logger.info(f"LLM response received: should_execute_script={response.should_execute_script}")
        logger.info(f"LLM message: {response.message[:200]}...")
        if response.script_code:
            logger.info(f"LLM script_code length: {len(response.script_code)} chars")

        # Build response message
        message = response.message

        # If the assistant generated a script, save and execute it
        if response.should_execute_script and response.script_code:
            logger.info(">>> SCRIPT EXECUTION PATH <<<")
            
            # Check permissions before execution
            logger.info("Checking permissions...")
            perm_result = permission_checker.check_code(response.script_code)
            logger.info(f"Permission result: level={perm_result.level}, denied={perm_result.denied_reasons}, requests={len(perm_result.requests)}")

            # Save the script
            script = save_script(
                code=response.script_code,
                scripts_dir=SCRIPTS_DIR,
                description=response.script_description,
            )
            logger.info(f"Saved script to: {script.filepath}")

            # Track for potential promotion
            global _last_script
            _last_script = {
                "code": response.script_code,
                "description": response.script_description,
                "filepath": str(script.filepath),
            }

            # Log script generation
            audit_logger.log_script_generated(
                user_id=user_id,
                conversation_id=conversation_id,
                script_path=str(script.filepath),
                description=response.script_description,
            )

            # Show the script
            message += f"\n\n📝 **Script Generated:** `{script.filename}`\n```python\n{response.script_code}\n```"
            if response.script_description:
                message += f"\n\n_{response.script_description}_"
            message += "\n\n💡 _Tip: Use `/promote <tool_name>` to save this as a reusable tool._"

            # Handle permission check results
            if perm_result.denied_reasons:
                # Script was blocked
                logger.warning(f"Script blocked: {perm_result.denied_reasons}")
                message += "\n\n🚫 **Execution blocked:**"
                for reason in perm_result.denied_reasons:
                    message += f"\n- {reason}"
                logger.info(f"Sending blocked message to chat...")
                await ctx.send(message)
                logger.info("Blocked message sent.")
                return

            if perm_result.requests and perm_result.level == PermissionLevel.ASK:
                # Need user confirmation
                logger.info("Permissions require user confirmation")
                message += "\n\n⚠️ **Permissions required:**"
                for req in perm_result.requests:
                    message += f"\n- {req.description}"
                message += "\n\n_Reply 'yes' to execute or 'no' to cancel._"
                logger.info(f"Sending permission request message...")
                await ctx.send(message)
                logger.info("Permission message sent.")
                # TODO: Implement confirmation flow with state management
                # For now, auto-approve in development mode
                permission_checker.approve_all(perm_result.requests)

            # Send the script message first
            logger.info(f"Sending script message to chat (len={len(message)})...")
            await ctx.send(message)
            logger.info("Script message sent.")

            # Execute the script
            logger.info("Sending 'Executing...' message...")
            message_exec = "⏳ _Executing..._"
            await ctx.send(message_exec)
            logger.info("Executing message sent.")

            # Run the script
            logger.info(">>> EXECUTING SCRIPT <<<")
            result = await execute_script(response.script_code)
            logger.info(f"Script result: success={result.success}, return_code={result.return_code}, duration={result.duration_ms}ms")
            logger.info(f"Script stdout: {result.stdout[:500] if result.stdout else '(empty)'}")
            logger.info(f"Script stderr: {result.stderr[:500] if result.stderr else '(empty)'}")

            # Log execution result
            audit_logger.log_script_executed(
                user_id=user_id,
                conversation_id=conversation_id,
                script_path=str(script.filepath),
                success=result.success,
                duration_ms=result.duration_ms,
                return_code=result.return_code,
            )

            # Format and send the result
            result_message = format_script_result(result)
            logger.info(f"Sending result message to chat (len={len(result_message)})...")
            await ctx.send(result_message)
            logger.info("Result message sent. DONE.")
            return

        logger.info(f"No script to execute, sending text response (len={len(message)})...")
        await ctx.send(message)
        logger.info("Text response sent.")

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
