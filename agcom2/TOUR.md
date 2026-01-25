# AgCom REST API - Guided Tour 🚀

## Overview
A friendly walkthrough of the AgCom REST API to see how it works. This tour explores all key features interactively with real examples and results.

## Prerequisites
- Python 3.10+
- AgCom library and REST API installed
- Database initialized at `./data/agcom.db`
- Server configuration in `.env` file

---

## Tour Stops

### 🏁 Stop 1: Documentation Check ✅

**What to review:**
- README.md - Main project overview
- DOCS.md - Documentation index
- REST_API_SPEC.md - Complete API specification
- REST_API_QUICKSTART.md - Quick start guide

**Key findings:**
- 25+ REST API endpoints implemented
- JWT authentication
- Rate limiting (per-agent)
- SQLite with WAL mode
- Comprehensive error handling
- OpenAPI/Swagger docs at `/api/v1/docs`

---

### 🚀 Stop 2: Start the Server

**Command:**
```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

**Endpoints available:**
- **API Base**: http://127.0.0.1:8000
- **Interactive Docs**: http://127.0.0.1:8000/api/v1/docs
- **Health Check**: http://127.0.0.1:8000/api/v1/health

**Note**: Must use `--workers 1` for SQLite compatibility (single-writer limitation)

**Result:**
```
[To be filled during tour]
```

---

### 🏥 Stop 3: Health Check

**Endpoints to test:**

1. **Basic Health Check** (liveness probe):
```bash
curl http://127.0.0.1:8000/api/v1/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-24T...",
  "version": "1.0.0"
}
```

2. **Readiness Check** (includes database status):
```bash
curl http://127.0.0.1:8000/api/v1/health/ready
```

**Expected response:**
```json
{
  "status": "ready",
  "database": {
    "connected": true,
    "initialized": true,
    "path": "./data/agcom.db"
  },
  "timestamp": "2026-01-24T..."
}
```

**Result:**
```
[To be filled during tour]
```

---

### 🔐 Stop 4: Get Authentication Tokens

Generate JWT tokens for two test agents: Alice and Bob

**Generate token for Alice:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"agent_handle": "alice", "agent_secret": "alice_secret_123"}'
```

**Expected response:**
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Generate token for Bob:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"agent_handle": "bob", "agent_secret": "bob_secret_456"}'
```

**Save tokens for use in subsequent requests:**
```bash
# Linux/Mac
export ALICE_TOKEN="<alice-token-here>"
export BOB_TOKEN="<bob-token-here>"

# Windows CMD
set ALICE_TOKEN=<alice-token-here>
set BOB_TOKEN=<bob-token-here>

# Windows PowerShell
$env:ALICE_TOKEN="<alice-token-here>"
$env:BOB_TOKEN="<bob-token-here>"
```

**Result:**
```
Alice Token: [To be filled during tour]
Bob Token: [To be filled during tour]
```

---

### 📨 Stop 5: Send Your First Message

Alice sends a message to Bob.

**Command:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/messages \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to_handles": ["bob"],
    "subject": "Welcome to AgCom!",
    "body": "Hi Bob, this is Alice. Welcome to the AgCom REST API!",
    "tags": ["welcome", "intro"]
  }'
```

**What happens:**
- Creates a new thread automatically
- Alice is the sender (from token)
- Bob is the recipient
- Thread gets a unique ID
- Message gets a unique ID
- Timestamps are auto-generated

**Expected response:**
```json
{
  "message_id": "01HZXZ...",
  "thread_id": "01HZXY...",
  "from_handle": "alice",
  "to_handles": ["bob"],
  "subject": "Welcome to AgCom!",
  "body": "Hi Bob, this is Alice. Welcome to the AgCom REST API!",
  "created_at": "2026-01-24T...",
  "in_reply_to": null,
  "tags": ["welcome", "intro"]
}
```

**Save the IDs:**
```bash
export THREAD_ID="<thread-id-from-response>"
export MESSAGE_ID="<message-id-from-response>"
```

**Result:**
```
Thread ID: [To be filled during tour]
Message ID: [To be filled during tour]
```

---

### 💬 Stop 6: Reply to a Message

Bob replies to Alice's message.

**Command:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/messages/$MESSAGE_ID/reply \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "Hi Alice! Thanks for the welcome. This API is great!",
    "tags": ["reply", "intro"]
  }'
