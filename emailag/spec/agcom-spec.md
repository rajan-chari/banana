# agcom -- Agent Communication Library Specification

## Overview

agcom is a local-first messaging library that provides email-like communication between software agents. It enables structured, auditable, threaded messaging so that multiple autonomous agents (e.g., LLM-powered team members) can coordinate through a shared communication channel backed by a single SQLite database.

## Core Concepts

### Agent Identity
An agent is identified by a unique **handle** -- a short, human-readable string (like a username). Handles are the primary addressing mechanism for all messaging. An agent may also carry a display name for presentation purposes.

### Session
A session represents an authenticated agent's connection to the message store. All operations (send, read, search, manage contacts) are performed through a session, which enforces visibility rules: agents can only see conversations they participate in, unless they hold admin privileges.

### Messages and Threads
Messages are the atomic unit of communication. Each message has a sender, one or more recipients, a subject, a body, and optional tags. Messages are always grouped into **threads** -- a thread is a conversation container that tracks its participants and activity over time. Sending a new message creates a new thread; replying adds to an existing thread.

### Address Book
A shared directory of known agents with metadata (display name, description, tags, active/inactive status). Supports optimistic locking for safe concurrent updates.

### Audit Log
All significant actions (message sends, replies, contact changes) are recorded as immutable audit events for traceability.

## Functional Requirements

### Messaging
- Agents can send messages to one or more recipients, creating a new conversation thread
- Agents can reply to a specific message or to the latest message in a thread
- Replies automatically determine recipients (reply to sender, or to original recipients if replying to own message)
- Agents can send broadcast messages that create separate one-on-one threads per recipient
- Messages support optional tags for categorization
- Messages are immutable once sent

### Thread Management
- Threads track their participant list, which expands automatically as new agents join via replies
- Threads support arbitrary key-value metadata for extensibility
- Threads can be archived and unarchived
- Threads are ordered by last activity time

### Search and Discovery
- Agents can search messages by keyword across subject and body
- Search supports filtering by sender, recipient, and result limits
- Agents can list their threads ordered by recent activity

### Address Book
- Agents can add, update, search, and deactivate contacts
- Contact updates use optimistic locking (version counter) to prevent lost updates
- Contacts can be tagged for categorization and role assignment
- Contacts can be soft-deleted (deactivated) rather than permanently removed

### Access Control
- Admin agents can see all threads and messages regardless of participation
- Non-admin agents can only see threads they participate in
- Admin status is determined by a designated tag in the address book

### Audit
- Every message send, reply, thread creation, and contact modification generates an audit event
- Audit events record the actor, target, event type, details, and timestamp
- Audit events can be queried with filters

## Data Model

### Entities

| Entity | Key Attributes | Notes |
|--------|---------------|-------|
| **Agent Identity** | handle, display_name | Value object, not persisted independently |
| **Message** | id, thread_id, sender, recipients, subject, body, tags, reply_to, timestamp | Immutable after creation |
| **Thread** | id, subject, participants, created_at, last_activity, metadata | Participants auto-maintained |
| **Contact** | handle, display_name, description, tags, active, version, timestamps | Versioned for optimistic locking |
| **Audit Event** | id, event_type, actor, target, details, timestamp | Append-only log |

### Relationships
- A thread contains one or more messages (1:N)
- A message optionally references another message as its reply parent (self-referential)
- Contacts are independent of messages/threads (no foreign key relationship)
- IDs should be chronologically sortable (e.g., ULIDs)

## Integration Points

- **Depends on**: SQLite (or equivalent embedded storage), ID generation library
- **Depended on by**: [agcom-api](agcom-api-spec.md) (REST API wrapper), assistant agents (via API client)
- **No network dependencies**: The core library is entirely local -- network access is provided by the API layer

## Non-Functional Requirements

- **Local-first**: Must operate without network services; single-file storage
- **Concurrency**: Must handle multiple agents reading/writing simultaneously via the same database file with appropriate locking
- **Immutability**: Messages and audit events must be append-only; no modification or deletion
- **Validation**: All inputs (handles, subjects, bodies, tags) must be validated at the boundary with clear, consistent rules
- **Performance**: Must handle thousands of messages and hundreds of threads without degradation in a local context
- **Minimal dependencies**: Core library should remain lightweight with few external dependencies
- **Extensibility**: Thread metadata and message tags provide extension points without schema changes
