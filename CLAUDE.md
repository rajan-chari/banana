# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## On Load (Do This FIRST)

Before responding to the user's first message:

1. Read `Claude-KB.md`, recent `LOG.md` entries, and `progress.md`.
2. Greet the user with a project summary table and current status. Ask what they'd like to do.

---

## Self-Improvement (Inline, Never Deferred)

Do these **as they happen** — there is no end-of-session hook, so never defer to "later."

- **Errors, workarounds, gotchas** → update `Claude-KB.md` immediately.
- **Instructions wrong or drifted** → fix `CLAUDE.md` or `progress.md` now.
- **Every significant action** → append to `LOG.md` (`### YYYY-MM-DD HH:MM — <summary>`).

---

## Environment

- **OS**: Windows 11
- **User's Shell**: PowerShell 7 (for manual commands)
- **Claude Code Bash Tool**: Uses `/usr/bin/bash` (Git Bash/WSL) — use bash syntax, not PowerShell
- **Python**: 3.10+
- **Workspace Root**: `C:\s\projects\work\teams\working\banana` — Claude starts here
- **Python Working Directory**: `python/` — **Run all Python commands from this folder**
- **Virtual Environment**: `python/.venv/` — **ALWAYS activate before running commands**


## Working Style

- **Be terse** — tables over paragraphs, state what you did, not why it's important.
- **Ask, don't guess** — if direction is ambiguous, ask for clarification.
- **Evidence over speculation** — test hypotheses, create minimal repro cases.
- **Root causes, not symptoms** — understand *why* before fixing.
- **Quick pivots** — if something's broken, move on. Don't fight lost causes.
- **Simplicity wins** — working beats elegant. Don't over-engineer.
- **Verify end-to-end** — unit tests aren't enough. Check actual behavior.
- **Take initiative** — don't wait for permission on obvious next steps.

## Repository Structure

Three independent projects. `emailag/` intentionally duplicates `python/agcom*` as a fresh reimplementation.

```
banana/
├── CLAUDE.md, Claude-KB.md, LOG.md, progress.md, specs.md
├── python/             # LLM Assistant
│   ├── agcom/          # Agent communication library
│   ├── agcom_api/      # REST API server (FastAPI)
│   ├── agcom_viewer/   # Web viewer
│   ├── assistant/      # LLM assistant (bot, agents, llm, tools, permissions, scripts)
│   └── tests/
├── chat/               # Chat server + UI
│   ├── app/client/     # React 18 frontend
│   └── app/server/     # FastAPI backend
└── emailag/            # agcom reimplementation
    ├── agcom/, agcom_api/, agcom_viewer/, tests/
```

## Quick Commands

```bash
# Always activate venv first
cd python && source .venv/Scripts/activate

# Tests
pytest tests/ -v

# Agent team (3 terminals)
agcom-api              # Terminal 1 — messaging backend (port 8700)
agent-team start       # Terminal 2 — all 6 agents
my-assist              # Terminal 3 — assistant

# Setup (one-time)
cd python && python -m venv .venv && source .venv/Scripts/activate && pip install -e ".[dev]"
```

**Agents:** EM (coordinator), Coder, Runner, Planner, Reviewer, Security
**Flow:** User → Assistant → EM → Team → EM → User

## Notes

- **`specs.md` is source of truth** for requirements — don't modify unless requirements change.
- **Config priority**: Environment variables > Markdown config > Defaults.
