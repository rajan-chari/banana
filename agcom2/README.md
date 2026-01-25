# Agent Communication (agcom)

A Python library for multi-agent communication with email-like messaging, threading, address book, and SQLite persistence. Includes both a Python library API and a production-ready REST API.

## Features

- **Email-like messaging**: Send messages with subject, body, and tags
- **Threading**: Automatic message threading with reply support
- **Address book**: Manage agent identities with display names and descriptions
- **Audit log**: Track all address book operations
- **SQLite persistence**: Reliable storage with WAL mode and optimistic locking
- **Console application**: Interactive CLI for managing messages
- **REST API**: Production-ready HTTP API with JWT authentication
- **Multi-agent support**: Multiple agents can use the same database concurrently

## Installation

```bash
pip install -e .
```

For development:

```bash
pip install -e ".[dev]"
```

For REST API:

```bash
pip install fastapi uvicorn python-jose[cryptography] slowapi pydantic-settings
```

## Quick Start

### Using the REST API

The REST API provides HTTP endpoints for all AgCom functionality with JWT authentication and rate limiting.

#### 1. Initialize Database

```bash
python scripts/init_db.py
```

#### 2. Start the Server

```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Server endpoints:
- **API**: http://127.0.0.1:8000
- **Interactive docs**: http://127.0.0.1:8000/api/v1/docs
- **Health check**: http://127.0.0.1:8000/api/v1/health

#### 3. Generate Authentication Token

```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"agent_handle": "alice", "agent_secret": "your_secret_here"}'
```

Response:
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

#### 4. Send a Message

```bash
curl -X POST http://127.0.0.1:8000/api/v1/messages \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to_handles": ["bob"],
    "subject": "Hello",
    "body": "Test message",
    "tags": ["test"]
  }'
```

#### REST API Endpoints

**Authentication:**
- `POST /api/v1/auth/token` - Generate JWT token

**Messages:**
- `POST /api/v1/messages` - Send message
- `POST /api/v1/messages/{id}/reply` - Reply to message
- `POST /api/v1/messages/broadcast` - Broadcast to multiple recipients
- `GET /api/v1/messages` - List messages
- `GET /api/v1/messages/{id}` - Get specific message
- `GET /api/v1/messages/search` - Search messages

**Threads:**
- `GET /api/v1/threads` - List threads
- `GET /api/v1/threads/{id}` - Get thread details
- `GET /api/v1/threads/{id}/messages` - List thread messages
- `POST /api/v1/threads/{id}/reply` - Reply to thread
- `PUT /api/v1/threads/{id}/metadata` - Update metadata
- `POST /api/v1/threads/{id}/archive` - Archive thread
- `POST /api/v1/threads/{id}/unarchive` - Unarchive thread

**Contacts:**
- `GET /api/v1/contacts` - List contacts
- `POST /api/v1/contacts` - Create contact
- `GET /api/v1/contacts/{handle}` - Get contact
- `PUT /api/v1/contacts/{handle}` - Update contact
- `DELETE /api/v1/contacts/{handle}` - Deactivate contact
- `GET /api/v1/contacts/search` - Search contacts

**Audit & Health:**
- `GET /api/v1/audit/events` - List audit events
- `GET /api/v1/health` - Health check
- `GET /api/v1/health/ready` - Readiness check

See `REST_API_SPEC.md` for complete API documentation and `REST_API_QUICKSTART.md` for quick start guide.

### Using as a Library

```python
from agcom import init, AgentIdentity

# Initialize a session
with init("messages.db", AgentIdentity(handle="alice")) as session:
    # Send a message
    message = session.send(
        to_handles=["bob"],
        subject="Project Discussion",
        body="Can we meet tomorrow to discuss the project?"
    )

    # View inbox
    print(session.current_screen())

    # Reply to a message
    reply = session.reply(message.message_id, body="Sure, I'm available at 2pm")

    # View thread
    print(session.view_thread(message.thread_id))

    # Add to address book
    session.address_book_add(
        handle="bob",
        display_name="Bob Jones",
        description="Senior Developer"
    )
```

### Using the Console Application

#### Interactive Mode

```bash
# Start interactive mode
python -m agcom.console --store messages.db --me alice

# You'll get a prompt where you can enter commands
> ab add bob --display-name "Bob Jones" --desc "Developer"
Added bob to address book

