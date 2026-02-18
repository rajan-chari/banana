# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status: Fresh Reimplementation

This is a **from-scratch reimplementation** of the agcom system. There is no existing code — only specification documents. Do not reference `../python/` for prior implementation; build everything new in this directory.

## Specs (Source of Truth)

| Spec | What It Defines |
|------|----------------|
| `spec/agcom-spec.md` | Core messaging library — SQLite-backed, threaded, auditable agent communication |
| `spec/agcom-api-spec.md` | REST API — thin FastAPI wrapper over the library, session-based auth, admin endpoints |
| `spec/agcom-viewer-spec.md` | Web viewer — read-only SPA for monitoring agent messages in real time |

Read the specs before implementing. They define data models, functional requirements, integration points, and non-functional constraints.

## Architecture (from specs)

Three layers with strict dependency direction:

```
agcom-viewer (read-only web UI)
    ↓ HTTP
agcom-api (FastAPI REST server, thin wrapper, no business logic)
    ↓ Python
agcom (core library, all business logic, SQLite storage)
```

### agcom (core library)
- **Entities**: Message, Thread, Contact (address book), AuditEvent, AgentIdentity
- **Storage**: Single SQLite file, IDs are ULIDs (chronologically sortable)
- **Sessions**: Authenticated agent connection enforcing visibility (agents only see their own threads unless admin)
- **Admin**: Determined by a tag in the address book, grants cross-agent visibility
- **Immutability**: Messages and audit events are append-only
- **Concurrency**: Must handle multiple agents on same DB with proper locking
- **Contacts**: Optimistic locking via version counter

### agcom-api (REST server)
- **No business logic** — delegates everything to the agcom library
- **Auth**: Handle-based login (no passwords), bearer tokens, configurable session expiry, persistent sessions
- **Endpoints**: Auth, messages, threads, contacts, audit, admin, health (~28 endpoints)
- **Admin endpoints**: Unscoped access, incremental polling (`since_id`), user list, system stats
- **Config**: All via env vars (`AGCOM_API_HOST`, `AGCOM_API_PORT`, `AGCOM_DB_PATH`, `AGCOM_SESSION_EXPIRY`, `LOG_LEVEL`)
- **Error codes**: 400/401/403/404/409/500 with consistent structure

### agcom-viewer (web dashboard)
- **Static SPA**: Vanilla HTML/CSS/JS, no build step, no framework
- **Dual mode**: Admin (see everything) vs User (one agent's perspective)
- **Master-detail layout**: List panel + detail panel, resizable
- **Real-time**: Auto-refresh polling (~3s), incremental fetching
- **Dark theme**, keyboard navigation, sortable/resizable columns
- **Served by**: Minimal static file server with a config endpoint for API URL discovery

## Environment

- **OS**: Windows 11
- **Claude Code Bash Tool**: Uses `/usr/bin/bash` (Git Bash) — use bash syntax, not PowerShell
- **Python**: 3.10+

## Build Order

Implement bottom-up following the dependency chain:
1. **agcom** — core library and tests
2. **agcom-api** — REST server on top of agcom
3. **agcom-viewer** — web UI consuming the API
