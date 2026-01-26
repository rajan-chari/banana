# agcom Integration Guide

Comprehensive guide for integrating multi-agent communication into the LLM assistant using the agcom REST API.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Configuration](#configuration)
5. [Available Tools for LLM](#available-tools-for-llm)
6. [Available Slash Commands](#available-slash-commands)
7. [Usage Examples](#usage-examples)
8. [Troubleshooting](#troubleshooting)
9. [API Reference](#api-reference)

---

## Overview

### What is agcom Integration?

The agcom integration bridges the LLM assistant with the agcom (agent communication) library, enabling your assistant to:

- Send and receive messages with other agents
- Manage conversations through threaded discussions
- Maintain an address book of contacts
- Search through message history
- Participate in multi-agent workflows

### Why Use It?

Multi-agent communication enables:

- **Collaboration**: Multiple assistants working together on tasks
- **Delegation**: Assign tasks to specialized agents
- **Coordination**: Orchestrate complex workflows across agents
- **History**: Maintain conversation context across sessions
- **Discovery**: Find and connect with other agents

### Integration Status

Current implementation status:

- ✅ **Phase 1**: Core REST API client with async support
- ✅ **Phase 2**: Tool integration with 6 LLM-callable tools
- ✅ **Phase 3**: Slash commands for manual control (7 commands)
- ✅ **Bugs Fixed**: Response parsing, authentication, error handling
- ✅ **Ready for Production**: Fully tested and documented

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    User Interface                       │
│                   (Teams DevTools)                      │
└────────────────────────┬───────────────────────────────┘
                         │
                         │ User Messages / Slash Commands
                         ▼
┌────────────────────────────────────────────────────────┐
│                    Teams Bot                            │
│                  (bot/app.py)                           │
├────────────────────────────────────────────────────────┤
│  • Routes messages to LLM or commands                   │
│  • Handles slash commands (/agcom-send, etc.)          │
│  • Displays results and tool outputs                   │
└────────────────────────┬───────────────────────────────┘
                         │
         ┌───────────────┴──────────────┐
         │                              │
         ▼                              ▼
┌─────────────────────┐      ┌──────────────────────────┐
│   LLM Assistant     │      │   Tool Registry          │
│   (llm/client.py)   │      │   (tools/registry.py)    │
├─────────────────────┤      ├──────────────────────────┤
│ • PydanticAI agent  │◄────►│ • 6 agcom tools          │
│ • Multi-provider    │      │ • Tool discovery         │
│ • Tool invocation   │      │ • Execution tracking     │
└──────────┬──────────┘      └──────────┬───────────────┘
           │                            │
           │                            │
           └────────────┬───────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│              AgcomClient (async)                        │
│         (assistant/agcom/client.py)                     │
├────────────────────────────────────────────────────────┤
│  • Auto-login on first request                          │
│  • Bearer token authentication                          │
│  • Retry logic with exponential backoff                 │
│  • Graceful degradation if API unavailable             │
│  • 24 API methods wrapped                              │
└────────────────────────┬───────────────────────────────┘
                         │
                         │ HTTP REST (Bearer Token)
                         ▼
┌────────────────────────────────────────────────────────┐
│              agcom REST API                             │
│           (agcom_api/main.py)                           │
├────────────────────────────────────────────────────────┤
│  • FastAPI server (port 8000)                           │
│  • Session-based authentication                         │
│  • 28 endpoints (messages, threads, contacts, audit)   │
│  • OpenAPI documentation at /docs                       │
└────────────────────────┬───────────────────────────────┘
                         │
                         │ SQL Queries
                         ▼
┌────────────────────────────────────────────────────────┐
│              SQLite Database                            │
│              (agcom.db)                                 │
├────────────────────────────────────────────────────────┤
│  • Messages & Threads                                   │
│  • Address Book (Contacts)                             │
│  • Audit Logs                                          │
│  • Thread Metadata                                      │
└────────────────────────────────────────────────────────┘
```

---

## Features

### Core Capabilities

✅ **24 API Methods Wrapped**
- Full access to agcom functionality via HTTP REST API
- Authentication, messages, threads, contacts, audit

✅ **6 LLM-Callable Tools**
- Tools registered in the assistant's tool registry
- LLM can invoke tools based on user intent
- Examples: "Send bob a message", "Check my inbox"

✅ **7 Slash Commands**
- Manual control for power users
- Direct message sending, inbox viewing, etc.
- See [Available Slash Commands](#available-slash-commands)

✅ **Auto-Authentication**
- Automatic login on first request
- Bearer token management
- Session persistence

✅ **Retry Logic**
- Exponential backoff for transient failures
- Automatic retry on network errors
- Configurable retry attempts (default: 3)

✅ **Graceful Degradation**
- Assistant continues working if agcom unavailable
- Clear error messages when integration disabled
- Fallback behavior for missing configuration

---

## Configuration

### Environment Variables

The agcom integration is configured via environment variables. These override markdown configuration and defaults.

#### Required Settings

```bash
# Enable/disable agcom integration
AGCOM_ENABLED=true

# REST API base URL
AGCOM_API_URL=http://localhost:8000

# Your agent handle (username for authentication)
AGCOM_HANDLE=my-assistant
```

#### Optional Settings

```bash
# Display name shown to other agents
AGCOM_DISPLAY_NAME="My Assistant"

# Auto-login on first request (recommended: true)
AGCOM_AUTO_LOGIN=true

# Poll interval for checking new messages (seconds)
AGCOM_POLL_INTERVAL=30
```

### Markdown Configuration

You can also configure agcom in the markdown config file: `python/config/assistant.md`

See [Sample Configuration](#sample-configuration-file) below for an example.

### Configuration Priority

Settings are loaded in this order (highest priority first):

1. **Environment Variables** - `AGCOM_*` variables
2. **Markdown Config** - `config/assistant.md`
3. **Defaults** - Fallback values

### Default Values

If not configured, these defaults apply:

```python
enabled: bool = False              # Disabled by default
api_url: str = "http://localhost:8000"
handle: str = <current_username>   # System username
display_name: str | None = None    # No display name
auto_login: bool = True            # Auto-login enabled
poll_interval_seconds: int = 30    # Poll every 30 seconds
```

---

## Available Tools for LLM

The integration registers 6 tools that the LLM can automatically invoke based on user intent.

### 1. send_agcom_message

Send a message to another agent via agcom.

**Parameters:**
- `to_handle` (string, required) - Handle of the recipient agent
- `subject` (string, required) - Subject line of the message
- `body` (string, required) - Body content of the message

**Example User Request:**
> "Send bob a message about the project status"

**LLM Behavior:**
The LLM will generate appropriate subject and body based on context and invoke this tool.

---

### 2. list_agcom_contacts

List all available agents in the agcom address book.

**Parameters:** None

**Example User Request:**
> "Who can I message?" or "Show me available agents"

**LLM Behavior:**
Returns a formatted list of contacts with handles, display names, and descriptions.

---

### 3. get_agcom_inbox

Get recent messages from agcom inbox.

**Parameters:**
- `limit` (integer, optional, default=10) - Maximum number of messages to retrieve

**Example User Request:**
> "Check my messages" or "Show my inbox"

**LLM Behavior:**
Retrieves and formats recent messages with sender, subject, timestamp, and IDs.

---

### 4. search_agcom_messages

Search through message history by keyword or phrase.

**Parameters:**
- `query` (string, required) - Search query to match in subject or body
- `limit` (integer, optional, default=10) - Maximum number of results

**Example User Request:**
> "Find messages about deployment" or "Search for messages from alice"

**LLM Behavior:**
Searches subject and body fields, returns matching messages.

---

### 5. reply_agcom_message

Reply to a specific message in an existing conversation thread.

**Parameters:**
- `message_id` (string, required) - ID of the message to reply to
- `body` (string, required) - Body content of the reply

**Example User Request:**
> "Reply to that message with confirmation"

**LLM Behavior:**
Needs message ID from context (previously shown inbox or search results).

---

### 6. list_agcom_threads

List conversation threads with participants and activity info.

**Parameters:**
- `limit` (integer, optional, default=10) - Maximum number of threads to retrieve

**Example User Request:**
> "Show my conversations" or "List active threads"

**LLM Behavior:**
Returns threads with subject, participants, timestamps, and metadata.

---

## Available Slash Commands

Slash commands provide manual control over agcom functionality. Use these when you want direct access without LLM interpretation.

### 1. `/agcom-send`

Send a message to another agent.

**Syntax:**
```
/agcom-send <handle> <subject> <body>
```

**Example:**
```
/agcom-send bob "Project Update" "The feature is complete and ready for review."
```

**Notes:**
- Quotes around subject/body are optional but recommended if they contain spaces
- Creates a new conversation thread

---

### 2. `/agcom-inbox`

List recent messages from your inbox.

**Syntax:**
```
/agcom-inbox [limit]
```

**Examples:**
```
/agcom-inbox          # Show 10 most recent messages (default)
/agcom-inbox 5        # Show 5 most recent messages
/agcom-inbox 20       # Show 20 most recent messages
```

**Output:**
- Message number (for easy reference)
- Sender handle
- Subject line
- Message ID (for replying)
- Timestamp

---

### 3. `/agcom-threads`

List conversation threads.

**Syntax:**
```
/agcom-threads [limit]
```

**Examples:**
```
/agcom-threads        # Show 10 most recent threads (default)
/agcom-threads 5      # Show 5 most recent threads
```

**Output:**
- Thread subject
- Participants (handles)
- Last activity timestamp
- Thread ID

---

### 4. `/agcom-contacts`

List all contacts in your address book.

**Syntax:**
```
/agcom-contacts
```

**Output:**
- Contact handle
- Display name (if set)
- Description (if set)
- Tags (if any)

---

### 5. `/agcom-reply`

Reply to a specific message.

**Syntax:**
```
/agcom-reply <message_id> <body>
```

**Example:**
```
/agcom-reply msg_abc123 "Thanks for the update! I'll review it today."
```

**Notes:**
- Get message IDs from `/agcom-inbox` or `/agcom-search`
- Reply is added to the same thread as the original message

---

### 6. `/agcom-search`

Search through message history.

**Syntax:**
```
/agcom-search <query>
```

**Example:**
```
/agcom-search deployment
/agcom-search "project update"
```

**Output:**
- Matching messages with sender, subject, body preview
- Searches both subject and body fields
- Returns up to 10 results by default

---

### 7. `/agcom-status`

Show agcom connection and configuration status.

**Syntax:**
```
/agcom-status
```

**Output:**
- Connection status (connected/disconnected)
- API URL
- Your agent handle
- Authentication status
- Last health check result

---

## Usage Examples

### Example 1: Starting the API Server

Before using agcom features, start the REST API server:

```bash
# Terminal 1: Start the agcom API server
cd python
agcom-api

# Output:
# INFO:     Started server process [12345]
# INFO:     Waiting for application startup.
# INFO:     Application startup complete.
# INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

The API server must be running for the assistant to communicate with other agents.

---

### Example 2: Configuring the Assistant

Set environment variables before starting the assistant:

```bash
# Terminal 2: Configure and start assistant
export AGCOM_ENABLED=true
export AGCOM_API_URL=http://localhost:8000
export AGCOM_HANDLE=my-assistant
export AGCOM_DISPLAY_NAME="My Assistant"

# Start the assistant
cd python
my-assist

# Output:
# INFO:assistant.bot.app:agcom integration enabled - 6 tools registered
# INFO:microsoft_teams.devtools:DevTools running at http://localhost:3979/devtools
```

---

### Example 3: Sending Messages (LLM)

User natural language is automatically converted to tool invocations:

**User Input:**
> "Send alice a message: Project deployment is complete"

**LLM Behavior:**
1. Recognizes intent to send message
2. Extracts recipient (alice) and content
3. Generates appropriate subject line
4. Invokes `send_agcom_message` tool
5. Shows confirmation with message ID

**Assistant Response:**
```
✅ Message sent to alice

Subject: Project deployment is complete
ID: msg_xyz789
Thread: thread_abc123
```

---

### Example 4: Sending Messages (Manual)

Use slash commands for direct control:

**User Input:**
```
/agcom-send alice "Project Deployment" "The deployment to production is complete. All tests passed successfully."
```

**Assistant Response:**
```
✅ Message sent to alice

Subject: Project Deployment
ID: msg_xyz789
Thread: thread_abc123
```

---

### Example 5: Checking Inbox

**User Input:**
> "Check my messages"

**LLM Behavior:**
Invokes `get_agcom_inbox` tool with default limit.

**Assistant Response:**
```
📬 Inbox (3 messages)

1. From: bob
   Subject: Review request
   ID: msg_001
   Time: 2026-01-25 14:30

2. From: alice
   Subject: Meeting notes
   ID: msg_002
   Time: 2026-01-25 13:15

3. From: charlie
   Subject: Bug report
   ID: msg_003
   Time: 2026-01-25 12:00

Use /agcom-reply <msg_id> <body> to reply.
```

---

### Example 6: Querying Contacts

**User Input:**
> "Who can I message?"

**LLM Behavior:**
Invokes `list_agcom_contacts` tool.

**Assistant Response:**
```
Found 3 contact(s):

Handle: alice
  Display Name: Alice Cooper
  Description: Frontend developer
  Tags: team, frontend

Handle: bob
  Display Name: Bob Smith
  Description: Backend engineer
  Tags: team, backend

Handle: charlie
  Display Name: Charlie Davis
  Description: DevOps specialist
  Tags: team, devops
```

---

### Example 7: Managing Conversations

**User Input:**
```
/agcom-threads 5
```

**Assistant Response:**
```
💬 Conversations (3 threads)

1. Subject: Project Deployment
   Participants: my-assistant, alice
   Thread ID: thread_abc123
   Last Activity: 2026-01-25 14:30

2. Subject: Review request
   Participants: my-assistant, bob
   Thread ID: thread_def456
   Last Activity: 2026-01-25 14:30

3. Subject: Bug report
   Participants: my-assistant, charlie
   Thread ID: thread_ghi789
   Last Activity: 2026-01-25 12:00
```

---

### Example 8: Searching Messages

**User Input:**
> "Find messages about deployment"

**LLM Behavior:**
Invokes `search_agcom_messages` tool with query="deployment".

**Assistant Response:**
```
Found 2 message(s) matching 'deployment':

[2026-01-25 14:30] Project Deployment
  From: my-assistant
  To: alice
  ID: msg_xyz789
  Body: The deployment to production is complete. All tests passed suc...

[2026-01-25 10:15] Deployment schedule
  From: bob
  To: my-assistant, alice
  ID: msg_abc456
  Body: Here's the schedule for next week's deployment. Please review...
```

---

## Troubleshooting

### Error: "agcom is not configured"

**Problem:**
```
⚠️ agcom is not configured. Set environment variables:
- AGCOM_ENABLED=true
- AGCOM_API_URL=http://localhost:8000
- AGCOM_HANDLE=<your_handle>
```

**Solution:**

1. Set required environment variables:
   ```bash
   export AGCOM_ENABLED=true
   export AGCOM_API_URL=http://localhost:8000
   export AGCOM_HANDLE=my-assistant
   ```

2. Restart the assistant:
   ```bash
   my-assist
   ```

3. Verify configuration:
   ```
   /agcom-status
   ```

---

### Error: "Connection refused" or "Failed to connect to agcom API"

**Problem:**
```
❌ Failed to connect to agcom API: Cannot connect to host localhost:8000
```

**Solution:**

1. Check if API server is running:
   ```bash
   curl http://localhost:8000/api/health
   ```

2. If not running, start the API server:
   ```bash
   agcom-api
   ```

3. Verify API URL in configuration:
   ```bash
   echo $AGCOM_API_URL
   # Should output: http://localhost:8000
   ```

4. Check firewall settings (port 8000 must be open)

---

### Error: "Authentication failed or token expired"

**Problem:**
```
❌ Authentication failed or token expired
```

**Solution:**

1. Check your handle is configured:
   ```bash
   echo $AGCOM_HANDLE
   ```

2. Verify auto-login is enabled:
   ```bash
   echo $AGCOM_AUTO_LOGIN
   # Should output: true (or be unset)
   ```

3. Restart the assistant to force re-authentication:
   ```bash
   # Stop assistant (Ctrl+C)
   # Start again
   my-assist
   ```

4. Check API server logs for authentication errors:
   ```bash
   # In API server terminal, look for login errors
   ```

---

### Error: "Resource not found" (404)

**Problem:**
```
❌ Failed to list messages: Resource not found
```

**Possible Causes:**

1. **Empty database**: No messages exist yet
   - Solution: Send a test message first

2. **Wrong message/thread ID**: ID doesn't exist
   - Solution: Use `/agcom-inbox` to get valid IDs

3. **Contact not found**: Handle doesn't exist
   - Solution: Use `/agcom-contacts` to see available contacts

---

### Issue: "agcom tools will not be available" (Warning)

**Problem:**
```
WARNING:assistant.bot.app:agcom integration failed: <error>
WARNING:assistant.bot.app:agcom tools will not be available
```

**Meaning:**
The assistant detected agcom was enabled but couldn't initialize it. The assistant continues working, but agcom features are disabled.

**Common Causes:**

1. **API server not running**
   - Solution: Start `agcom-api`

2. **Wrong API URL**
   - Solution: Check `AGCOM_API_URL` points to running server

3. **Network connectivity issue**
   - Solution: Test connection with `curl http://localhost:8000/api/health`

---

### Issue: Messages not showing up

**Problem:**
Messages sent via CLI don't appear in assistant inbox (or vice versa).

**Solution:**

1. Verify both use the same database:
   ```bash
   # Check CLI database
   echo $AGCOM_DB_PATH

   # Check API database
   # Should be the same file
   ```

2. Ensure you're logged in with the correct handle:
   ```bash
   # CLI
   agcom whoami

   # Assistant
   /agcom-status
   ```

3. Check message filters (archived, participant filtering)

---

### Performance Issues

**Problem:**
Slow response times when querying messages or threads.

**Solution:**

1. Reduce query limits:
   ```bash
   /agcom-inbox 5      # Instead of default 10
   /agcom-threads 3    # Smaller result sets
   ```

2. Check database size:
   ```bash
   ls -lh <path_to_agcom.db>
   ```

3. Restart API server to clear caches:
   ```bash
   # Stop API server (Ctrl+C)
   agcom-api
   ```

---

## API Reference

### REST API Documentation

Full API documentation is available at:

- **Interactive Docs**: http://localhost:8000/docs (Swagger UI)
- **Alternative Docs**: http://localhost:8000/redoc (ReDoc)
- **OpenAPI Spec**: http://localhost:8000/openapi.json

### agcom Library Documentation

For details on the underlying agcom library:

- **README**: `python/agcom/README.md`
- **Quickstart**: `python/agcom/QUICKSTART.md`
- **Changelog**: `python/agcom/CHANGELOG.md`

### Client API Reference

The `AgcomClient` class provides all methods. See `python/assistant/agcom/client.py` for full API.

#### Key Methods

**Authentication:**
- `login(handle, display_name)` - Create session
- `logout()` - Invalidate session
- `whoami()` - Get current identity

**Messages:**
- `send_message(to_handles, subject, body, tags)` - Send new message
- `reply_to_message(message_id, body, tags)` - Reply to message
- `list_messages(thread_id, limit, offset)` - List messages
- `get_message(message_id)` - Get specific message
- `search_messages(query, filters)` - Search messages

**Threads:**
- `list_threads(archived, limit, offset)` - List threads
- `get_thread(thread_id)` - Get thread details
- `get_thread_messages(thread_id, limit, offset)` - Get thread messages
- `reply_to_thread(thread_id, body, tags)` - Reply to thread
- `archive_thread(thread_id)` - Archive thread
- `unarchive_thread(thread_id)` - Unarchive thread
- `set_thread_metadata(thread_id, key, value)` - Set metadata
- `get_thread_metadata(thread_id, key)` - Get metadata

**Contacts:**
- `add_contact(handle, display_name, description, tags)` - Add contact
- `list_contacts(active_only, limit, offset)` - List contacts
- `get_contact(handle)` - Get contact details
- `update_contact(handle, fields)` - Update contact
- `search_contacts(query, limit)` - Search contacts
- `deactivate_contact(handle)` - Deactivate contact

**Audit:**
- `list_audit_events(filters, limit, offset)` - List audit events

**Health:**
- `health_check()` - Check API health

---

## Getting Help

### Community Resources

- **GitHub Issues**: Report bugs or request features
- **Documentation**: Check this guide and agcom library docs
- **Examples**: See usage examples above

### Debug Mode

Enable debug logging to troubleshoot issues:

```bash
export LOG_LEVEL=DEBUG
my-assist
```

This will show detailed logs of:
- HTTP requests to agcom API
- Authentication attempts
- Tool invocations
- Error stack traces

### Common Questions

**Q: Can I use agcom without the assistant?**

Yes! The agcom library has a full CLI:

```bash
agcom init --store mydb.db --me alice
agcom send bob "Subject" "Body"
agcom screen
```

**Q: Can multiple assistants share the same database?**

Yes! Multiple agents (assistants or CLI sessions) can connect to the same agcom database simultaneously. The API server handles concurrent access.

**Q: Is authentication secure?**

The current implementation uses bearer tokens suitable for local/trusted networks. For production use over untrusted networks, add HTTPS/TLS support.

**Q: Can I customize tool behavior?**

Yes! Edit the tool scripts in `python/assistant/agcom/tools.py` to modify how tools work. You can also disable specific tools in the registry.

**Q: How do I backup my messages?**

The agcom database is a single SQLite file. Back it up with:

```bash
cp $AGCOM_DB_PATH agcom_backup_$(date +%Y%m%d).db
```

---

## Next Steps

1. **Start the API server**: `agcom-api`
2. **Configure environment**: Set `AGCOM_*` variables
3. **Launch assistant**: `my-assist`
4. **Add contacts**: Use `/agcom-contacts` or add via CLI
5. **Send first message**: Try natural language or `/agcom-send`
6. **Explore tools**: Ask LLM to check inbox, search messages, etc.

**Happy agent collaboration!**
