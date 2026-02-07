# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Teams-like real-time chat application. Two-tier architecture: Python/FastAPI backend + React/TypeScript frontend, connected via REST and WebSocket.

## Commands

### Server (Python FastAPI)

```bash
cd app/server
python -m venv .venv && source .venv/Scripts/activate  # Windows (Git Bash)
pip install -e ".[dev]"

# Run server
uvicorn src.main:app --reload              # http://localhost:8000

# Seed test users (alice/bob/carol/dave@example.com, password: password123)
python -m src.db.seed

# Tests & linting
pytest tests/ -v
ruff check src/
ruff format src/
```

### Client (React/TypeScript)

```bash
cd app/client
npm install
npm run dev      # http://localhost:5173 (proxies /api + /ws to :8000)
npm run build    # tsc -b && vite build
npm run lint     # eslint
```

### Run both together

Start server first (`uvicorn`), then client (`npm run dev`). Vite proxies `/api` and `/ws` to `localhost:8000`.

## Architecture

### Backend (`app/server/src/`)

FastAPI app with SQLAlchemy async + aiosqlite (SQLite). Tables auto-created on startup via `init_db()`.

| Layer | Location | Purpose |
|-------|----------|---------|
| Entry | `main.py` | FastAPI app, lifespan, router mounts, CORS |
| Config | `config.py` | Pydantic settings, env vars prefixed `CHAT_` |
| DB | `db/engine.py` | Async engine + session factory |
| Models | `db/models.py` | 8 SQLAlchemy models (User, Chat, ChatMember, Message, MessageReaction, MessageMention, MessageAttachment, LinkPreview) |
| Auth | `auth/` | JWT (PyJWT + bcrypt), OAuth2PasswordBearer, `get_current_user` dependency |
| REST API | `api/` | Routers for chats, messages, attachments, users (all under `/api/v1/`) |
| WebSocket | `ws/handler.py` | Single `/ws` endpoint, auth via `?token=`, handles 7 frame types |
| WS Manager | `ws/manager.py` | In-memory connection tracking (user_id -> Set[WebSocket]), broadcast to chat members |
| Services | `services/link_preview.py` | Background link preview extraction |

**WebSocket protocol:** Client sends JSON frames with `{type, id, payload}`. Server responds with `ack`, `error`, or broadcasts event types (`message.new`, `message.updated`, `message.deleted`, `message.reaction`, `typing.indicator`, `read.receipt`).

**Auth flow:** Register/login returns JWT. REST uses `Authorization: Bearer <token>`. WebSocket authenticates via query param `?token=<jwt>`.

### Frontend (`app/client/src/`)

React 18 + TypeScript + Vite. CSS Modules for component styling, CSS custom properties for design tokens.

| Layer | Location | Purpose |
|-------|----------|---------|
| Entry | `main.tsx`, `App.tsx` | AuthProvider wraps app; unauthenticated shows LoginPage |
| API Client | `api/client.ts` | Typed fetch wrapper, all REST endpoints, token in localStorage |
| WebSocket | `api/websocket.ts` | Singleton `chatWS` class with reconnect logic, event emitter pattern |
| Hooks | `hooks/useAuth.tsx` | Auth context (login/register/logout), validates stored token on mount |
| Hooks | `hooks/useChat.ts` | `useChats` (chat list), `useMessages` (messages + optimistic updates), `useTyping`, `useReadReceipts` |
| Types | `types/chat.ts` | Frontend domain types (User, ChatPreview, Message, Reaction, etc.) |
| Components | `components/` | Atomic design: atoms, molecules, organisms, templates, pages |
| Styles | `styles/` | `tokens.css` (design tokens), `dark.css` (theme colors), `reset.css`, `global.css` |

**Component structure:** Each component in its own directory: `ComponentName/ComponentName.tsx` + `ComponentName.module.css` + `index.ts` barrel.

**Path alias:** `@/*` maps to `src/*` via tsconfig paths.

**State management:** React Context for auth, hooks for chat data. No external state library. WebSocket events update state in hooks directly.

**Optimistic UI:** `useMessages` creates temp messages (id prefixed `temp-`) for sends, deduplicates when server confirms via WS or REST response.

## Key Patterns

- **Dual messaging path:** Messages sent via REST (`POST /chats/:id/messages`) for reliability, real-time updates arrive via WebSocket. Both paths must stay in sync.
- **WS broadcast:** `ConnectionManager.broadcast_to_chat()` queries DB for chat members on every broadcast (no in-memory membership cache).
- **camelCase/snake_case:** Backend uses snake_case, frontend uses camelCase. Mapping happens in `useChat.ts` helper functions (`mapMessageResponse`, `mapWSMessage`).
- **CSS theming:** Dark theme colors in `styles/dark.css` using `[data-theme="dark"]` selector. Design tokens (spacing, typography, radii) in `tokens.css`.
- **TypeScript strictness:** `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` enabled.

## Environment Variables

Server settings via `CHAT_` prefix (e.g., `CHAT_SECRET_KEY`, `CHAT_DATABASE_URL`). See `app/server/src/config.py` for all options. Default DB: `sqlite+aiosqlite:///data/chat.db`.

## Spec Reference

Detailed specs in `specs/` (messaging, organization, infrastructure, UI design) and `teams-app-spec.md`. The specs define the full target feature set; the current implementation covers Phase 1 core chat features.
