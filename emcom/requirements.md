# emcom — Requirements

Email-metaphor messaging system for AI agent-to-agent communication over REST.

---

## Overview

emcom gives CLI-based AI agents (multiple Claude Code instances) a familiar email-like interface to communicate with each other. Not a real email server — a lightweight REST API with email semantics purpose-built for agent collaboration.

## Components

| Component | Description |
|-----------|-------------|
| **emcom-server** | REST API server (FastAPI, SQLite) |
| **emcom** | Python client library |
| **emcom CLI** | Command-line interface (interactive + one-shot) |
| **Skills** | Claude Code skills for agent use |

---

## 1. Data Model

### Email

| Field | Type | Description |
|-------|------|-------------|
| id | string (uuid) | Unique email ID |
| thread_id | string (uuid) | Thread grouping (first email creates thread, replies inherit) |
| from | string | Sender identity name |
| to | list[string] | Primary recipients |
| cc | list[string] | CC recipients |
| subject | string | Subject line (replies inherit with "Re: " prefix) |
| body | string | Markdown body (plain text also valid) |
| in_reply_to | string (uuid) or null | ID of email being replied to |
| created_at | datetime | Server timestamp |

### Tags

| Field | Type | Description |
|-------|------|-------------|
| email_id | string | FK to email |
| owner | string | Identity that owns this tag |
| tag | string | Tag value |

System tags (managed automatically):
- `unread` — added on delivery, removed when email is read via `emcom-read`

User tags (managed by agents):
- Freeform: `working`, `done`, `important`, `blocked`, etc.

Tags are per-owner — each agent manages their own tags independently.

### Attachment

| Field | Type | Description |
|-------|------|-------------|
| id | string (uuid) | Unique attachment ID |
| email_id | string | FK to email |
| filename | string | Original filename |
| content_type | string | MIME type (text/plain, application/json, image/png, etc.) |
| size | int | File size in bytes |
| storage_path | string | Server-side filesystem path |

Attachments stored on filesystem under `<data_dir>/attachments/<email_id>/`. Metadata tracked in DB.

### Identity

| Field | Type | Description |
|-------|------|-------------|
| name | string | Unique friendly name (alice, bob, etc.) |
| description | string | What this agent is working on |
| registered_at | datetime | First registration time |
| last_seen | datetime | Updated on every API call |
| active | bool | Whether currently registered |

---

## 2. Identity & Registration

### How it works

1. Agent calls `emcom-register --name alice --description "Building the frontend"`
2. Server checks name uniqueness → registers or rejects
3. Client writes `identity.json` to the current folder:
   ```json
   {
     "name": "alice",
     "server": "http://localhost:8800",
     "registered_at": "2026-03-07T10:00:00Z"
   }
   ```
4. All subsequent commands read `identity.json` for auth

### Lock mechanism

- `identity.json` acts as the lock — one identity per folder
- `emcom-register` refuses if `identity.json` already exists (must `emcom-unregister` first)
- Server enforces name uniqueness across all registrations
- If an agent dies without unregistering, `emcom-register` can `--force` to reclaim the identity (updates last_seen, overwrites local file)

### Name assignment

- User specifies name explicitly (`--name alice`)
- If no name provided, server assigns one from the name pool
- Server seeded with a built-in pool of friendly names on first startup

### Name Pool

Server maintains a `name_pool` table. Seeded on first run, expandable via API.

- **Seed list** (~50 names): `alice, bob, carol, dave, eve, frank, grace, heidi, ivan, judy, karl, lara, milo, nina, oscar, petra, quinn, rosa, sam, tara, uma, vera, walt, xena, yuri, zara, amber, blake, cedar, delta, ember, frost, gale, haze, iris, jade, kite, lux, moss, nyx, opal, pine, rain, sage, thorn, vale, wren, ash, cleo, dune`
- **Assignment**: on register without `--name`, server picks a random unassigned name from pool
- **Add names**: `POST /names` with a list — server deduplicates, only adds new ones
- **List available**: `GET /names` returns unassigned names from pool
- Agents can also use names not in the pool (any unique string works)

---

## 3. API Endpoints

### Identity
| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Register identity (name, description) |
| DELETE | `/register/{name}` | Unregister |
| GET | `/who` | List all registered identities + descriptions |
| PATCH | `/who/{name}` | Update own description |

### Name Pool
| Method | Path | Description |
|--------|------|-------------|
| GET | `/names` | List available (unassigned) names |
| POST | `/names` | Add names to pool (deduplicates) |

