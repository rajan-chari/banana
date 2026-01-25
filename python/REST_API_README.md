# agcom REST API

A FastAPI-based REST API that exposes the agcom library's functionality for multi-agent communication.

## Features

- **Session-based authentication** with token-based access control
- **Complete message management** - send, reply, list, search messages
- **Thread management** - organize conversations with metadata
- **Address book / contacts** - manage agent profiles and relationships
- **Audit logging** - track all system operations
- **OpenAPI documentation** - auto-generated interactive API docs
- **Shared database** - API and CLI work with the same data

## Quick Start

### Installation

The API is included in the agcom package:

```bash
cd python
pip install -e ".[dev]"
```

### Start the Server

```bash
# Using the command-line tool
agcom-api

# Or run directly
python -m agcom_api.main
```

The API will be available at `http://localhost:8000`.

### View Documentation

Open your browser to:
- **Interactive API docs (Swagger UI)**: http://localhost:8000/docs
- **Alternative docs (ReDoc)**: http://localhost:8000/redoc

## Configuration

Configure the API using environment variables:

```bash
# Database path (shared with CLI)
export AGCOM_DB_PATH=./data/agcom.db

# API server settings
export AGCOM_API_HOST=0.0.0.0
export AGCOM_API_PORT=8000
export AGCOM_API_RELOAD=false

# Session expiry (hours)
export AGCOM_SESSION_EXPIRY=24
```

## API Usage

### 1. Login

Create a session to get an authentication token:

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"handle": "alice", "display_name": "Alice Smith"}'
```

Response:
```json
{
  "token": "uuid-token-here",
  "expires_at": "2026-01-26T12:00:00Z",
  "identity": {
    "handle": "alice",
    "display_name": "Alice Smith"
  }
}
```

### 2. Send a Message

Use the token to send messages:

```bash
curl -X POST http://localhost:8000/api/messages/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "to_handles": ["bob"],
    "subject": "Hello",
    "body": "Hello Bob!",
    "tags": ["greeting"]
  }'
```

### 3. List Threads

```bash
curl http://localhost:8000/api/threads \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Add a Contact

```bash
curl -X POST http://localhost:8000/api/contacts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "handle": "bob",
    "display_name": "Bob Jones",
    "description": "Friend",
    "tags": ["friend", "dev"]
  }'
```

## API Endpoints

### Authentication (`/api/auth`)

- `POST /api/auth/login` - Create session
- `POST /api/auth/logout` - Invalidate session
- `GET /api/auth/whoami` - Get current identity

### Messages (`/api/messages`)

- `POST /api/messages/send` - Send new message (creates thread)
- `POST /api/messages/{message_id}/reply` - Reply to message
- `GET /api/messages` - List messages
- `GET /api/messages/{message_id}` - Get message by ID
- `GET /api/messages/search` - Search messages

### Threads (`/api/threads`)

- `GET /api/threads` - List threads
- `GET /api/threads/{thread_id}` - Get thread details
- `GET /api/threads/{thread_id}/messages` - Get all messages in thread
- `POST /api/threads/{thread_id}/reply` - Reply to latest message
- `PUT /api/threads/{thread_id}/metadata` - Set metadata key
- `GET /api/threads/{thread_id}/metadata/{key}` - Get metadata value
- `POST /api/threads/{thread_id}/archive` - Archive thread
- `POST /api/threads/{thread_id}/unarchive` - Unarchive thread

### Contacts (`/api/contacts`)

- `POST /api/contacts` - Add contact
- `GET /api/contacts` - List contacts
- `GET /api/contacts/{handle}` - Get contact
- `PUT /api/contacts/{handle}` - Update contact
- `GET /api/contacts/search` - Search contacts
- `DELETE /api/contacts/{handle}` - Deactivate contact

### Audit (`/api/audit`)

- `GET /api/audit/events` - List audit events

### Health (`/api/health`)

- `GET /api/health` - Health check

## Error Handling

The API uses standard HTTP status codes:

- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Missing or invalid token
- `404 Not Found` - Resource not found
- `409 Conflict` - Version conflict or duplicate resource
- `500 Internal Server Error` - Server error

Error responses include details:

```json
{
  "error": "validation_error",
  "message": "Handle must be lowercase alphanumeric"
}
```

## Testing

### Run Automated Tests

```bash
cd python
pytest tests/test_api.py -v
```

### Manual Testing Script

```bash
# Start the server first
agcom-api

# In another terminal, run the test script
python test_api_live.py
```

## Integration with CLI

The API and CLI share the same database, so data is synchronized:

```bash
# Initialize database with CLI
agcom init --store shared.db --me alice

# Send message via CLI (new simple syntax)
agcom send bob "Test message" "Hello from CLI"

# View same messages via API
curl http://localhost:8000/api/messages \
  -H "Authorization: Bearer YOUR_TOKEN"

# Or view via CLI
agcom screen
agcom view 1
```

The CLI now supports:
- Simple command syntax: `agcom send bob "Subject" "Body"`
- Numbered indices: `agcom view 1` instead of copying ULIDs
- Auto-saved config: No need for `--store` and `--me` after init

See [agcom/README.md](./agcom/README.md) for complete CLI documentation.

## Development

### Run with Auto-reload

```bash
export AGCOM_API_RELOAD=true
agcom-api
```

Or:

```bash
uvicorn agcom_api.main:app --reload
```

### Project Structure

```
python/agcom_api/
├── __init__.py
├── main.py              # FastAPI app
├── auth.py              # Session management
├── dependencies.py      # FastAPI dependencies
├── models/
│   ├── requests.py      # Request models
│   └── responses.py     # Response models
└── routers/
    ├── auth.py          # Authentication endpoints
    ├── messages.py      # Message endpoints
    ├── threads.py       # Thread endpoints
    ├── contacts.py      # Contact endpoints
    ├── audit.py         # Audit endpoints
    └── health.py        # Health check
```

## Future Enhancements

- WebSocket support for real-time updates
- Batch operations
- File attachments
- Rate limiting
- API key authentication
- Prometheus metrics

## License

MIT
