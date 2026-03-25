# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Startup

Before responding to the user's first message:

1. **Read knowledge files**
   - Read `Claude-KB.md` in this directory (domain knowledge, lessons learned). Create it if missing with a `## Lessons Learned` heading.
   - Don't read md files from the parent directory unless the user requests it.
   - Look for a `*-private.md` file matching the user's name (e.g., `Rajan-private.md`). If one exists, read it — it contains personal TODOs, preferences, and reminders. If it references a durable location, read and update that too.

2. **Read session context**
   - Read `briefing.md` — committed to git, updated incrementally during sessions. Contains current focus, don't-forget items, recent timestamped entries, and next-up priorities. Prune entries older than 7 days or beyond ~20 entries on startup (append pruned entries to `briefing-archive.md`).
   - Read `tracker.md` — persistent work tracker with active items, status, and details. Update it as work progresses.
   - Surface relevant items in the greeting.

3. **Greet the user** — Surface any open TODOs/reminders from private notes, then offer common scenarios:
   - **Start the server** — `source .venv/Scripts/activate && emcom-server`
   - **Register an identity** — `emcom register --name <name>`
   - **Send a message** — `emcom send --to <name> --subject "..." --body "..."`
   - **Check inbox** — `emcom inbox`
   - **Launch the TUI** — `emcom-tui`
   - **Run tests** — `pytest tests/ -v`

## What This Is

emcom is an email-metaphor messaging system for AI agent-to-agent communication. It provides a REST API server, Python client library, CLI (one-shot + interactive REPL), and a Textual TUI — all so multiple Claude Code instances can exchange messages using familiar email semantics.

## Commands

```bash
# Setup
python -m venv .venv && source .venv/Scripts/activate && pip install -e ".[dev]"

# Run server (default port 8800, data in ~/.emcom/)
emcom-server
EMCOM_PORT=9000 emcom-server              # custom port
EMCOM_DATA_DIR=/tmp/emcom emcom-server     # custom data dir

# CLI (one-shot)
emcom register --name alice --description "test agent"
emcom who
emcom send --to bob --subject "Hi" --body "Hello"
emcom inbox
emcom                                      # launches interactive REPL

# TUI (Textual app)
emcom-tui

# Tests
pytest tests/ -v
pytest tests/test_server.py::TestEmail -v  # single test class
pytest tests/test_server.py::TestEmail::test_send_and_inbox -v  # single test
```

## Architecture

Two top-level packages, both included in the wheel:

```
emcom/          → Client library + CLI + TUI (entry points: emcom, emcom-tui)
emcom_server/   → FastAPI server (entry point: emcom-server)
```

### Server (`emcom_server/`)

- `main.py` — FastAPI app factory (`create_app()`), auth middleware (checks `X-Emcom-Name` header against registered identities), health/purge endpoints, router wiring
- `db.py` — All SQL in one place. `Database` class wraps SQLite (WAL mode). Tables: `identities`, `emails`, `tags`, `name_pool`. Prefix-matching ID resolution for short IDs.
- `models.py` — Pydantic request models (`RegisterRequest`, `SendEmailRequest`, etc.)
- `routers/` — One router per domain: `identity`, `names`, `email`, `threads`, `tags`, `search`, `attachments`

Auth flow: middleware extracts `X-Emcom-Name` header → checks `db.is_registered()` → updates `last_seen`. Paths in `NO_AUTH_PATHS` / `NO_AUTH_PREFIXES` skip auth (health, register, who, names, docs).

### Client (`emcom/`)

- `client.py` — `EmcomClient` (sync httpx). Reads `identity.json` for auth. All API methods return dataclasses from `models.py`. Has `ensure_server()` to auto-start server as background process.
- `models.py` — Dataclasses: `Email`, `Identity`, `Thread`, `LocalIdentity`
- `cli.py` — argparse CLI with one-shot commands + interactive REPL. REPL supports numbered item references (type `3` to read item 3, `r 3` to reply).
- `tui.py` — Textual app with tabbed inbox/sent/all/threads, preview pane, compose/reply/who modals. Grid layout (3fr/2fr) keeps table and preview both visible. Keybindings: 1-4 or left/right arrows for tabs, j/k nav, c compose, r reply, w who, F5 refresh. Auto-focuses inbox on startup.
- `formatting.py` — Text formatters for CLI output

### Identity Model

- Agents register with a name (or get one auto-assigned from the server's name pool of ~50 friendly names)
- Registration creates `identity.json` in CWD — one identity per directory
- `identity.json` contains `{name, server, registered_at}` and is used for all subsequent auth

### Threading

- First email in a conversation creates a new `thread_id` (UUID)
- Replies with `in_reply_to` inherit the parent's `thread_id`
- Replies auto-generate `Re: ` subject prefix if not provided

### Tags

- Per-owner: each agent manages their own tags on each email independently
- System tag `unread` auto-added on delivery, removed when email is read via GET `/email/{id}`

## Testing

Tests use `FastAPI.TestClient` with a temp directory per test (no real server needed). The `EMCOM_DATA_DIR` env var is set before importing the app to isolate test data. Pattern: register agents → perform actions → assert API responses.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EMCOM_HOST` | `127.0.0.1` | Server bind address |
| `EMCOM_PORT` | `8800` | Server port |
| `EMCOM_DATA_DIR` | `~/.emcom` | SQLite DB + attachments directory |

## Packaging

PyInstaller spec `emcom-tui.spec` exists for building the TUI as a standalone executable.

## Auto-Save Strategy

Sessions can die without warning. Saves must happen DURING the session, not at the end.

### Layer 1: Milestone saves
After completing any In Motion item in `tracker.md`, immediately:
- Update `tracker.md` (move item to Completed, update timestamp)
- Commit and push

### Layer 2: Periodic checkpoints
- **Every 30 min** — lightweight: update `tracker.md` + commit/push
- **Every 2 hrs** — full ceremony: `/rc-save`, `/rc-session-save`, `/rc-greet-save`

### Session End Routine
If you know a session is ending, run these skills in order:

1. `/rc-save` — Commit/push repos, capture learnings in Claude-KB.md
2. Update `briefing.md` — ensure Current Focus and Next Up reflect end-of-session state, commit
3. `/rc-greet-save` — Tune the startup greeting if this session revealed gaps

## Lessons Learned

This workspace is a **learning system**. Claude-KB.md contains a `## Lessons Learned` section that persists knowledge across sessions.

### When to add an entry

Proactively add a lesson whenever you encounter:

- **Unexpected behavior** — an API, tool, or workflow didn't work as expected and you found the cause
- **Workarounds** — a problem required a non-obvious solution that future sessions should know about
- **User preferences** — the user corrects your approach or states a preference
- **Process discoveries** — you learn how something actually works vs. how it's documented
- **Pitfalls** — something that wasted time and could be avoided next time

### How to add an entry

Append to the `## Lessons Learned` section in `Claude-KB.md` using this format:

```markdown
### YYYY-MM-DD: Short descriptive title
Description of what happened and what to do differently. Keep it concise and actionable.
```

### Guidelines

- Write for your future self — assume no prior context from this session
- Be specific: include tool names, flag names, error messages, or exact steps
- Don't duplicate existing entries — read the section first
- One entry per distinct lesson; don't bundle unrelated things
- Ask the user before adding if you're unsure whether something qualifies
