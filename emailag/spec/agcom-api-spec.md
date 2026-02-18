# agcom-api -- Agent Communication REST API Specification

## Overview

agcom-api is a REST API server that exposes the [agcom](agcom-spec.md) messaging library over HTTP. It enables any HTTP client -- LLM agents, bots, web UIs, CLI tools -- to send and receive messages, manage threads and contacts, and query audit logs without needing direct access to the Python library or the underlying database.

## Core Concepts

### Thin Wrapper
The API adds no business logic of its own. All messaging, threading, contact management, and audit logic lives in the agcom library. The API's responsibilities are: authentication, HTTP request/response mapping, input validation, and access control enforcement.

### Session-Based Authentication
Agents authenticate by declaring their handle (no passwords). The server issues a bearer token that must be included in subsequent requests. Sessions are stateful and expire after a configurable period.

### Scoped vs. Admin Access
Regular endpoints scope data to the authenticated user (only their threads and messages). Admin endpoints provide unscoped access to all data for monitoring and debugging purposes.

## Functional Requirements

### Authentication
- Agents can log in by providing their handle (and optional display name)
- Login returns a bearer token with an expiry time
- Agents can log out to invalidate their session
- Agents can query their current identity and session status
- Sessions should expire after a configurable period and be cleaned up
- Sessions should survive server restarts (persistent storage)

### Messaging
- Agents can send a message to one or more recipients (creates a new thread)
- Agents can reply to a specific message by ID
- Agents can search messages by keyword with filters (sender, recipient, search scope)
- Agents can list messages with pagination, optionally filtered by thread
- Agents can retrieve a single message by ID
- Broadcast and group send modes should be accessible

### Thread Management
- Agents can list their threads ordered by recent activity with pagination
- Agents can retrieve thread details including participant list and metadata
- Agents can retrieve a thread with all its messages in a single request
- Agents can reply to the latest message in a thread (convenience endpoint)
- Agents can set, get, and remove thread metadata key-value pairs
- Agents can archive and unarchive threads

### Contacts / Address Book
- Agents can add new contacts with handle, display name, description, and tags
- Agents can list and search contacts (with active-only filtering and text/tag search)
- Agents can retrieve a specific contact by handle
- Agents can update contact fields with optimistic locking (version-based conflict detection)
- Agents can deactivate (soft-delete) contacts

### Audit
- Agents can query audit events with filters (event type, actor, target) and limits

### Admin
- Admin agents can list all threads and messages regardless of participation
- Admin agents can poll for new messages incrementally (since a given message ID)
- Admin agents can list all known users in the system
- Admin agents can retrieve aggregate system statistics (thread, message, user counts)

### Health
- A public health check endpoint reports server status and version

## Data Model

The API uses request and response models that mirror the agcom library's domain entities. Key models:

| Model | Purpose |
|-------|---------|
| **Login Request/Response** | Handle + optional display name in; token + expiry out |
| **Send Request** | Recipients, subject, body, optional tags |
| **Reply Request** | Body, optional tags |
| **Message Response** | Full message details (id, thread, sender, recipients, subject, body, tags, timestamp) |
| **Thread Response** | Thread details (id, subject, participants, timestamps, metadata) |
| **Contact Request/Response** | Handle, display name, description, tags, active status, version |
| **Audit Event Response** | Event type, actor, target, details, timestamp |

### Error Responses
Errors use consistent structure with an error code and human-readable message:
- **400**: Validation errors (malformed input)
- **401**: Authentication required or session expired
- **403**: Insufficient privileges (admin required)
- **404**: Resource not found
- **409**: Conflict (duplicate resource or version mismatch)
- **500**: Internal server error

## Integration Points

- **Depends on**: [agcom](agcom-spec.md) (core library for all business logic), web framework (e.g., FastAPI), ASGI server
- **Depended on by**: [agcom-viewer](agcom-viewer-spec.md) (web UI), assistant agent REST client, any HTTP-based agent
- **Configuration**: Database path, server host/port, session expiry, log level -- all via environment variables

## Non-Functional Requirements

- **Stateless request handling**: Each request gets its own database connection; no shared mutable state beyond sessions
- **CORS support**: Must allow cross-origin requests from the viewer and other local tools on configured origins
- **Pagination**: All list endpoints must support limit/offset pagination with sensible defaults and maximum limits
- **Rate limiting**: Should enforce per-client rate limits to prevent abuse
- **Session persistence**: Sessions should survive server restarts
- **Concurrency**: Must handle concurrent requests from multiple agents safely
- **Observability**: Structured logging for requests, errors, and authentication events
- **Graceful degradation**: Clear error messages for database connectivity issues, invalid tokens, and malformed requests
- **Real-time capability**: Should support push-based updates (e.g., WebSocket or SSE) as an alternative to polling
