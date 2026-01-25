# Agent Communication Tool — Specification


## 1. Overview

The **Agent Communication Tool** is a **text-based, email-like communication library** intended for **multi-agent environments**.

It provides:
- Email-style **messages**
- **Threaded conversations**
- A shared **address book** (editable by anyone)
- A shared **persistent store** used by all agents
- A **console application** to exercise the system

The library is designed to feel like an email client + email threads, but optimized for agents communicating inside a shared workspace.

---

## 2. Goals

### Primary Goals
- Provide a **simple email-like abstraction** for agent-to-agent communication
- Support multi-agent collaboration via:
  - shared inbox/thread list
  - thread reply behavior
  - searchable address book
- Provide a **persistent store**, so state survives across runs
- Provide a **console UI** to exercise the system
- Implemented as a **library** for easy integration into other systems
- Language is **Python** (for prototyping and ease of use)

### Non-Goals (v0)
- Binary attachments
- Rich formatting (HTML, Markdown rendering, etc.)
- External SMTP / real email delivery
- Security, encryption, or access control (shared workspace model with full trust)
- Per-agent read/unread state (deferred to v1)

---

## 3. High-Level User Stories

1. **Create/Open Session**
   - As an agent, I want to open a shared session (store) so I can read/write messages.

2. **Send Email**
   - As an agent, I want to send a message to another agent using a handle.

3. **Threaded Discussion**
   - As an agent, I want to reply in-thread so conversations stay organized.

4. **Inbox View**
   - As an agent, I want to see the latest activity (thread list and newest messages).

5. **Thread View**
   - As an agent, I want to open a thread and see full context.

6. **Address Book Discovery**
   - As an agent, I want to search the address book by topic and contact the best match.

7. **Persistent + Shared**
   - As multiple agents, we want the same store, and updates appear to everyone.

---

## 4. Core Concepts & Definitions

### Agent Identity
- Each process initializes the library with its **agent identity**.
- Identity is used as the default `From:` field on all sent messages.

### Shared Store
- All agents share the same persistence layer (e.g., a single SQLite DB file).
- Messages and address book live in the same shared store.

### Email
- “Email” is modeled as a **message** with a subject, body, sender, recipients, timestamp.

### Thread
- A “thread” is a conversation group containing one or more messages.
- Replies always attach to an existing thread.

### Address Book
- A shared directory of agents.
- Anyone can query, add, and edit entries.
- Entries include `description` to support “who can help with what” discovery.

---

## 5. Requirements

## 5.1 Functional Requirements

### (A) Session Initialization
- The library supports creating/opening a session (store).
- A session may start empty (no messages, no address book entries).

**Required**
- Initialize with agent identity:
  - `self_handle`
  - optional metadata (display name, tags, etc.)

---

### (B) Sending Messages
Provide a `send(to, subject, message)` capability.

**Required**
- Sender is the current agent identity set during initialization.
- `to` may be a handle in the address book.
- If `to` is a handle, it must resolve consistently to a recipient identity.

---

### (C) Viewing Messages
Provide screen rendering for console usage.

**Required**
- `current_screen(real_time)` prints the screen view:
  - latest → older activity
  - limited to `N` items
  - truncates long fields
- Thread view exists:
  - open a thread by id
  - show messages in order
- Must support limiting number of messages displayed and truncation.

---

### (D) Threaded Replies
Provide a mechanism for replying within a thread.

**Required**
- Reply attaches to an existing thread using explicit linking:
  - `in_reply_to` or `reply_to_message_id`
- Replies should update thread’s “last activity” timestamp.

---

### (E) Persistent State
Persistent state is required.

**Required**
- Messages survive process restarts.
- Address book survives process restarts.
- Threads survive process restarts.

---

### (F) Address Book
Shared address book, queryable by anyone, editable by anyone.

**Required**
- Address book entry fields include:
  - `handle`
  - `description` (“how can this person/agent help?”)
- Any agent can:
  - add entry
  - edit entry
  - query/search entries
- Users can send email using a handle from the address book.

---

### (G) Console App
A console app must exercise all functions.

**Required**
- Create/open session
- Identify current agent
- Send message
- List inbox/threads
- View a thread
- Reply in thread
- Search address book
- Add/edit address book entries

---

## 5.2 Non-Functional Requirements

### Reliability
- Writes must be durable and not corrupt state.
- Concurrent access by multiple agents must be safe.

### Performance
- Must efficiently render "current screen" without scanning full history each time.
- Must support indexing for threads/messages ordering.

### Portability
- Store format should work cross-platform (Windows/macOS/Linux).

### Debuggability
- Data should be introspectable (SQLite recommended).
- Actions should be auditable.

---

## 6. Data Model

## 6.1 Identifiers
Use stable unique identifiers:
- `thread_id`: ULID (sortable, timestamp-embedded)
- `message_id`: ULID (sortable, timestamp-embedded)

**Decision for v0**: Use ULID for built-in chronological sorting and debugging ease.

---

## 6.2 Datetime Handling
All timestamps are stored and returned as **UTC datetime objects** with timezone info.

**Storage**: ISO 8601 UTC strings in SQLite (e.g., `2026-01-24T10:30:00Z`)
**API**: Python `datetime` objects with `tzinfo=timezone.utc`

---

## 6.3 Message
**Message**
- `message_id: str` — ULID
- `thread_id: str` — ULID
- `from_handle: str` — sender handle
- `to_handles: list[str]` — **Implementation supports multiple recipients**
- `subject: str` — thread subject (inherited from first message in thread)
  - **Max length: 200 characters**
  - Must not be empty or whitespace-only
- `body: str` — message content (plain text)
  - **Max length: 50,000 characters**
  - Must not be empty or whitespace-only
- `created_at: datetime` — UTC timestamp
- `in_reply_to: str | None` — parent message ID (None for thread starters)
- `tags: list[str] | None` — optional list of tags for categorization
  - **Per-tag max length: 50 characters**

---

## 6.4 Thread
**Thread**
- `thread_id: str` — ULID
- `subject: str` — subject line from first message (max 200 chars)
- `created_at: datetime` — UTC timestamp of first message
- `last_activity_at: datetime` — UTC timestamp of most recent message
- `participant_handles: list[str]` — computed from all messages in thread
  - **Computation**: Collect all unique handles from `from_handle` and `to_handles` fields
  - **Order**: Alphabetically sorted
  - **Deduplication**: Each handle appears exactly once

**Threading Model (v0 Decision)**:
- Each `send()` creates a **new thread** with a new `thread_id`
- `reply()` and `reply_thread()` attach to existing threads
- Subject cannot be changed within a thread (inherited from first message)

