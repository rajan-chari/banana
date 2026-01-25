# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

This project is part of the **banana workspace** - a multi-project repository.

- **Workspace root:** `../` (one level up)
- **Project location:** `banana/agcom2/`
- **Git repository:** Managed at workspace level (`../git`)
- **Working directory:** All commands below assume you're in the `agcom2/` directory

## Project Overview

**AgCom** (Agent Communication) is a Python library and REST API for multi-agent communication that emulates email-like messaging. It provides threading, address book management, audit logging, and SQLite persistence with concurrent access support.

**Tech Stack:** Python 3.10+, SQLite with WAL mode, FastAPI, JWT authentication

## Development Commands

### Setup

```bash
# Install library only
pip install -e .

# Install with dev dependencies
pip install -e ".[dev]"

# Install REST API dependencies
pip install fastapi uvicorn python-jose[cryptography] slowapi pydantic-settings
```

### Testing

```bash
# Run all library tests
pytest agcom/tests/ -v

# Run specific test file
pytest agcom/tests/test_validation.py -v

# Run REST API comprehensive test
python test_api.py

# Run alternative API test
python test_api_8004.py
```

### Running the Application

```bash
# Initialize database
python scripts/init_db.py

# Or initialize with console (optionally as admin)
python -m agcom.console --store messages.db --me alice init
python -m agcom.console --store messages.db --me alice init --as-admin

# Start REST API server (MUST use --workers 1 for SQLite)
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1

# Run console application (interactive mode)
python -m agcom.console --store messages.db --me alice

# Run console application (single command)
python -m agcom.console --store messages.db --me alice screen
```

## Architecture

### Layered Design

```
REST API Layer (FastAPI)
    ↓
Session Layer (AgentCommsSession)
    ↓
Storage Layer (SQLite)
    ↓
Validation & ULID Generation
```

### Core Modules

- **`agcom/session.py`** - Main API surface. `AgentCommsSession` class provides all high-level operations (send, reply, search, address book, audit log).
- **`agcom/storage.py`** - SQLite persistence layer. Manages database schema, transactions, and all SQL operations.
- **`agcom/validation.py`** - Input validation for handles, subjects, bodies, tags, etc. All business rules for field constraints.
- **`agcom/models.py`** - Frozen dataclasses: `AgentIdentity`, `Message`, `Thread`, `AddressBookEntry`, `AuditEvent`, `ScreenOptions`.
- **`agcom/ulid_gen.py`** - ULID generation utilities for unique, sortable identifiers.

### REST API Structure

- **`app/main.py`** - FastAPI application entry point with CORS, error handlers, and middleware registration.
- **`app/config.py`** - Environment-based configuration using pydantic-settings (DB path, JWT secrets, CORS, etc.).
- **`app/dependencies.py`** - FastAPI dependency injection: JWT validation (`get_current_agent`), session creation (`get_session`), rate limiting key extraction.
- **`app/routers/`** - Endpoint implementations organized by domain (auth, messages, threads, contacts, audit, health).
- **`app/models/`** - Pydantic request/response models for API contracts.
- **`app/utils/errors.py`** - Exception classes and error handling utilities.

### Database Schema

**Key Tables:**
- `threads` - Conversation threads with subject, participants, timestamps, metadata JSON
- `messages` - Individual messages with threading support (`in_reply_to`), tags JSON
- `address_book` - Agent contacts with versioning for optimistic locking
- `audit_log` - Immutable audit trail for address book operations

**Important Indexes:**
- `idx_threads_last_activity` - Powers inbox ordering by recency
- `idx_messages_thread` - Efficient thread message retrieval
- `idx_messages_from`, `idx_messages_created_at` - Search and filtering

### Concurrency Model

- **SQLite WAL mode** - Allows concurrent reads while one writer operates
- **Single worker requirement** - REST API MUST run with `--workers 1` due to SQLite's single-writer limitation
- **Optimistic locking** - Address book entries have version numbers to detect concurrent modifications
- **Connection management** - Each agent session gets its own connection with `check_same_thread=False`
- **Busy timeout** - 5000ms pragma allows contention handling

## Key Constraints & Validation Rules

These are enforced in `validation.py`:

- **Handles:** 2-64 chars, lowercase alphanumeric + `.` `-` `_`, no leading/trailing `.` `-`
- **Subjects:** 1-200 characters
- **Bodies:** 1-50,000 characters
- **Tags:** Max 20 per message/contact, each 1-30 chars, lowercase alphanumeric + `-` `_`, auto-deduplicated
- **Display names & descriptions:** Max 255 characters

## API Usage Patterns

### Library Usage