> send bob --subject "Hello" --body "How are you?"
Message sent
Thread ID: 01HZXY...
Message ID: 01HZXZ...

> screen
INBOX
================================================================================

01HZXY...  2024-01-15 10:30:00  alice  Hello

> view 01HZXY...
THREAD: Hello
ID: 01HZXY...
Participants: alice, bob
================================================================================

Message ID: 01HZXZ...
From: alice
To: bob
Date: 2024-01-15 10:30:00

How are you?
--------------------------------------------------------------------------------

> exit
```

#### Single Command Mode

```bash
# Initialize database
python -m agcom.console --store messages.db --me alice init

# Send a message
python -m agcom.console --store messages.db --me alice send bob \
    --subject "Project Update" \
    --body "The project is on track"

# View inbox
python -m agcom.console --store messages.db --me alice screen

# Watch mode (continuous updates)
python -m agcom.console --store messages.db --me alice screen --watch

# List threads
python -m agcom.console --store messages.db --me alice threads

# View a specific thread
python -m agcom.console --store messages.db --me alice view 01HZXY...

# Reply to a message
python -m agcom.console --store messages.db --me alice reply 01HZXZ... \
    --body "Thanks for the update"

# Search messages
python -m agcom.console --store messages.db --me alice search "project"

# Address book commands
python -m agcom.console --store messages.db --me alice ab add bob \
    --display-name "Bob Jones" --desc "Developer"

python -m agcom.console --store messages.db --me alice ab list

python -m agcom.console --store messages.db --me alice ab search "developer"

python -m agcom.console --store messages.db --me alice ab show bob

python -m agcom.console --store messages.db --me alice ab history bob
```

#### Multi-line Input

Use `@-` to read body from stdin:

```bash
python -m agcom.console --store messages.db --me alice send bob \
    --subject "Long message" --body @-
Enter message body (Ctrl+D or Ctrl+Z to finish):
This is a multi-line message.
It can span multiple lines.
Just press Ctrl+D when done.
^D
```

Or read from a file:

```bash
echo "Message body from file" > body.txt
python -m agcom.console --store messages.db --me alice send bob \
    --subject "From file" --body-file body.txt
```

## Multi-Agent Usage

Multiple agents can use the same database concurrently:

```bash
# Terminal 1 (Alice)
python -m agcom.console --store shared.db --me alice
> send bob --subject "Question" --body "What do you think?"

# Terminal 2 (Bob)
python -m agcom.console --store shared.db --me bob
> screen
> reply 01HZXZ... --body "I think it's great!"

# Terminal 1 (Alice)
> screen  # See Bob's reply
```

## Admin User Setup

Admin users can see all messages and threads in the system, bypassing participant filters. This is useful for system administration, debugging, and oversight.

### How Admin Status Works

Admin status is determined by the presence of an `"admin"` tag in the user's address book entry. Admin checks happen dynamically at runtime, so you can promote or demote users by simply editing their tags.

### Creating an Admin User

**Option 1: During initialization (recommended for development):**
```bash
# Initialize database and make yourself the admin in one step
python -m agcom.console --store data/agcom.db --me rajan init --as-admin

# This creates:
# 1. Empty database with schema
# 2. Adds "rajan" to address book with "admin" tag
```

**Option 2: After initialization (recommended for production):**
```bash
# Initialize database first
python scripts/init_db.py

# Add yourself or another user as admin
python -m agcom.console --store data/agcom.db --me system \
    ab add admin-handle --display-name "System Admin" --tags admin
```

### Promoting an Existing User to Admin

```bash
# Add admin tag to existing user
python -m agcom.console --store data/agcom.db --me system \
    ab edit user-handle --tags admin existing-tag
```

### Admin Capabilities

- **See all threads**: Admins bypass participant filtering and can see every thread in the system
- **Access any message**: Admins can retrieve and read any message, even in threads they're not part of
- **Search globally**: Search results include all messages, not just those in threads the admin participates in
- **Full API access**: All REST API endpoints respect admin status

### Security Considerations

- Admin status is powerful - only grant it to trusted users
- Admin actions are logged in the audit trail with the admin's handle
- There is no special "super admin" - all admins have equal privileges
- Admin status can be revoked by removing the `"admin"` tag from the user's address book entry

### Example: Admin Viewing All Threads

```python
from agcom import init, AgentIdentity