---

## 6.5 Address Book Entry
**AddressBookEntry**
- `handle: str` — unique identifier (primary key)
  - **Validation**: Lowercase `[a-z0-9._-]` (letters, numbers, period, underscore, hyphen), length 2-64
  - Must not be empty or whitespace-only
  - Cannot start or end with period or hyphen
- `display_name: str | None` — human-readable name (optional)
  - **Max length: 100 characters**
  - Can be None or empty string
- `description: str | None` — optional: what this agent does or can help with
  - **Max length: 500 characters**
  - Can be None or empty string
- `is_active: bool` — whether entry is currently active (default: True)
- `created_at: datetime` — UTC timestamp (set on creation, never changes)
- `updated_at: datetime` — UTC timestamp (updated on every edit)
- `updated_by: str` — agent handle who made the last update
- `version: int` — optimistic concurrency control (starts at 1, increments on every update)

---

## 6.6 Audit Log (Implemented for v0)
Track all address book operations for debugging and history.

**AuditEvent**
- `event_id: str` — ULID
- `event_type: str` — e.g., `address_book_add`, `address_book_update`
- `actor_handle: str` — agent who performed the action
- `target_handle: str | None` — agent handle being modified (for address book operations)
- `details: str | None` — optional string with additional event details
- `timestamp: datetime` — UTC timestamp

---

## 7. API Surface (Python Library)

> Note: This is a conceptual API. Exact module/package layout is up to implementation.

### 7.1 Core Data Classes

```py
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

@dataclass(frozen=True)
class AgentIdentity:
    handle: str
    display_name: str | None = None


@dataclass(frozen=True)
class Message:
    message_id: str
    thread_id: str
    from_handle: str
    to_handles: list[str]
    subject: str
    body: str
    created_at: datetime
    in_reply_to: str | None
    tags: list[str] | None


@dataclass(frozen=True)
class Thread:
    thread_id: str
    subject: str
    created_at: datetime
    last_activity_at: datetime
    participant_handles: list[str]


@dataclass(frozen=True)
class AddressBookEntry:
    handle: str
    display_name: str | None
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    updated_by: str
    version: int


@dataclass(frozen=True)
class AuditEvent:
    event_id: str
    event_type: str
    actor_handle: str
    target_handle: str | None
    details: str | None
    timestamp: datetime
```

---

### 7.2 Initialization & Session Management

```py
def init(store_path: str, self_identity: AgentIdentity) -> "AgentCommsSession":
    """
    Opens (or creates) a shared persistent store and binds the current process
    to a specific agent identity.

    Args:
        store_path: Path to SQLite database file (created if doesn't exist)
        self_identity: Identity of this agent (used as default 'from')

    Returns:
        An active session bound to this agent identity

    Raises:
        ValueError: If handle is invalid
        OSError: If store path is not accessible
    """
```

---

### 7.3 Session Class - Messaging

```py
class AgentCommsSession:
    def send(self, to_handles: list[str], subject: str, body: str, tags: list[str] | None = None) -> Message:
        """
        Send a new message and create a new thread.

        Args:
            to_handles: List of recipient handles (supports multiple recipients)
            subject: Thread subject line
            body: Message content (plain text)
            tags: Optional list of tags for categorization (validated and deduplicated)

        Returns:
            The created Message object with thread_id and message_id

        Raises:
            ValueError: If handle validation fails or subject/body is empty
            RuntimeError: If store write fails

        Note:
            Tags are automatically validated and deduplicated. Must be lowercase [a-z0-9_-],
            1-30 chars each, maximum 20 tags total.
        """

    def reply(self, message_id: str, body: str, tags: list[str] | None = None) -> Message:
        """
        Reply to a specific message within its thread.

        Args:
            message_id: ID of the message to reply to
            body: Reply content (plain text)
            tags: Optional list of tags for categorization (validated and deduplicated)

        Returns:
            The created reply Message object

        Raises:
            ValueError: If message_id doesn't exist or body is empty
            RuntimeError: If store write fails
        """

    def reply_thread(self, thread_id: str, body: str, tags: list[str] | None = None) -> Message:
        """
        Reply to a thread (attaches to most recent message in thread).

        Args:
            thread_id: ID of the thread to reply to
            body: Reply content (plain text)
            tags: Optional list of tags for categorization (validated and deduplicated)

        Returns:
            The created reply Message object

        Raises:
            ValueError: If thread_id doesn't exist or body is empty
            RuntimeError: If store write fails
        """

    def close(self) -> None:
        """Close the session and release database resources."""

    def __enter__(self) -> "AgentCommsSession":
        """Context manager support."""
        return self

    def __exit__(self, *args) -> None:
        """Context manager cleanup."""
        self.close()
```

---

### 7.4 Session Class - Viewing & Searching

```py
@dataclass
class ScreenOptions:
    max_threads: int = 20
    subject_width: int = 50
    from_width: int = 20


class AgentCommsSession:
    def current_screen(self, options: ScreenOptions | None = None) -> str:
        """
        Returns a formatted text view of recent activity (inbox-style).

        Args:
            options: Display options (defaults to ScreenOptions())

        Returns:
            Formatted string showing threads ordered by last_activity_at (descending)
        """

    def view_thread(self, thread_id: str, limit_messages: int = 100, truncate_chars: int = 400) -> str:
        """
        Returns formatted view of all messages in a thread.

        Args:
            thread_id: Thread to display
            limit_messages: Max messages to show
            truncate_chars: Max chars per message body

        Returns:
            Formatted string showing messages in chronological order

        Raises:
            ValueError: If thread_id doesn't exist
        """

    def list_threads(self, limit: int | None = None, offset: int = 0) -> list[Thread]:
        """
        List threads ordered by last activity (most recent first).

        Args:
            limit: Max threads to return (None = all)
            offset: Number of threads to skip

        Returns:
            List of Thread objects
        """

    def list_messages(self, thread_id: str | None = None, limit: int | None = None, offset: int = 0) -> list[Message]:
        """
        List messages in a thread (chronological order).

        Args:
            thread_id: Thread to list messages from (None = all messages)
            limit: Max messages to return (None = all)
            offset: Number of messages to skip

        Returns:
            List of Message objects

        Raises:
            ValueError: If thread_id doesn't exist
        """

    def get_message(self, message_id: str) -> Message:
        """
        Get a specific message by ID.

        Raises:
            ValueError: If message_id doesn't exist
        """

    def get_thread(self, thread_id: str) -> Thread:
        """
        Get a specific thread by ID.

        Raises:
            ValueError: If thread_id doesn't exist
        """

    def search_messages(
        self,
        query: str,
        limit: int | None = None,
    ) -> list[Message]:
        """
        Search messages (case-insensitive substring match in subject and body).

        Args:
            query: Search text
            limit: Max results (None = all)

        Returns:
            List of matching Message objects
        """
```