```

**What happens:**
- Reply is added to the same thread
- `in_reply_to` field points to Alice's message
- Thread's `last_activity_at` is updated
- Subject is inherited from original message

**Expected response:**
```json
{
  "message_id": "01HZXZ...",
  "thread_id": "01HZXY...",
  "from_handle": "bob",
  "to_handles": ["alice"],
  "subject": "Re: Welcome to AgCom!",
  "body": "Hi Alice! Thanks for the welcome. This API is great!",
  "created_at": "2026-01-24T...",
  "in_reply_to": "01HZXZ...",
  "tags": ["reply", "intro"]
}
```

**View the conversation:**
```bash
curl -H "Authorization: Bearer $ALICE_TOKEN" \
  http://127.0.0.1:8000/api/v1/threads/$THREAD_ID/messages
```

**Result:**
```
[To be filled during tour]
```

---

### 📇 Stop 7: Try the Address Book

Add and manage contacts.

**1. Add a contact:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/contacts \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "handle": "charlie",
    "display_name": "Charlie Chen",
    "description": "Backend engineer specializing in Python",
    "tags": ["engineer", "python", "backend"]
  }'
```

**2. Update contact information:**
```bash
curl -X PUT http://127.0.0.1:8000/api/v1/contacts/charlie \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Charlie Chen Sr.",
    "description": "Senior Backend Engineer",
    "tags": ["engineer", "python", "backend", "senior"],
    "is_active": true,
    "expected_version": 1
  }'
```

**3. Search for contacts:**
```bash
curl -H "Authorization: Bearer $ALICE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/contacts/search?query=python"
```

**4. List all contacts:**
```bash
curl -H "Authorization: Bearer $ALICE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/contacts"
```

**Result:**
```
[To be filled during tour]
```

---

### 🧵 Stop 8: Explore Threads

Work with conversation threads.

**1. List all threads:**
```bash
curl -H "Authorization: Bearer $ALICE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/threads"
```

**2. Get specific thread details:**
```bash
curl -H "Authorization: Bearer $ALICE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/threads/$THREAD_ID"
```

**3. Update thread metadata (add priority):**
```bash
curl -X PUT http://127.0.0.1:8000/api/v1/threads/$THREAD_ID/metadata \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "priority",
    "value": "high"
  }'
```

**4. Add more metadata (category):**
```bash
curl -X PUT http://127.0.0.1:8000/api/v1/threads/$THREAD_ID/metadata \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "category",
    "value": "onboarding"
  }'
```

**5. View all thread metadata:**
```bash
curl -H "Authorization: Bearer $ALICE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/threads/$THREAD_ID/metadata"
```

**6. Archive the thread:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/threads/$THREAD_ID/archive \
  -H "Authorization: Bearer $ALICE_TOKEN"
```

**7. Unarchive the thread:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/threads/$THREAD_ID/unarchive \
  -H "Authorization: Bearer $ALICE_TOKEN"
```

**8. Filter threads by archived status:**
```bash
# Show only archived threads
curl -H "Authorization: Bearer $ALICE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/threads?archived=true"

# Show only active threads
curl -H "Authorization: Bearer $ALICE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/threads?archived=false"
```

**Result:**
```
[To be filled during tour]
```

---

### 📋 Stop 9: Check the Audit Log

See what's been tracked in the audit trail.

**1. List all audit events:**
```bash
curl -H "Authorization: Bearer $ALICE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/audit/events"
```

**2. Filter by target handle:**
```bash
curl -H "Authorization: Bearer $ALICE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/audit/events?target_handle=charlie"
```

**3. Filter by event type:**
```bash
curl -H "Authorization: Bearer $ALICE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/audit/events?event_type=address_book_add"
```

**What gets audited:**
- Address book additions
- Address book updates
- Address book deletions
- Actor (who did it)
- Target (what was affected)
- Timestamp
- Detailed event data

**Result:**
```
[To be filled during tour]
```

---

### 🎨 Stop 10: Try the Interactive Docs (Bonus!)

Visit the Swagger UI for a visual, interactive experience.

**URL:** http://127.0.0.1:8000/api/v1/docs

**Features:**
- Browse all 25+ endpoints
- See request/response schemas
- Try endpoints directly in the browser
- No curl commands needed!
- Built-in authorization support

**Steps to try:**
1. Open http://127.0.0.1:8000/api/v1/docs in your browser
2. Click "Authorize" button at the top
3. Enter your token in the format: `Bearer <your-token>`
4. Click any endpoint to expand it
5. Click "Try it out"
6. Fill in parameters
7. Click "Execute"
8. See the response!

**Alternative:** ReDoc documentation at http://127.0.0.1:8000/api/v1/redoc

**Result:**
```
[Screenshots or observations to be added during tour]
```

---

## Additional Experiments

### Broadcast Messages
Send the same message to multiple recipients (creates N separate threads):