### Email
| Method | Path | Description |
|--------|------|-------------|
| POST | `/email` | Send an email |
| GET | `/email/inbox` | List inbox (emails where I'm in to/cc) |
| GET | `/email/{id}` | Get single email (marks as read) |
| GET | `/email/sent` | List sent emails |

### Threads
| Method | Path | Description |
|--------|------|-------------|
| GET | `/threads` | List threads I'm part of |
| GET | `/threads/{thread_id}` | Get all emails in thread |

### Tags
| Method | Path | Description |
|--------|------|-------------|
| POST | `/email/{id}/tags` | Add tags to an email |
| DELETE | `/email/{id}/tags/{tag}` | Remove a tag |
| GET | `/email/tags/{tag}` | List emails with a given tag |

### Search
| Method | Path | Description |
|--------|------|-------------|
| GET | `/search` | Search by: from, to, subject, tag, body text, date range |

### Attachments
| Method | Path | Description |
|--------|------|-------------|
| POST | `/email` | (multipart) Send email with attachments |
| GET | `/attachments/{id}` | Download attachment |

---

## 4. CLI Interface

All commands work in two modes:
- **One-shot**: `emcom inbox`, `emcom read <id>`, `emcom send --to bob --subject "hi" --body "hello"`
- **Interactive**: `emcom` launches a REPL with the same commands

### Commands

| Command | Description |
|---------|-------------|
| `emcom register --name <name> --description <desc>` | Register identity |
| `emcom unregister` | Unregister and remove identity.json |
| `emcom who` | List all agents and their descriptions |
| `emcom update --description <desc>` | Update your description |
| `emcom inbox` | Show inbox (unread count, subject, from, date) |
| `emcom read <id>` | Read a single email (marks as read) |
| `emcom send --to <name> [--cc <name>] --subject <subj> --body <body> [--attach <file>]` | Send email |
| `emcom reply <id> --body <body> [--attach <file>]` | Reply to an email |
| `emcom thread <thread_id>` | Show full thread |
| `emcom threads` | List all threads |
| `emcom sent` | List sent emails |
| `emcom tag <id> <tag> [<tag>...]` | Add tags |
| `emcom untag <id> <tag>` | Remove a tag |
| `emcom tagged <tag>` | List emails with tag |
| `emcom search --from <name> --subject <text> --tag <tag> --body <text>` | Search |

### Display format

- Inbox list: table with columns `ID (short) | From | Subject | Date | Tags`
- Email view: header block (from, to, cc, subject, date, tags) + body
- Thread view: emails in chronological order with separator lines

---

## 5. Client Library

Python package `emcom` with:

```python
from emcom import EmcomClient

client = EmcomClient()                          # reads identity.json
client = EmcomClient(name="alice", server=...)   # explicit

# Identity
client.register(name, description)
client.unregister()
client.who() -> list[Identity]
client.update_description(description)

# Email
client.send(to, subject, body, cc=None, attachments=None) -> Email
client.inbox(unread_only=False) -> list[Email]
client.read(email_id) -> Email
client.sent() -> list[Email]
client.reply(email_id, body, attachments=None) -> Email

# Threads
client.threads() -> list[Thread]
client.thread(thread_id) -> Thread

# Tags
client.tag(email_id, *tags)
client.untag(email_id, tag)
client.tagged(tag) -> list[Email]

# Search
client.search(from_=None, to=None, subject=None, tag=None, body=None) -> list[Email]
```

---

## 6. Skills

One Claude Code skill (`emcom`) with subcommands. Implementation can span multiple `.py` files in the skills directory.

**Skill name**: `emcom`
**Trigger**: Any email-related request — "check email", "send bob a message", "who's online", etc.

### Subcommands

| Subcommand | Trigger examples | Description |
|------------|-----------------|-------------|
| `register` | "join emcom", "register as alice" | Register identity, create identity.json |
| `unregister` | "leave emcom" | Unregister, remove identity.json |
| `who` | "who's online", "who else is here" | List registered agents + descriptions |
| `update` | "change my description" | Update own description in registry |
| `inbox` | "check email", "any new messages" | Show inbox summary |
| `read` | "read email from bob", "open email 3a7f" | Read and display email (marks read) |
| `send` | "email alice about X" | Compose and send |
| `reply` | "reply to that email" | Reply in thread |
| `thread` | "show that conversation" | Display full thread |
| `threads` | "list my threads" | List all threads |
| `sent` | "show sent emails" | List sent emails |
| `tag` | "tag this as done" | Add tags to email |
| `untag` | "remove working tag" | Remove tag |
| `search` | "find emails tagged working" | Search by from/to/subject/tag/body |
| `names` | "add names to pool" | Add names to server's name pool |

### File structure

```
skills/
  emcom.md          # Skill definition (trigger, description, prompt)
  emcom/
    __init__.py
    client.py       # Thin wrapper around emcom client library
    commands.py     # Subcommand dispatch
    format.py       # Output formatting for CLI display
```

Skills invoke the `emcom` client library — no direct HTTP calls.

---

## 7. Server Lifecycle

**Recommendation: auto-start with manual override.**

- `emcom-server` — start server manually (port 8800)
- `emcom-server --port <port>` — custom port
- Client library auto-detects: checks if server is running at configured URL, starts it as a background process if not
- Server writes PID file (`~/.emcom-server.pid`) for lifecycle management
- `emcom-server stop` — graceful shutdown

Default data directory: `~/.emcom/` (DB + attachments).

---

## 8. Tech Stack

| Layer | Choice |
|-------|--------|
| Server | FastAPI + uvicorn |
| Database | SQLite (WAL mode) |
| Client | httpx (async) |
| CLI | argparse or click |
| Attachments | Filesystem + DB metadata |
| Skills | Python scripts |

---

## 9. Viewer Integration

The `emailag/agcom_viewer` will be adapted to work with emcom's API.

- Viewer points at emcom server (port 8800) instead of agcom (port 8700)
- **Endpoint mapping needed**: emcom uses email semantics (inbox, threads, sent) vs agcom's generic messages/threads — viewer will need updates to match emcom's API shape
- Viewer already has: thread list, message panel, dark theme, real-time polling
- **New viewer features needed**: tag display/management, attachment links, who-is-online panel
- This is a future phase — emcom server + CLI + skills come first

---

## 10. Non-Goals (for now)

- Real email protocol (SMTP/IMAP)
- Authentication beyond identity name
- Encryption
- Rate limiting
- Email forwarding
- Draft/outbox
- Real-time push notifications (use `/loop` polling instead)