# Regular user (alice) sends message to bob
with init("messages.db", AgentIdentity(handle="alice")) as session:
    session.address_book_add("bob", display_name="Bob Smith")
    session.send(["bob"], "Private Message", "This is between Alice and Bob")

# Non-admin user (charlie) cannot see Alice-Bob thread
with init("messages.db", AgentIdentity(handle="charlie")) as session:
    threads = session.list_threads()
    # Returns: [] (empty list)

# Add charlie as admin
with init("messages.db", AgentIdentity(handle="alice")) as session:
    session.address_book_add("charlie", display_name="Charlie Admin", tags=["admin"])

# Admin user (charlie) can now see all threads
with init("messages.db", AgentIdentity(handle="charlie")) as session:
    threads = session.list_threads()
    # Returns: [Thread(subject="Private Message", ...)]
```

## API Reference

### Session Management

```python
from agcom import init, AgentIdentity

# Create a session
session = init(store_path="messages.db", self_identity=AgentIdentity(handle="alice"))

# Use as context manager (recommended)
with init(store_path, self_identity) as session:
    # ... use session
    pass
```

### Messaging

```python
# Send a new message (creates a new thread)
message = session.send(
    to_handles=["bob", "charlie"],
    subject="Subject",
    body="Message body",
    tags=["urgent", "project"]  # Optional
)

# Reply to a specific message
reply = session.reply(
    message_id="01HZXZ...",
    body="Reply body",
    tags=["response"]  # Optional
)

# Reply to the latest message in a thread
reply = session.reply_thread(
    thread_id="01HZXY...",
    body="Reply body"
)

# Broadcast to multiple recipients (creates N threads)
messages = session.send_broadcast(
    to_handles=["bob", "charlie", "dave"],
    subject="Announcement",
    body="Team meeting at 3pm",
    tags=["urgent"]
)

# Send group message (creates 1 thread with multiple participants)
message = session.send_group(
    to_handles=["bob", "charlie"],
    subject="Group Discussion",
    body="Let's discuss the project"
)
```

### Viewing

```python
# Get inbox view
output = session.current_screen(options=ScreenOptions(
    max_threads=20,
    subject_width=50,
    from_width=20
))

# View a thread
output = session.view_thread(thread_id="01HZXY...")

# List threads
threads = session.list_threads(limit=10, offset=0)

# List messages
messages = session.list_messages(thread_id="01HZXY...", limit=10)

# Search messages
results = session.search_messages(
    query="python",
    in_subject=True,
    in_body=True,
    from_handle="alice",
    limit=10
)

# Get specific thread or message
thread = session.get_thread(thread_id="01HZXY...")
message = session.get_message(message_id="01HZXZ...")
```

### Thread Management

```python
# Archive a thread
session.archive_thread(thread_id="01HZXY...")

# Unarchive a thread
session.unarchive_thread(thread_id="01HZXY...")

# Update thread metadata
session.update_thread_metadata(
    thread_id="01HZXY...",
    key="priority",
    value="high"
)

# Get thread metadata
value = session.get_thread_metadata(
    thread_id="01HZXY...",
    key="priority"
)
```

### Address Book

```python
# Add entry
session.address_book_add(
    handle="bob",
    display_name="Bob Jones",  # Optional
    description="Senior Developer",  # Optional
    tags=["colleague", "python"]  # Optional
)

# Update entry (with optimistic locking)
session.address_book_update(
    handle="bob",
    display_name="Bob Jones Sr.",
    description="Lead Developer",
    tags=["colleague", "python", "senior"],
    is_active=True,
    expected_version=2  # For optimistic locking
)

# Get entry
entry = session.address_book_get(handle="bob")

# List entries
entries = session.address_book_list(active_only=True)

# Search entries
results = session.address_book_search(query="developer", active_only=True)
```

### Audit Log

```python
# List all audit events
events = session.audit_list(limit=50)

# List events for specific target
events = session.audit_list(target_handle="bob", limit=10)