```python
from agcom import init, AgentIdentity

# Always use context manager
with init("messages.db", AgentIdentity(handle="alice")) as session:
    # Send creates new thread
    msg = session.send(["bob"], "Subject", "Body", tags=["urgent"])

    # Reply to specific message
    reply = session.reply(msg.message_id, "Reply body")

    # Reply to latest in thread
    session.reply_thread(msg.thread_id, "Another reply")

    # Broadcast creates N individual threads
    session.send_broadcast(["bob", "charlie"], "Subject", "Body")

    # Group creates 1 thread with multiple participants
    session.send_group(["bob", "charlie"], "Group Subject", "Body")
```

### REST API Patterns

1. **Authentication Flow:**
   - POST `/api/v1/auth/token` with `agent_handle` + `agent_secret`
   - Receive JWT token valid for 60 minutes (configurable)
   - Include in subsequent requests: `Authorization: Bearer <token>`

2. **Rate Limiting:**
   - Per-agent, not per-IP (extracted from JWT)
   - Limits: 500/min (list), 100/min (create), 50/min (broadcast)
   - In-memory, not distributed

3. **Error Handling:**
   - 400: Validation errors, malformed requests
   - 401: Invalid/expired token
   - 404: Resource not found
   - 409: Conflicts (e.g., version mismatch in optimistic locking)
   - 500: Server errors

## Configuration

REST API uses environment variables (see `.env.example`):

- `DB_PATH` - Database file location (default: `./data/agcom.db`)
- `SECRET_KEY` - JWT signing key (required, use `openssl rand -hex 32`)
- `ALGORITHM` - JWT algorithm (default: `HS256`)
- `ACCESS_TOKEN_EXPIRE_MINUTES` - Token TTL (default: 60)
- `CORS_ORIGINS` - JSON array of allowed origins
- `WORKERS` - MUST be 1 for SQLite
- `LOG_LEVEL` - Logging verbosity (default: `INFO`)
- `AUTO_INIT_DB` - Auto-initialize DB on startup

## Testing Architecture

Tests in `agcom/tests/`:
- `test_session.py` - Session API, messaging, replies, threading
- `test_storage.py` - Storage layer, database operations
- `test_validation.py` - Input validation rules
- `test_address_book.py` - Address book CRUD and search
- `test_threading.py` - Thread handling, participant tracking
- `test_phase2.py` - Advanced functionality, edge cases

REST API tests:
- `test_api.py` - Comprehensive endpoint testing
- `test_api_8004.py` - Port-specific variant

## Known Limitations

- **SQLite single writer** - One write transaction at a time. For high-write workloads (>100 agents, >10k msgs/day), consider PostgreSQL migration.
- **No real-time notifications** - Clients must poll for updates.
- **Text only** - No file attachments.
- **Rate limiting not distributed** - In-memory, won't work across multiple instances.

## Documentation Files

- `README.md` - Comprehensive usage guide
- `LIBRARY_SPEC.md` - Detailed library specification
- `REST_API_SPEC.md` - Complete REST API specification
- `REST_API_QUICKSTART.md` - Quick start guide for REST API
- `DOCS.md`, `TOUR.md` - Additional documentation

## Git Workflow

This project is under git version control as part of the banana workspace.

### Making Changes

```bash
# Check status (run from workspace root or here)
git status

# View changes
git diff

# Stage specific files
git add agcom/session.py app/main.py

# Stage all changes in agcom2
git add .

# Create commit (always include Co-Authored-By line)
git commit -m "$(cat <<'EOF'
Add feature description here

Detailed explanation of changes.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"

# Push to GitHub
git push
```

### Common Git Commands

```bash
# View recent commits
git log --oneline -10

# View commit history for specific file
git log --oneline agcom/session.py

# See what changed in last commit
git show

# Undo unstaged changes to a file
git checkout -- agcom/session.py

# View remote repository
git remote -v
```

### Important Notes

- **Commit from anywhere:** Git commands work from agcom2/ or workspace root
- **Always include Co-Authored-By:** Required for all commits
- **Test before committing:** Run `pytest agcom/tests/ -v` first
- **Descriptive messages:** Explain why, not just what changed
- **Stage selectively:** Use `git add <specific-files>` rather than `git add .` when working on multiple features

## Project Structure in Workspace

```
banana/                          # Workspace root (git repository)
├── README.md                    # Workspace overview
├── CLAUDE.md                    # Workspace guidance
├── .gitignore                   # Git ignore rules
└── agcom2/                      # This project
    ├── CLAUDE.md                # This file
    ├── README.md                # Project documentation
    ├── agcom/                   # Python library
    │   ├── __init__.py
    │   ├── session.py           # Main API
    │   ├── storage.py           # Database layer
    │   ├── models.py            # Data models
    │   └── tests/               # Test suite
    ├── app/                     # REST API
    │   ├── main.py              # FastAPI app
    │   ├── routers/             # API endpoints
    │   └── models/              # Request/response models
    └── scripts/                 # Utility scripts
```