---

### 7.5 Session Class - Address Book

```py
class AgentCommsSession:
    def address_book_add(
        self,
        handle: str,
        display_name: str | None = None,
        description: str | None = None,
    ) -> AddressBookEntry:
        """
        Add a new entry to the shared address book.

        Args:
            handle: Unique handle (must pass validation: [a-z0-9._-], 2-64 chars)
            display_name: Optional human-readable name
            description: Optional description of what this agent does

        Returns:
            The created AddressBookEntry object with all fields populated

        Raises:
            ValueError: If handle already exists or validation fails
            RuntimeError: If store write fails

        Note:
            Automatically sets created_at, updated_at to current time,
            updated_by to current session identity, version to 1, is_active to True.
            Creates audit log event with operation details.
        """

    def address_book_update(
        self,
        handle: str,
        display_name: str | None = None,
        description: str | None = None,
        is_active: bool = True,
        expected_version: int | None = None,
    ) -> AddressBookEntry:
        """
        Update an existing address book entry.

        Args:
            handle: Handle to update
            display_name: New display name (None = no change)
            description: New description (None = no change)
            is_active: Whether entry is active
            expected_version: For optimistic concurrency control (None = skip check)

        Returns:
            The updated AddressBookEntry object with incremented version

        Raises:
            ValueError: If handle doesn't exist
            RuntimeError: If expected_version mismatch (version conflict)

        Note:
            Automatically sets updated_at to current time, updated_by to current
            session identity, increments version by 1. Creates audit log event with
            operation details including old and new values.
        """

    def address_book_get(self, handle: str) -> AddressBookEntry | None:
        """
        Get a specific address book entry.

        Returns:
            AddressBookEntry or None if not found
        """

    def address_book_search(self, query: str, active_only: bool = True) -> list[AddressBookEntry]:
        """
        Search address book (case-insensitive substring match in handle, display_name, description).

        Args:
            query: Search text
            active_only: If True, only return active entries

        Returns:
            List of matching AddressBookEntry objects
        """

    def address_book_list(self, active_only: bool = True) -> list[AddressBookEntry]:
        """
        List all address book entries.

        Args:
            active_only: If True, only return active entries

        Returns:
            List of AddressBookEntry objects (sorted by handle)
        """
```

---

### 7.6 Session Class - Audit Log

```py
class AgentCommsSession:
    def audit_list(self, target_handle: str | None = None, limit: int | None = None) -> list[AuditEvent]:
        """
        List recent audit events (most recent first).

        Args:
            target_handle: Optional filter by target handle
            limit: Max events to return (None = all)

        Returns:
            List of AuditEvent objects
        """
```



---

## 8. Storage Backend Requirements

### v0 Implementation: SQLite

**Configuration**:
- Enable WAL mode for concurrent read/write: `PRAGMA journal_mode=WAL`
- Set busy timeout: `PRAGMA busy_timeout=5000` (5 seconds)
- Enable foreign keys: `PRAGMA foreign_keys=ON`

**Required Tables**:
1. `threads` — thread metadata
2. `messages` — all messages
3. `address_book` — agent directory
4. `audit_log` — change history (recommended)

**Schema Requirements**:
- All IDs stored as TEXT (ULID strings)
- All timestamps stored as TEXT (ISO 8601 UTC format)
- Use `NOT NULL` constraints where appropriate
- Use foreign keys: `messages.thread_id` → `threads.thread_id`

**Required Indexes**:
- `messages(thread_id, created_at)` — thread message ordering
- `threads(last_activity_at DESC)` — inbox ordering
- `address_book(handle)` — unique constraint + lookup
- `address_book(status, handle)` — filtered listing
- `audit_log(timestamp DESC)` — audit history

**Optional (v1)**:
- SQLite FTS5 virtual tables for full-text search

---

### 8.1 Transaction Boundaries

Each API operation is atomic and wrapped in a transaction:

**Single-write operations** (auto-commit):
- `send()` — inserts 1 message + 1 thread, 1 audit entry
- `reply()` / `reply_thread()` — inserts 1 message, updates 1 thread, 1 audit entry
- `address_book_add()` — inserts 1 entry, 1 audit entry
- `address_book_update()` — updates 1 entry, 1 audit entry

**Multi-step transaction** (send/reply):
1. Generate ULID for message_id and thread_id (if new)
2. Insert/update thread record
3. Insert message record
4. Update thread's `last_activity_at` and `participant_handles`
5. Insert audit log entry
6. Commit transaction

If any step fails, entire transaction is rolled back.

**Concurrency**:
- SQLite WAL mode allows multiple readers + 1 writer
- Busy timeout (5 sec) handles write contention
- Read operations never block each other
- Write operations serialize automatically

---

### 8.2 SQLite Schema (Concrete)

```sql
-- Threads table
CREATE TABLE threads (
    thread_id TEXT PRIMARY KEY NOT NULL,
    subject TEXT NOT NULL CHECK(length(subject) <= 200),
    created_at TEXT NOT NULL,  -- ISO 8601 UTC
    last_activity_at TEXT NOT NULL,  -- ISO 8601 UTC
    participant_handles TEXT NOT NULL  -- JSON array of strings
);

CREATE INDEX idx_threads_last_activity ON threads(last_activity_at DESC);

-- Messages table
CREATE TABLE messages (
    message_id TEXT PRIMARY KEY NOT NULL,
    thread_id TEXT NOT NULL,
    from_handle TEXT NOT NULL,
    to_handles TEXT NOT NULL,  -- JSON array (supports multiple recipients)
    subject TEXT NOT NULL CHECK(length(subject) <= 200),
    body TEXT NOT NULL CHECK(length(body) <= 50000),
    created_at TEXT NOT NULL,  -- ISO 8601 UTC
    in_reply_to TEXT,
    tags TEXT,  -- JSON array of strings (optional)

    FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);

CREATE INDEX idx_messages_thread ON messages(thread_id, created_at);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

-- Address book table
CREATE TABLE address_book (
    handle TEXT PRIMARY KEY NOT NULL CHECK(length(handle) >= 2 AND length(handle) <= 64),
    display_name TEXT CHECK(display_name IS NULL OR length(display_name) <= 100),
    description TEXT CHECK(description IS NULL OR length(description) <= 500),
    is_active INTEGER NOT NULL DEFAULT 1,  -- Boolean: 1 for active, 0 for inactive
    created_at TEXT NOT NULL,  -- ISO 8601 UTC
    updated_at TEXT NOT NULL,  -- ISO 8601 UTC
    updated_by TEXT NOT NULL,  -- Handle of agent who made last update
    version INTEGER NOT NULL DEFAULT 1  -- Starts at 1, increments on each update
);

CREATE INDEX idx_address_book_active ON address_book(is_active, handle);

-- Audit log table
CREATE TABLE audit_log (
    event_id TEXT PRIMARY KEY NOT NULL,
    event_type TEXT NOT NULL,
    actor_handle TEXT NOT NULL,
    target_handle TEXT,  -- Optional: handle being modified (for address book operations)
    details TEXT,  -- Optional: additional event details
    timestamp TEXT NOT NULL  -- ISO 8601 UTC
);

CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_handle, timestamp DESC);
CREATE INDEX idx_audit_log_target ON audit_log(target_handle, timestamp DESC);
```