```bash
curl -X POST http://127.0.0.1:8000/api/v1/messages/broadcast \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to_handles": ["bob", "charlie", "dave"],
    "subject": "Team Announcement",
    "body": "Meeting at 3pm today!",
    "tags": ["announcement", "urgent"]
  }'
```

### Search Messages
Find messages by content:

```bash
curl -H "Authorization: Bearer $ALICE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/messages/search?query=welcome&in_subject=true&in_body=true"
```

### Reply to Thread
Reply to the latest message in a thread:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/threads/$THREAD_ID/reply \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "Adding another message to this conversation!",
    "tags": ["followup"]
  }'
```

---

### 🔒 Stop 11: Privacy & Participant Filtering (NEW!)

Explore how AgCom provides email-like privacy - users only see conversations they're part of.

**1. Create a third user (Charlie) and get their token:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"agent_handle": "charlie", "agent_secret": "charlie_secret_789"}'

export CHARLIE_TOKEN="<charlie-token-here>"
```

**2. Charlie tries to list threads:**
```bash
curl -H "Authorization: Bearer $CHARLIE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/threads"
```

**Expected response:**
```json
{
  "threads": [],
  "pagination": {
    "offset": 0,
    "limit": 50,
    "total": 0,
    "has_more": false
  }
}
```

**Why?** Charlie isn't a participant in the Alice-Bob conversation, so it appears to not exist (email-like privacy).

**3. Charlie tries to access Alice-Bob thread directly:**
```bash
curl -H "Authorization: Bearer $CHARLIE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/threads/$THREAD_ID"
```

**Expected response:**
```json
{
  "detail": "Thread not found"
}
```

**Note:** Returns 404 (not 403) - the thread appears to not exist, providing better privacy.

**4. Charlie sends a message to Alice:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/messages \
  -H "Authorization: Bearer $CHARLIE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to_handles": ["alice"],
    "subject": "Hi from Charlie",
    "body": "Alice, can we chat?",
    "tags": ["intro"]
  }'
```

**5. Now both Alice and Charlie can see their thread:**
```bash
# Alice sees both Alice-Bob and Alice-Charlie threads
curl -H "Authorization: Bearer $ALICE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/threads"

# Charlie only sees Alice-Charlie thread (not Alice-Bob)
curl -H "Authorization: Bearer $CHARLIE_TOKEN" \
  "http://127.0.0.1:8000/api/v1/threads"

# Bob only sees Alice-Bob thread (not Alice-Charlie)
curl -H "Authorization: Bearer $BOB_TOKEN" \
  "http://127.0.0.1:8000/api/v1/threads"
```

**Key takeaway:** Each user has a private inbox showing only their conversations!

**Result:**
```
[To be filled during tour]
```

---

### 👨‍💼 Stop 12: Admin User (NEW!)

Set up an admin user who can see all conversations (for oversight, debugging, or moderation).

**Quick Setup (during initial database setup):**

If you're setting up the database for the first time, you can make yourself the admin automatically:
```bash
python -m agcom.console --store data/agcom.db --me admin init --as-admin
```

This creates the database AND adds "admin" as an admin user in one step!

**Manual Setup (via REST API or existing database):**

**1. Add an admin user to the address book with "admin" tag:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/contacts \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "handle": "admin",
    "display_name": "System Administrator",
    "description": "System admin with full access",
    "tags": ["admin"]
  }'
```

**2. Get a token for the admin user:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"agent_handle": "admin", "agent_secret": "admin_secret_xyz"}'

export ADMIN_TOKEN="<admin-token-here>"
```

**3. Admin lists ALL threads (bypasses participant filtering):**
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://127.0.0.1:8000/api/v1/threads"
```

**Expected response:**
```json
{
  "threads": [
    {"thread_id": "...", "subject": "Hi from Charlie", ...},
    {"thread_id": "...", "subject": "Welcome to AgCom!", ...}
  ],
  "pagination": {
    "total": 2,
    ...
  }
}
```

**Note:** Admin sees BOTH threads (Alice-Bob and Alice-Charlie), even though admin isn't a participant in either!

**4. Admin can access any thread:**
```bash
# Admin can read Alice-Bob thread
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://127.0.0.1:8000/api/v1/threads/$THREAD_ID"

# Admin can read all messages in any thread
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://127.0.0.1:8000/api/v1/threads/$THREAD_ID/messages"
```

**5. Admin search sees everything:**
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://127.0.0.1:8000/api/v1/messages/search?query=welcome"
```

**Expected:** Returns messages from ALL threads containing "welcome"

**6. Promote/demote users:**
```bash
# Promote Bob to admin (add "admin" tag)
curl -X PUT http://127.0.0.1:8000/api/v1/contacts/bob \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Bob Wilson",
    "tags": ["admin"],
    "is_active": true,
    "expected_version": 1
  }'