# List events by type
events = session.audit_list(event_type="address_book_update", limit=10)
```

## Data Models

All data models are frozen dataclasses:

- `AgentIdentity`: Agent identity with handle and optional display name
- `Message`: A message with metadata, subject, body, and tags
- `Thread`: A conversation thread with participants and metadata
- `AddressBookEntry`: An address book entry with version for optimistic locking
- `AuditEvent`: An audit log entry for address book operations
- `ScreenOptions`: Options for rendering the inbox view

## Architecture

### Core Library
- **Storage Layer** (`storage.py`): SQLite operations with WAL mode and transactions
- **Session Layer** (`session.py`): High-level API for messaging and address book
- **Validation** (`validation.py`): Input validation for all fields
- **Console App** (`console/`): Interactive CLI application
- **Tests** (`tests/`): Comprehensive test suite

### REST API
- **FastAPI Application** (`app/main.py`): API server with CORS and middleware
- **Configuration** (`app/config.py`): Environment-based settings management
- **Authentication** (`app/dependencies.py`): JWT token validation
- **Routers** (`app/routers/`): Endpoint implementations
- **Models** (`app/models/`): Request/response Pydantic models
- **Error Handling** (`app/utils/errors.py`): Exception handlers

## REST API Features

- ✅ **JWT Authentication** - Secure token-based authentication
- ✅ **Rate Limiting** - Per-agent rate limiting (100-500 req/min)
- ✅ **Error Handling** - Comprehensive exception handlers
- ✅ **CORS Support** - Configured for cross-origin requests
- ✅ **Input Validation** - Pydantic models with field validation
- ✅ **Pagination** - Database-level pagination for efficient queries
- ✅ **Health Checks** - Liveness and readiness probes
- ✅ **OpenAPI Docs** - Auto-generated interactive API documentation
- ✅ **SQLite Integration** - WAL mode with retry logic for concurrency

## Testing

### Library Tests

Run the test suite:

```bash
pytest agcom/tests/ -v
```

Run specific test file:

```bash
pytest agcom/tests/test_validation.py -v
```

### REST API Tests

Run the comprehensive API test:

```bash
python test_api.py
```

This tests all endpoints including:
- Authentication and token generation
- Message sending and replies
- Thread management and archiving
- Contact CRUD operations
- Broadcasting and search

## Configuration

### REST API Configuration

Environment variables (see `.env.example`):
- `DB_PATH` - Database file path (default: `./data/agcom.db`)
- `SECRET_KEY` - JWT signing key (generate with `openssl rand -hex 32`)
- `ALGORITHM` - JWT algorithm (default: `HS256`)
- `ACCESS_TOKEN_EXPIRE_MINUTES` - Token expiration (default: 60)
- `CORS_ORIGINS` - Allowed CORS origins
- `WORKERS` - Number of workers (must be 1 for SQLite)

## Requirements

### Core Library
- Python 3.10+
- python-ulid (for ULID generation)
- SQLite 3 (included with Python)

### REST API
- FastAPI 0.109+
- Uvicorn 0.27+
- python-jose[cryptography] 3.3+
- slowapi 0.1+ (rate limiting)
- pydantic-settings 2.1+

## Documentation

- **README.md** (this file) - Overview and quick start
- **REST_API_SPEC.md** - Complete REST API specification
- **REST_API_QUICKSTART.md** - REST API quick start guide
- **API Docs** - http://127.0.0.1:8000/api/v1/docs (when server running)

## Production Deployment

For production use of the REST API:

1. **Security**
   - Use strong `SECRET_KEY` (32+ random characters)
   - Enable HTTPS/TLS
   - Configure proper CORS origins (no wildcards)
   - Implement proper authentication (not just token generation)
   - Set request size limits

2. **Database**
   - Use single worker (`--workers 1`) for SQLite
   - Set up automated backups
   - Monitor database size and growth
   - Consider PostgreSQL for >100 agents or >10k messages/day

3. **Monitoring**
   - Set up health check monitoring
   - Configure logging and log rotation
   - Track key metrics (requests, errors, rate limits)
   - Implement alerting for errors

4. **Infrastructure**
   - Use reverse proxy (nginx/Caddy) for HTTPS
   - Configure firewall rules
   - Set up resource limits (CPU, memory)
   - Implement graceful shutdown handling

See `REST_API_SPEC.md` for complete production checklist.

## Known Limitations

### REST API
- SQLite single-writer limitation (use PostgreSQL for high-write scenarios)
- No real-time push notifications (polling required)
- No file attachments (text messages only)
- In-memory rate limiting (not distributed across instances)
- Suitable for <100 agents, <10k messages/day

## License

MIT License

## Contributing

Contributions are welcome! Please ensure all tests pass before submitting a pull request.

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run library tests
pytest agcom/tests/ -v

# Run REST API tests
python test_api.py
```