**JSON Field Encoding**:
- `participant_handles`: `["alice", "bob"]` (in threads table)
- `to_handles`: `["bob"]` or `["alice", "bob", "charlie"]` (in messages table, supports multiple)
- `tags`: `["python", "api", "database"]` or `[]` or `null` (in messages table, optional)

---

### 8.3 Performance & Scale Targets (v0)

**Expected Scale**:
- **Threads**: 1,000 - 10,000 active threads
- **Messages**: 10,000 - 100,000 total messages
- **Address Book**: 50 - 500 entries
- **Concurrent Agents**: 5 - 20 simultaneous processes

**Performance Targets**:
- `send()` / `reply()`: < 50ms (p95)
- `list_threads(50)`: < 100ms (p95)
- `list_messages(200)`: < 100ms (p95)
- `current_screen()`: < 200ms (p95)
- `address_book_search()`: < 50ms (p95)

**Storage Estimates**:
- Average message: ~500 bytes
- 100k messages: ~50 MB database file
- SQLite handles this scale efficiently with proper indexing

**Note**: v0 is optimized for small-to-medium team usage. Large-scale deployment (>100k messages) may require v1 optimizations (archiving, FTS, pagination).

---

### 8.4 Schema Versioning & Migrations

**v0 Approach**: Simple version tracking

Add a metadata table:
```sql
CREATE TABLE schema_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

INSERT INTO schema_metadata (key, value) VALUES ('schema_version', '1');
```

**Version Check**:
- On `init()`, check `schema_version`
- If version mismatch, raise error with clear message
- v0 does not support automatic migrations

**v1+ Approach**:
- Implement migration scripts
- Support backward-compatible schema changes
- Provide export/import for breaking changes

---

## 9. Console App Spec

The console app is a reference driver for the library.

### 9.1 Operating Modes

**Single Command Mode**:
```bash
python -m agcom.console --store shared.db --me alice send bob --subject "Hello" --body "Test"
```
Executes one command and exits.

**Interactive Mode**:
```bash
python -m agcom.console --store shared.db --me alice
```
Opens an interactive prompt that accepts commands until `exit` or Ctrl+D.

### 9.2 Required Commands

#### Session / Identity
- `init --store <path> --me <handle> [--display "Name"]`
  - Create new store and initialize identity
  - Fails if store already exists
- `open --store <path> --me <handle> [--display "Name"]`
  - Open existing store
  - Creates store if it doesn't exist (same as init)
- `whoami`
  - Display current agent identity
- `screen [--watch] [--max-threads N]`
  - Show inbox view
  - `--watch`: continuously refresh (1 sec interval, Ctrl+C to exit)
  - `--max-threads`: limit number of threads displayed

#### Messaging
- `send <to> [<to2> ...] --subject "..." --body "..." [--tags tag1 tag2]`
  - Supports multiple recipients
  - For multi-line body, use: `--body @-` to read from stdin until EOF (Ctrl+D)
  - Example: `send bob charlie --subject "Test" --body @- --tags urgent`
- `send <to> --subject "..." --body-file <path>`
  - Read body from file
- `threads [--limit N]`
  - List threads (default limit: 50)
- `view <thread_id>`
  - Show full thread with all messages
- `reply <message_id> --body "..." [--tags tag1 tag2]`
  - Reply to specific message
  - Supports `--body @-` and `--body-file <path>`
  - Supports `--tags` for reply categorization
- `reply-thread <thread_id> --body "..." [--tags tag1 tag2]`
  - Reply to thread (attaches to most recent message)
  - Supports `--body @-` and `--body-file <path>`
  - Supports `--tags` for reply categorization
- `search <query> [--participant <handle>] [--limit N]`
  - Search messages (default limit: 50)

#### Address Book
- `ab add <handle> [--display-name "Name"] [--desc "..."]`
  - Add new entry
  - All fields optional except handle
- `ab edit <handle> [--desc "..."] [--display-name "Name"] [--deactivate] [--expected-version N]`
  - Update entry (only specified fields change)
  - Use `--deactivate` flag to mark entry as inactive
- `ab list [--all]`
  - List all entries (default: active only)
  - Use `--all` to include inactive entries
- `ab show <handle>`
  - Display single entry details
- `ab search <query> [--all]`
  - Search entries (default: active only)
  - Use `--all` to include inactive entries
- `ab deactivate <handle>`
  - Set is_active to false (shortcut for `ab edit <handle> --deactivate`)
- `ab history <handle> [--limit N]`
  - Show audit log for this handle (requires audit log)

#### Utility
- `help [command]`
  - Show general help or command-specific help
- `exit` / `quit`
  - Exit interactive mode

### 9.3 Multi-line Input Handling

When `--body @-` is used:
1. Print prompt: `Enter message body (Ctrl+D when done):`
2. Read from stdin until EOF
3. Strip leading/trailing whitespace
4. Validate non-empty

Example interactive session:
```
> send bob --subject "Code review" --body @-
Enter message body (Ctrl+D when done):
Please review the attached changes.
Key points:
- Added validation
- Fixed bug in handler
^D
Message sent: msg_01HMXXX...
```

---

## 10. Screen Rendering Requirements

### 10.1 Display Name vs Handle
When rendering messages and threads:
- **Prefer `display_name`** if it exists in address book
- **Fallback to `handle`** if no address book entry or display_name is None
- Lookup is done at render time (not stored)
- Format: `"Alice (alice)"` when display_name exists, `"alice"` otherwise

