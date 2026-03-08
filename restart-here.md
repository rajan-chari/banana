# Restart Here

## What We Were Doing

Analyzing a failed screenshot task in the LLM assistant's multi-agent system to identify coordination bugs in EM (Engineering Manager) agent.

## The Task

User asked "take a screenshot of my computer and display it to me" via the assistant at ~3:00 PM on 2026-02-21. It generated 36 messages for a simple screenshot — far too many.

## Full Message Log

Query to reproduce: `python/data/agcom.db` → `SELECT * FROM messages WHERE created_at LIKE '2026-02-21T2%' ORDER BY created_at` (36 messages)

## Bugs Found

### 1. EM sends status messages to runner instead of routing errors to coder
After runner reported mss failure (AttributeError), EM sent "Still working on this - currently with coder" to runner twice. Runner replied "no code found" both times. **4 wasted messages.** EM should immediately route errors to coder.

### 2. EM loses the real error traceback
When EM finally sends to coder, the "Previous work" context includes runner's "No code found" reply (response to EM's status message) instead of the actual traceback (`AttributeError: 'MSS' object has no attribute 'image'`). Coder can't learn from the failure and repeats the same approach.

### 3. Assistant sends duplicate requests
Assistant sent the same screenshot request again as task-2 while task-1 was still in flight. No dedup logic.

### 4. EM doesn't cancel tasks when another succeeds
Task-2 succeeded and was reported to user, but EM kept working task-1 — sent coder's third attempt to runner unnecessarily.

## Key Files to Fix

- `python/assistant/agents/personas.py` — EM persona/system prompt (lines 25-61)
- `python/assistant/agents/` — EM coordination logic (look for message routing, error handling)
- `python/assistant/bot/app.py` — Assistant request dedup

### Where EM Logic Lives

The EM agent's behavior comes from two places:
1. **System prompt** in `personas.py` lines 25-61 — defines the workflow rules ("Runner failed? → Send error to coder")
2. **Message routing code** — look in `python/assistant/agents/` for how EM actually builds and sends messages between agents

### How EM Builds Messages (the "Previous work" pattern)

When EM forwards work between agents, it constructs a message body like:

```
[Task description from user]

Previous work on this task:
[coder]: [full code block from coder's response]
[runner]: [full output/error from runner's response]
```

This is how code gets from coder → EM → runner. The code is NOT in a separate field — it's embedded in the "Previous work" section of the message body. When analyzing messages, you MUST read the full body to see this.

### EM Prompt Key Rules (from personas.py)

- "Coder sent code? → Send to runner (always!)"
- "Runner failed? → Send error to coder to fix, then back to runner"
- "Runner succeeded? → Report to assistant"
- These rules are correct — the bug is in execution, not the prompt

## What Was NOT Broken

- Code forwarding from EM to runner worked correctly (code included in "Previous work" section)
- Coder produced working code (Pillow/ImageGrab succeeded on attempt 2 with `from PIL import ImageGrab`)
- Runner correctly executed code and reported results
- First attempt failed with `mss` library (`AttributeError: 'MSS' object has no attribute 'image'`)
- Second attempt succeeded with `Pillow/ImageGrab`

## Querying the Message Database

### Database Location

- **Path**: `python/data/agcom.db` (NOT `python/agcom.db`)
- Default comes from `agcom_api/main.py` line 43-50: env var `AGCOM_DB_PATH` > agcom config `store` > default `./data/agcom.db`
- Since commands run from `python/`, the relative path resolves to `python/data/agcom.db`

### Tables

- `messages` — columns: `id`, `thread_id`, `created_at`, `from_handle`, `to_handles`, `subject`, `body`, `metadata`
- `threads` — columns: `id`, `created_at`, `subject`, `participants`, `metadata`
- `address_book`, `audit_log`, `schema_metadata`

### Query Tips

```bash
cd python && source .venv/Scripts/activate

# Screenshot task messages (36 messages around 3pm on 2026-02-21)
python -c "
import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')  # REQUIRED on Windows — cp1252 chokes on unicode
conn = sqlite3.connect('data/agcom.db')
for row in conn.execute(\"\"\"
    SELECT created_at, from_handle, to_handles, subject, body
    FROM messages WHERE created_at LIKE '2026-02-21T2%'
    ORDER BY created_at
\"\"\"):
    print(f'--- {row[0]} | {row[1]} -> {row[2]} | {row[3]}')
    print(row[4])  # NEVER truncate body — full text needed for accurate analysis
    print()
"
```

### Critical: Never Truncate Message Bodies

Previous analysis truncated bodies to 250 chars, which cut off the "Previous work" section where EM includes forwarded code. This led to the WRONG conclusion that EM wasn't forwarding code (it was). Always read full bodies.

### Auth Gotcha

- The `em` agent handle is NOT an admin user
- `/api/admin/messages` endpoints require admin privileges and will reject em's token
- Query SQLite directly instead of using admin API endpoints

## Viewer Access

| Viewer | Port | Health Endpoint | Config Endpoint |
|--------|------|-----------------|-----------------|
| python agcom-viewer | 8701 | `/api/health` | `/api/config` |
| emailag agcom-viewer | 8701 | `/health` | different |

- Python viewer JS fetches `/api/config` on load to discover the API URL
- If config fetch fails, `state.apiUrl` becomes `undefined`, causing requests to `POST /undefined/auth/login`
- If viewer acts broken after restart, try hard refresh (Ctrl+Shift+R) — browser caches old JS

## Uncommitted Changes

These files were modified but NOT committed (as of end of 2026-02-21 session):

- `LOG.md` — session entry for 2026-02-21
- `Claude-KB.md` — 3 new lessons learned entries
- `restart-here.md` — this file
- `progress.md` — may have uncommitted edits

Already committed and pushed (`ddbd789`):
- emailag viewer restyle (CSS)
- Python viewer time filter fix (app.js)
- CLAUDE.md, progress.md, emailag/.gitignore

## Other Changes Made This Session

- **emailag viewer restyled**: CRT amber → clean slate dashboard (Source Sans 3, neutral palette). Committed and pushed as `ddbd789`.
- **python viewer time filter bug fixed**: String comparison of timezone formats (`+00:00` vs `Z`) → Date object comparison. Same commit.
- **Docs updated**: CLAUDE.md on-load format, progress.md added chat/emailag.

## Running Processes

When restarting, launch from `python/` dir with its venv:
```bash
cd python && source .venv/Scripts/activate

agcom-api          # Terminal 1 — port 8700
agent-team start   # Terminal 2 — 6 agents (EM, Coder, Runner, Planner, Reviewer, Security)
my-assist          # Terminal 3 — assistant on port 3978/3979
agcom-viewer       # Terminal 4 — web UI on port 8701
```

Verify health: `curl http://localhost:8700/api/health` should return `{"status":"ok"}`