# Bob's next session will have admin privileges!
```

**Admin use cases:**
- System oversight and monitoring
- Debugging and troubleshooting
- Content moderation
- Compliance and audit requirements

**Result:**
```
[To be filled during tour]
```

---

## Key Features Demonstrated

✅ **Authentication** - JWT bearer tokens with agent identity
✅ **Messaging** - Send, reply, and broadcast messages
✅ **Threading** - Automatic conversation threading
✅ **Participant Filtering** - Email-like privacy (users only see their conversations) **NEW!**
✅ **Admin Role** - System admins can see all threads for oversight **NEW!**
✅ **Metadata** - Flexible key-value metadata on threads
✅ **Address Book** - Contact management with tags and search
✅ **Audit Log** - Complete audit trail of operations
✅ **Health Checks** - Liveness and readiness probes
✅ **Interactive Docs** - Swagger UI for easy exploration
✅ **Rate Limiting** - Per-agent rate limits (100-500 req/min)
✅ **Error Handling** - Comprehensive error responses

---

## Rate Limits

Keep in mind these limits per agent per minute:

| Operation | Limit |
|-----------|-------|
| Write (POST/PUT/DELETE) | 100/min |
| Read (GET) | 500/min |
| Search | 50/min |
| Broadcast | 50/min |
| Health checks | Unlimited |

**Rate limit headers in responses:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1706025660
```

---

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "type": "ValidationError",
    "message": "Handle must contain only lowercase letters",
    "details": { ... },
    "request_id": "abc-123-def"
  }
}
```

**Common status codes:**
- `200` - Success (GET/PUT/DELETE)
- `201` - Created (POST)
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `404` - Not Found
- `409` - Conflict (version mismatch, duplicate)
- `429` - Too Many Requests (rate limit)
- `500` - Internal Server Error
- `503` - Service Unavailable (database locked)

---

## Tips for Exploration

1. **Save IDs**: Store thread IDs and message IDs as you create them for later use
2. **Use Variables**: Export tokens to environment variables to simplify commands
3. **Check Headers**: Rate limit headers tell you when you can make more requests
4. **Try the Docs**: The interactive docs at `/api/v1/docs` are the easiest way to explore
5. **Watch Pagination**: Use `limit` and `offset` parameters for large result sets
6. **Read Errors**: Error messages are descriptive and include request IDs for debugging

---

## Architecture Notes

**Technology Stack:**
- FastAPI 0.109+ (web framework)
- Uvicorn (ASGI server)
- SQLite with WAL mode (database)
- JWT with python-jose (authentication)
- slowapi (rate limiting)
- Pydantic (validation)

**Design Decisions:**
- Single worker for SQLite compatibility
- Per-agent rate limiting (not per-IP)
- Stateless JWT authentication
- Database-level pagination
- Automatic datetime to ISO 8601 conversion

**Suitable For:**
- <100 active agents
- <10,000 messages/day
- Development and testing
- Small to medium deployments

**When to Scale:**
- Move to PostgreSQL for >1000 agents
- Add Redis for distributed rate limiting
- Use load balancer for multiple API instances
- Add WebSocket layer for real-time updates

---

## Next Steps

1. **Customize Authentication**: Replace simple token generation with proper auth
2. **Add Monitoring**: Set up Prometheus metrics and Grafana dashboards
3. **Configure HTTPS**: Use reverse proxy (nginx/Caddy) with Let's Encrypt
4. **Set Up Backups**: Automated SQLite database backups
5. **Production Deployment**: Review checklist in REST_API_SPEC.md

---

## Documentation References

- **Full API Spec**: REST_API_SPEC.md (2,173 lines)
- **Quick Start**: REST_API_QUICKSTART.md
- **Library Docs**: LIBRARY_SPEC.md
- **Main README**: README.md
- **Interactive Docs**: http://127.0.0.1:8000/api/v1/docs (when server running)

---

## Tour Complete! 🎉

You've now explored all major features of the AgCom REST API:
- Authentication with JWT
- Messaging and replies
- Thread management and metadata
- Address book operations
- Audit logging
- Health checks
- Interactive documentation

**Feedback?** Try modifying the commands, experimenting with different parameters, and exploring edge cases!

---

**Last Updated**: 2026-01-25
**API Version**: 1.0.0
**Status**: Ready for exploration ✅

**New in v1.1:**
- 🔒 Participant-based filtering (email-like privacy)
- 👨‍💼 Admin role support for system oversight