### 10.2 Truncation
- `truncate_chars` applies to subject/body lines
- Always show `…` (single ellipsis character) when truncated
- Truncate at word boundaries when possible
- Example: `"This is a very long message that will be tru…"` (160 chars)

### 10.3 Inbox Screen Format

```
=== INBOX (<agent_handle>) ===
Last updated: <timestamp> UTC

[<n>] <thread_id_short> | "<subject>"
    From: <display_or_handle> | To: <display_or_handle> | Last: <timestamp>
    Latest: "<body_preview>"

[<n+1>] ...
```

**Details**:
- `<thread_id_short>`: First 12 characters of ULID
- `<subject>`: Truncated to `truncate_chars`
- `<body_preview>`: Latest message body, truncated to `truncate_chars`
- Timestamps formatted as: `YYYY-MM-DD HH:MM:SS` (no microseconds)

### 10.4 Thread View Format

```
=== THREAD: "<subject>" ===
Thread ID: <full_thread_id>
Participants: <comma_separated_handles>
Created: <timestamp> UTC

--- Message <n>/M ---
ID: <message_id>
From: <display_or_handle> | To: <display_or_handle>
Sent: <timestamp> UTC
[Reply to: <message_id>]  <!-- only if in_reply_to is set -->

<full_body or truncated_body>

--- Message <n+1>/M ---
...
```

### 10.5 Ordering
- **Inbox screen**: threads ordered by `last_activity_at` DESC (newest first)
- **Thread view**: messages ordered by `created_at` ASC (chronological)

### 10.6 Real-time Watch Mode
If `real_time=true` or `--watch` flag:
- Clear screen and re-render every 1 second
- Show live timestamp at top
- Exit on Ctrl+C or when `real_time` becomes false
- Preserve scroll position if terminal supports it (optional)

---

## 11. Validation & Error Handling

### 11.1 Input Validation

All validation happens **before** database writes.

**Handle Validation**:
```python
def validate_handle(handle: str) -> None:
    if not handle or not handle.strip():
        raise ValueError("Handle cannot be empty or only whitespace")
    if len(handle) < 2:
        raise ValueError("Handle must be at least 2 characters")
    if len(handle) > 64:
        raise ValueError("Handle must not exceed 64 characters")
    if not re.match(r'^[a-z0-9._-]+$', handle):
        raise ValueError("Handle must contain only lowercase letters, digits, '.', '_', '-'")
    if handle[0] in '.-' or handle[-1] in '.-':
        raise ValueError("Handle cannot start or end with '.' or '-'")
```

**Subject Validation**:
```python
def validate_subject(subject: str) -> None:
    if not subject or subject.isspace():
        raise ValueError("Subject cannot be empty")
    if len(subject) > 200:
        raise ValueError("Subject cannot exceed 200 characters")
```

**Body Validation**:
```python
def validate_body(body: str) -> None:
    if not body or body.isspace():
        raise ValueError("Body cannot be empty")
    if len(body) > 50000:
        raise ValueError("Body cannot exceed 50,000 characters")
```

**Tag Validation**:
```python
def validate_tags(tags: list[str]) -> list[str]:
    """Validate and normalize tags.

    Returns:
        Deduplicated list of validated tags
    """
    if len(tags) > 20:
        raise ValueError("Cannot exceed 20 tags")

    validated = []
    for tag in tags:
        if not tag or not tag.strip():
            raise ValueError("Tags cannot be empty or only whitespace")
        if not re.match(r'^[a-z0-9_-]+$', tag):
            raise ValueError(f"Tag '{tag}' must contain only lowercase letters, digits, '_', '-'")
        if len(tag) < 1 or len(tag) > 30:
            raise ValueError(f"Tag '{tag}' must be 1-30 characters")
        validated.append(tag)

    # Deduplicate while preserving order
    return list(dict.fromkeys(validated))
```

### 11.2 Error Responses

All exceptions should include clear, actionable error messages:

**ValueError** - Invalid input:
- `"Handle 'Alice' is invalid: must be lowercase"`
- `"Subject cannot be empty"`
- `"Thread 'thread_01HMXXX' does not exist"`
- `"Handle 'alice' already exists in address book"`

**RuntimeError** - System/state errors:
- `"Address book version conflict: expected 2, current 3"`
- `"Database write failed: <sqlite error>"`
- `"Store path '/invalid/path' is not accessible"`

**OSError** - File/system errors:
- Propagated from file system operations

### 11.3 Edge Cases & Rules

### Address Book Handle Resolution
**v0 Decision**: If `send(to=<handle>)` and handle does not exist in address book:
- **Allow sending to unknown handle**
- The handle is stored in `to_handles` field as-is
- This enables agents to message each other before registering in address book
- Address book is for *discovery*, not *authorization*

### Duplicate Message Send
- Each `send()` generates a unique `message_id` (ULID)
- No idempotency protection in v0 (client responsibility)

### Concurrency Conflicts in Address Book
- If `expected_version` provided and doesn't match current version:
  - Raise `RuntimeError` with current entry details
  - Client must re-read and retry

### Empty or Whitespace-Only Input
- `subject`, `body`, `description`: reject if empty or whitespace-only
- `display_name`, `tags`: allowed to be empty/None

### Thread Updates
- `last_activity_at` updated on every new message in thread
- `participant_handles` recomputed from all messages (no incremental update)

### Search Behavior (v0)
**Message search** (`search_messages`):
- Uses SQLite `LIKE` with case-insensitive matching
- Query is wrapped: `%{query}%`
- Searches in `subject` and/or `body` based on flags
- Results ordered by `created_at` DESC (newest first)
- Example: query "API" matches "REST API design" and "The api endpoint"

**Address book search** (`address_book_search`):
- Uses SQLite `LIKE` with case-insensitive matching
- Searches across: `handle`, `display_name`, `description`, and `tags` (JSON)
- Results ordered by: `status='active'` DESC, then `handle` ASC
- Example: query "python" matches handle "python-bot", description "Python expert", tag "python"

### Audit Log Format
The audit log tracks address book operations with structured details in JSON format:

**address_book_add**:
- `event_type`: "address_book_add"
- `actor_handle`: Agent who performed the add
- `target_handle`: Handle being added
- `details`: JSON string with operation details:
  ```json
  {
    "handle": "bob",
    "display_name": "Bob Smith",
    "description": "Developer"
  }
  ```
- `timestamp`: UTC timestamp

**address_book_update**:
- `event_type`: "address_book_update"
- `actor_handle`: Agent who performed the update
- `target_handle`: Handle being updated
- `details`: JSON string with field changes and version info:
  ```json
  {
    "display_name": "Bob Updated",
    "description": "Senior Developer",
    "is_active": true,
    "old_version": 1,
    "new_version": 2
  }
  ```
- `timestamp`: UTC timestamp

Note: v0 implementation focuses on address book audit logging. Message operations (send/reply) are not currently audited.

---

## 12. v0 / v1 Roadmap (Suggested)

### v0 (Minimum Useful)
- shared store
- init identity
- send
- thread creation + reply
- screen view + thread view
- address book add/edit/search
- console app demo

### v1 (Quality / Scale)
- per-agent read/unread state
- archive/delete (soft)
- full-text search using SQLite FTS
- watch mode w/ notifications
- export/import

---

## 13. Usage Examples

### Example 1: Basic Messaging Flow

```py
from agcom import init, AgentIdentity

# Agent 1: Initialize and send
with init("shared.db", AgentIdentity("alice")) as session:
    # Register in address book
    entry = session.address_book_add(
        handle="alice",
        description="Data analysis and visualization expert"
    )
    print(f"Added {entry.handle}, version {entry.version}, updated by {entry.updated_by}")

    # Send a message
    message = session.send(
        to_handles=["bob"],
        subject="Need help with API design",
        body="Can you review my REST endpoint structure?"
    )
    print(f"Sent message {message.message_id} in thread {message.thread_id}")

# Agent 2: Check inbox and reply
with init("shared.db", AgentIdentity("bob")) as session:
    # View inbox
    print(session.current_screen())

    # List threads
    threads = session.list_threads(limit=10)
    latest = threads[0]

    # Read thread
    messages = session.list_messages(latest.thread_id)

    # Reply
    reply_msg = session.reply(
        message_id=messages[0].message_id,
        body="Sure! Send me the spec and I'll take a look."
    )
    print(f"Replied with message {reply_msg.message_id}")
```

### Example 2: Address Book Discovery

```py
with init("shared.db", AgentIdentity("charlie")) as session:
    # Search for help
    results = session.address_book_search("API")
    for entry in results:
        print(f"{entry.handle}: {entry.description}")

    # Send to discovered agent
    if results:
        message = session.send(
            to_handles=[results[0].handle],
            subject="API question",
            body="I found you via address book search..."
        )
        print(f"Sent to {results[0].handle}")
```

### Example 3: Error Handling

```py
from agcom import init, AgentIdentity

with init("shared.db", AgentIdentity("alice")) as session:
    # Invalid handle (uppercase not allowed)
    try:
        session.send(to_handles=["Bob"], subject="Test", body="Hello")
    except ValueError as e:
        print(f"Error: {e}")
        # Error: Handle must contain only lowercase letters, digits, '.', '_', '-'

    # Valid handle with period
    msg = session.send(to_handles=["agent.1"], subject="Test", body="Hello")
    print(f"Sent to agent.1: {msg.message_id}")

    # Empty body
    try:
        session.send(to_handles=["bob"], subject="Test", body="   ")
    except ValueError as e:
        print(f"Error: {e}")
        # Error: Body cannot be empty or only whitespace

    # Address book conflict
    try:
        session.address_book_add("alice", "Description")
        session.address_book_add("alice", "Another")  # duplicate
    except ValueError as e:
        print(f"Error: {e}")
        # Error: Handle 'alice' already exists in address book

    # Version conflict
    entry = session.address_book_get("alice")
    # Another agent updates it
    try:
        session.address_book_update(
            "alice",
            description="New desc",
            expected_version=entry.version  # may be stale
        )
    except RuntimeError as e:
        print(f"Error: {e}")
        # Error: Address book version conflict: expected 0, current 1
```

### Example 4: Console App Interactive Session

```
$ python -m agcom.console --store shared.db --me alice

=== INBOX (alice) ===
Last updated: 2026-01-24 15:30:00 UTC

[1] thread_01HMXXX... | "Need help with API design"
    From: alice | To: Bob (bob) | Last: 2026-01-24 15:25:00
    Latest: "Sure! Send me the spec and I'll take a look."

[2] thread_01HMYYY... | "Database schema review"
    From: Bob (bob) | To: alice | Last: 2026-01-24 14:10:00
    Latest: "I think we should add an index on user_id..."

Commands: send, threads, view <id>, reply <id>, ab search, help, exit
> view thread_01HMXXX...

=== THREAD: "Need help with API design" ===
Thread ID: thread_01HMXXXYYYYZZZ
Participants: alice, bob
Created: 2026-01-24 15:20:00 UTC

--- Message 1/2 ---
ID: msg_01HMAAABBBCCC
From: alice | To: Bob (bob)
Sent: 2026-01-24 15:20:00 UTC

Can you review my REST endpoint structure?

--- Message 2/2 ---
ID: msg_01HMDDDEEFFFF
From: Bob (bob) | To: alice
Sent: 2026-01-24 15:25:00 UTC
Reply to: msg_01HMAAABBBCCC

Sure! Send me the spec and I'll take a look.

> reply msg_01HMDDDEEFFFF --body @-
Enter message body (Ctrl+D when done):
Here's the spec document:
https://example.com/api-spec.md
^D
Message sent: msg_01HMGGGHHHJJJ

> exit
```

---

## 14. Package Structure (Suggested)

```
agcom/
├── __init__.py              # Public API exports (init, AgentIdentity, etc.)
├── models.py                # Data classes (Message, Thread, AddressBookEntry, etc.)
├── session.py               # AgentCommsSession class
├── storage.py               # SQLite database operations
├── validation.py            # Input validation functions
├── ulid_gen.py              # ULID generation utility
├── exceptions.py            # Custom exception classes (optional)
├── console/
│   ├── __init__.py
│   ├── __main__.py          # Entry point for python -m agcom.console
│   ├── cli.py               # Command parsing and dispatch
│   ├── commands.py          # Command implementations
│   └── rendering.py         # Screen and thread view formatting
└── tests/
    ├── test_validation.py
    ├── test_session.py
    ├── test_storage.py
    ├── test_threading.py
    ├── test_address_book.py
    ├── test_concurrency.py
    └── test_console.py
```

**Public API** (exported from `agcom/__init__.py`):
```python
from agcom import (
    init,
    AgentIdentity,
    AgentCommsSession,
    Message,
    Thread,
    AddressBookEntry,
    AuditEvent,
    ScreenOptions,
)
```

---

## 15. Implementation Checklist

### Core Library
- [ ] Data models (Message, Thread, AddressBookEntry, AuditEvent, ScreenOptions)
- [ ] ULID generation utility
- [ ] Validation functions (handle, subject, body, tags, description)
- [ ] SQLite schema creation with indexes
- [ ] Schema version tracking
- [ ] Database connection management (WAL mode, busy timeout, foreign keys)
- [ ] Transaction handling for all write operations
- [ ] `init()` function and session management
- [ ] `send()` implementation (create thread + message + audit)
- [ ] `reply()` implementation (attach to message + update thread)
- [ ] `reply_thread()` implementation (find latest message + reply)
- [ ] Thread listing with ordering and limits
- [ ] Message retrieval with ordering and limits
- [ ] Message search with filtering
- [ ] Participant handles computation (deduplicate, sort)
- [ ] Address book CRUD operations (add, update, get, list, search)
- [ ] Address book version conflict detection
- [ ] Audit log creation for all write operations
- [ ] Audit log listing
- [ ] Context manager support (`__enter__` / `__exit__`)
- [ ] Display name resolution (address book lookup at render time)
- [ ] Error handling with clear messages

### Console App
- [ ] CLI argument parsing (argparse or click)
- [ ] Single command mode vs interactive mode detection
- [ ] Interactive command loop with prompt
- [ ] Command dispatcher (route to handlers)
- [ ] Session/identity commands (init, open, whoami)
- [ ] Messaging commands (send, reply, reply-thread, threads, view, search)
- [ ] Address book commands (ab add, edit, list, show, search, deactivate, history)
- [ ] Utility commands (help, exit)
- [ ] Multi-line input handling (`--body @-`)
- [ ] File input handling (`--body-file <path>`)
- [ ] Inbox screen rendering with truncation
- [ ] Thread view rendering with message formatting
- [ ] Display name vs handle rendering
- [ ] Timestamp formatting
- [ ] Truncation with ellipsis at word boundaries
- [ ] Watch mode (continuous refresh, Ctrl+C handling)

### Testing
- [ ] Unit tests for message threading
- [ ] Concurrent access tests (multiple processes)
- [ ] Address book version conflict tests
- [ ] Handle validation tests
- [ ] Edge case coverage

---

## 14.1 Testing Strategy

### Unit Tests
**Data Model & Validation**:
- Test all validation functions (handle, subject, body, tags, description)
- Test edge cases (empty, whitespace, max length, special characters)
- Test ULID generation and sorting
- Test participant_handles computation

**Core Operations**:
- `send()` creates new thread and message
- `reply()` attaches to existing thread and updates last_activity_at
- `reply_thread()` finds most recent message and replies
- Thread listing ordered by last_activity_at
- Message listing ordered by created_at
- Participant handles computed correctly

**Address Book**:
- Add, update, get, list, search operations
- Version conflict detection
- Status filtering
- Tag deduplication

**Search**:
- Case-insensitive substring matching
- Participant filtering
- Field selection (subject, body, both)

### Integration Tests
**Multi-Agent Scenarios**:
- Two agents exchanging messages
- Three-way conversation threads
- Concurrent writes from multiple processes
- Address book edits from multiple agents

**Concurrency & Locking**:
- Simultaneous sends to different threads
- Simultaneous replies to same thread
- Address book version conflicts
- Database busy timeout handling

**Error Handling**:
- Invalid handles, subjects, bodies
- Non-existent thread/message IDs
- Database corruption recovery
- File permission errors

### Console App Tests
- Command parsing
- Multi-line input
- File input
- Watch mode
- Interactive mode vs single command mode

---

## 16. Quick Start Guide (For Implementers)

### Minimal Implementation Path

1. **Start with data models** (`models.py`)
   - Define all dataclasses
   - Implement validation functions

2. **Implement storage layer** (`storage.py`)
   - Create schema with indexes
   - Implement basic CRUD operations
   - Add transaction handling

3. **Build session class** (`session.py`)
   - Implement `init()` function
   - Implement `send()` operation
   - Implement `reply()` operation
   - Add thread/message listing

4. **Add address book** (`session.py`)
   - Implement add/update/get/list/search
   - Add version conflict handling

5. **Build console app** (`console/`)
   - Start with single command mode
   - Add interactive mode
   - Implement screen rendering
   - Add all commands

6. **Write tests** (`tests/`)
   - Unit tests for each component
   - Integration tests for multi-agent scenarios
   - Concurrency tests

### First Working Demo

Minimum to demonstrate:
```python
# demo.py
from agcom import init, AgentIdentity

# Agent 1 sends
with init("demo.db", AgentIdentity("alice")) as s:
    msg = s.send(["bob"], "Hello", "How are you?")
    print(f"Sent: {msg.message_id}")

# Agent 2 replies
with init("demo.db", AgentIdentity("bob")) as s:
    threads = s.list_threads(limit=1)
    messages = s.list_messages(thread_id=threads[0].thread_id)
    reply = s.reply(messages[0].message_id, "I'm good!")
    print(f"Replied: {reply.message_id}")

# Agent 1 views thread
with init("demo.db", AgentIdentity("alice")) as s:
    threads = s.list_threads(limit=1)
    print(s.view_thread(threads[0].thread_id))
```

Expected output:
```
Sent: msg_01HMXXX...
Replied: msg_01HMYYY...

=== THREAD: "Hello" ===
Thread ID: thread_01HMZZZ...
Participants: alice, bob
Created: 2026-01-24 15:30:00 UTC

--- Message 1/2 ---
ID: msg_01HMXXX...
From: alice | To: bob
Sent: 2026-01-24 15:30:00 UTC

How are you?

--- Message 2/2 ---
ID: msg_01HMYYY...
From: bob | To: alice
Sent: 2026-01-24 15:30:01 UTC
Reply to: msg_01HMXXX...

I'm good!
```

---

## 17. Future Enhancements (Post-v0)

### v1 Candidates
- Per-agent read/unread state
- Soft delete / archive threads
- SQLite FTS5 full-text search
- Message edit history
- Batch operations
- Export/import (JSON format)
- Thread tags/labels
- Notification webhooks

### v2+ Ideas
- Message attachments (binary blobs)
- Rich text support (Markdown)
- Thread permissions model
- External API (REST or GraphQL)
- Multi-database federation
- Message reactions/acknowledgments

---

## 18. Design Decisions Summary

This section lists all key decisions made in this specification.

### Core Architecture
✅ **Library-first design**: Python library with console app reference implementation
✅ **Shared store model**: Single SQLite database shared by all agents
✅ **Zero-trust collaboration**: No access control, full read/write for all agents
✅ **Email-like abstraction**: Messages, threads, subjects, body text

### Threading Model
✅ **send() creates new thread**: Each send operation starts a new conversation
✅ **reply() attaches to existing**: Replies use in_reply_to field
✅ **Subject is immutable**: Cannot change subject within a thread
✅ **Participants computed**: Derived from all messages, alphabetically sorted
✅ **Multiple recipients supported**: to_handles accepts list of handles

### Identifiers & Timestamps
✅ **ULID for all IDs**: Sortable, timestamp-embedded identifiers
✅ **UTC everywhere**: All timestamps in UTC, stored as ISO 8601
✅ **Display name optional**: Prefer display_name, fallback to handle

### Validation & Limits
✅ **Handle**: Lowercase `[a-z0-9._-]`, 2-64 chars, cannot start/end with `.` or `-`
✅ **Subject**: 1-200 chars, no empty or whitespace-only
✅ **Body**: 1-50,000 chars, no empty or whitespace-only
✅ **Description**: 0-500 chars, optional (can be None or empty)
✅ **Display name**: 0-100 chars, optional (can be None or empty)
✅ **Tags**: Lowercase `[a-z0-9_-]`, 1-30 chars per tag, max 20 tags, automatic deduplication

### Address Book
✅ **Discovery not authorization**: Can message unknown handles
✅ **Optimistic concurrency**: Version field with conflict detection (starts at 1)
✅ **is_active field**: Boolean flag (for deactivation without deletion)
✅ **updated_by tracking**: Records which agent made last modification
✅ **Audit log**: Track all address book changes with target_handle and structured details (JSON)
✅ **Description optional**: Not required (can be None)
✅ **Returns entry objects**: All mutations return full AddressBookEntry for immediate use

### Storage
✅ **SQLite with WAL**: Concurrent reads + single writer
✅ **5-second busy timeout**: Handle write contention gracefully
✅ **Foreign keys enforced**: messages.thread_id → threads.thread_id
✅ **JSON for arrays**: participant_handles, to_handles, tags stored as JSON
✅ **Schema versioning**: Metadata table with version field

### Search
✅ **Substring matching**: SQLite LIKE with case-insensitive matching (v0)
✅ **No FTS in v0**: Deferred to v1 for performance
✅ **Result ordering**: By relevance criteria (created_at DESC)

### Console App
✅ **Two modes**: Single command mode and interactive mode
✅ **Multi-line input**: `--body @-` reads from stdin until EOF
✅ **File input**: `--body-file <path>` reads from file
✅ **Watch mode**: 1-second refresh interval

### Scale Targets (v0)
✅ **10k-100k messages**: Target scale for v0
✅ **5-20 concurrent agents**: Expected concurrent access
✅ **<200ms screen render**: Performance target (p95)

### Implemented in v0
✅ **Message tags**: Messages can have optional tags with format validation
✅ **Multiple recipients**: to_handles supports list of handles
✅ **Offset pagination**: list_threads and list_messages support offset parameter
✅ **Address book filtering**: active_only parameter for list/search
✅ **Consistent return types**: All mutations return full objects (Phase 1)
✅ **Updated by tracking**: Address book tracks who made changes (Phase 1)
✅ **Period support in handles**: Allows agent.1, team.lead format (Phase 1)
✅ **Tag deduplication**: Automatic deduplication and format enforcement (Phase 1)
✅ **Structured audit logging**: JSON details in audit events (Phase 1)
✅ **Performance index**: from_handle indexed for fast queries (Phase 1)

### Deferred to v1
⏸️ **Per-agent read/unread state**: Not in v0
⏸️ **Full-text search (FTS5)**: Not in v0
⏸️ **Message editing**: Not in v0
⏸️ **Soft delete/archive**: Not in v0
⏸️ **Attachments**: Not in v0
⏸️ **Rich text**: Not in v0
⏸️ **Address book tags**: Not in v0 (messages have tags)

---

## 19. Document Revision History

- **v1.0** (initial): Basic structure with open questions
- **v2.0**: Complete specification with:
  - All open questions resolved
  - Concrete SQLite schema
  - Field length limits specified
  - Validation rules detailed
  - Error handling specified
  - Console app fully detailed
  - Search behavior clarified
  - Audit log payload format defined
  - Transaction boundaries specified
  - Performance targets added
  - Testing strategy included
  - Package structure suggested
  - Quick start guide added
  - Design decisions summary added
- **v3.0**: Updated to match actual implementation:
  - Changed `in_reply_to_message_id` → `in_reply_to`
  - Added `tags` field to Message model
  - Changed AddressBookEntry `status` → `is_active` (boolean)
  - Removed `tags` from AddressBookEntry (deferred to v1+)
  - Made `description` optional in AddressBookEntry
  - Updated AuditEvent structure (`target_handle` + `details` instead of `payload_json`)
  - Updated ScreenOptions (width-based instead of truncate-based)
  - Added support for multiple recipients in `send()`
  - Added `offset` parameter to list methods
  - Added `active_only` parameter to address book methods
  - Simplified search_messages parameters
- **v3.1**: Phase 1 improvements for API consistency and audit:
  - **Improved return types**: `send()`, `reply()`, `reply_thread()` now return full `Message` objects
  - **Improved return types**: `address_book_add()` and `address_book_update()` return `AddressBookEntry` objects
  - **Added `updated_by` field**: AddressBookEntry now tracks who made last update
  - **Fixed handle validation**: Now allows periods `[a-z0-9._-]`, min length 2, cannot start/end with `.` or `-`
  - **Fixed tag validation**: Enforces format `[a-z0-9_-]`, 1-30 chars per tag, max 20 tags, automatic deduplication
  - **Added database index**: `idx_messages_from` on `messages(from_handle)` for performance
  - **Enhanced audit logging**: Address book operations include structured details in JSON format
  - Updated all code examples to match improved API
- **v3.2** (current): Phase 2 usability improvements:
  - **Enhanced search**: `search_messages()` now supports `in_subject`, `in_body`, `from_handle`, `to_handle` filters
  - **Address book tags**: Added `tags` field to AddressBookEntry for skill/role/team categorization
  - **Tag-based search**: `address_book_search()` now supports filtering by tags
  - **Bulk operations**: Added `send_broadcast()` (N threads) and `send_group()` (1 thread) methods
  - **Thread metadata**: Added optional `metadata` dict to Thread model for extensibility
  - **Metadata management**: New methods `update_thread_metadata()`, `get_thread_metadata()`, `archive_thread()`, `unarchive_thread()`
  - **Message audit logging**: `send()` and `reply()` now create audit events for MESSAGE_SEND, MESSAGE_REPLY, and THREAD_CREATE
  - Added comprehensive Phase 2 test suite (18 new tests)
