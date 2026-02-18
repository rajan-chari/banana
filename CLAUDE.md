# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## MANDATORY: On Load (Do This FIRST)

**BEFORE responding to the user's first message**, you MUST complete all of the following steps. Do not skip this. Do not respond to the user until these are done.

1. Read `Claude-KB.md` for troubleshooting knowledge and known issues.
2. Read recent entries in `LOG.md` to understand what was done last.
3. Read `progress.md` to understand current phase, status, and blockers.
4. Check for any `.state.json` or `task_status.json` files that indicate in-progress work.
5. **Greet the user** and report what you found (current phase, last session activity, any anomalies). Then ask what they'd like to do, offering these starting points:

   - **Continue Phase 8** — pick up error handling, logging, docs, or testing tasks
   - **Run tests** — `cd python && source .venv/Scripts/activate && pytest tests/ -v`
   - **Start the assistant** — launch `my-assist` for interactive use
   - **Start the agent team** — spin up agcom-api + agent-team + my-assist (3 terminals)
   - **Check status** — verify venv, dependencies, server health
   - **Troubleshoot** — diagnose a specific issue (check KB first)
   - **New feature / bug fix** — describe what you need

**Why this matters:** The greeting is the user's confirmation that Claude has context. Without it, the user has no way to know if the KB was read, if state files were found, or if Claude understands the project. This has been missed in past sessions on other projects — don't let it happen here.

---

## Self-Improvement Protocol (Continuous, Not Deferred)

Do these **inline as they happen**, not at session end. There is no reliable end-of-session hook, so never defer KB updates to "later" — later may not come.

- **Something failed unexpectedly?** Update `Claude-KB.md` immediately with the error, cause, and fix.
- **A workaround was discovered?** Add it to KB > Lessons Learned right now.
- **CLAUDE.md instructions led you astray?** Fix CLAUDE.md now, or note the gap in KB > Lessons Learned.
- **progress.md drifted from reality?** Flag it and fix it in the same action.
- **Every action gets a LOG.md entry.** Append a dated entry describing what was done. This is non-negotiable.

## Logging Requirement

After every significant step or action, append to `LOG.md` with a dated entry describing what was done. Format: `### YYYY-MM-DD HH:MM — <summary>` followed by bullet points.

## Updating the Knowledge Base

Update `Claude-KB.md` whenever:
- A new error is encountered and resolved
- A workaround is discovered
- A step behaves differently than expected
- A diagnostic command proves useful

Each KB entry should include: the error/symptom, the cause, and the fix.

---

## Environment

- **OS**: Windows 11
- **User's Shell**: PowerShell 7 (for manual commands)
- **Claude Code Bash Tool**: Uses `/usr/bin/bash` (Git Bash/WSL) — use bash syntax, not PowerShell
- **Python**: 3.10+
- **Workspace Root**: `C:\s\projects\work\teams\working\banana` — Claude starts here
- **Python Working Directory**: `python/` — **Run all Python commands from this folder**
- **Virtual Environment**: `python/.venv/` — **ALWAYS activate before running commands**

### Important: Workspace vs Working Directory

- **Workspace root** (`banana/`) contains project docs: `progress.md`, `specs.md`, `CLAUDE.md`, `README.md`
- **Python working directory** (`python/`) contains all code: packages, tests, config, venv
- **When reading docs**: Use full paths like `C:\s\projects\work\teams\working\banana\CLAUDE.md`
- **When running Python**: Always `cd python` first, then activate venv, then run commands
- **Path references in code**: Use relative paths from `python/` (e.g., `./config/`, `./tests/`)

## Working Style Preferences

### Communication
- **Be terse** — Short responses, no fluff. Tables over paragraphs.
- **Don't over-explain** — State what you did, not why it's important.
- **Ask for clarification** — If direction is ambiguous, ask. Don't guess.

### Problem-Solving
- **Evidence over speculation** — Test hypotheses, don't assume. When debugging, create minimal repro cases.
- **Root causes, not symptoms** — Understand *why* before fixing. Push back on assumptions.
- **Quick pivots** — If something's broken (like gpt-5.2), move on. Don't fight lost causes.
- **Simulate before integrating** — Standalone test scripts beat expensive end-to-end cycles.

### Engineering
- **Simplicity wins** — Switching models beats complex workarounds. Working beats elegant.
- **Testability matters** — Invest in tests to avoid manual verification cycles.
- **Verify end-to-end** — Unit tests aren't enough. Check actual behavior.
- **Document learnings** — Capture insights while fresh (like this file).

### Autonomy
- **Take initiative** — Don't wait for permission on obvious next steps.
- **Trust but verify** — Make changes, but confirm they work.
- **Explain "why" when asked** — Ensure understanding, not just compliance.

### Anti-Patterns to Avoid
- Guessing without data
- Over-engineering before validating
- Verbose explanations when a table suffices
- Sunk cost fallacy (defending broken approaches)
- Asking "is this okay?" instead of just doing it

## Repository Overview

This is a **local-first LLM assistant** project with a language-based folder structure. Python code lives in `python/`, containing three packages:
- **agcom**: Multi-agent communication library with email-like messaging
- **agcom_api**: REST API server exposing agcom via HTTP
- **assistant**: LLM assistant with script-to-tool promotion capabilities

**Current Status**: Phase 7 Complete (Multi-Agent Team)

## Workspace Structure

```
banana/
├── CLAUDE.md           # This file - AI guidance + workflow
├── README.md           # Project overview
├── progress.md         # Status tracker + session logs
├── specs.md            # Requirements (source of truth)
└── python/             # All Python code
    ├── agcom/          # Agent communication library
    │   ├── console/    # CLI interface (__main__.py, cli.py, commands.py, etc.)
    │   ├── tests/      # Test suite
    │   ├── models.py   # Data models
    │   ├── session.py  # Session management
    │   ├── storage.py  # SQLite storage layer
    │   └── validation.py # Input validation
    ├── agcom_api/      # REST API server (FastAPI)
    │   ├── models/     # Request/response models
    │   ├── routers/    # API endpoints (auth, messages, threads, contacts, audit, health)
    │   ├── auth.py     # Authentication logic
    │   ├── dependencies.py # FastAPI dependencies
    │   └── main.py     # API entrypoint
    ├── assistant/      # LLM assistant package
    │   ├── agcom/      # agcom REST client integration
    │   │   ├── client.py  # Async REST client (24 methods)
    │   │   ├── tools.py   # LLM tools (6 tools)
    │   │   └── config.py  # Client configuration
    │   ├── agents/     # Multi-agent team system
    │   │   ├── base.py       # BaseAgent class (LLM + agcom + polling)
    │   │   ├── personas.py   # System prompts for each role
    │   │   ├── em.py         # Engineering Manager (coordinator)
    │   │   ├── coder.py      # Code generation
    │   │   ├── runner.py     # Code execution
    │   │   ├── planner.py    # Task decomposition
    │   │   ├── reviewer.py   # Code review
    │   │   ├── security.py   # Security analysis
    │   │   ├── orchestrator.py # Team lifecycle management
    │   │   ├── delegation.py # Assistant → EM delegation
    │   │   └── cli.py        # agent-team CLI
    │   ├── bot/        # Teams bot integration
    │   ├── config/     # Config parser
    │   ├── llm/        # LLM client (PydanticAI)
    │   ├── permissions/# Permission system with audit
    │   ├── scripts/    # Script generation & execution
    │   ├── tools/      # Tool registry, storage, promoter, executor
    │   └── main.py     # Assistant entrypoint
    ├── config/         # Configuration files (assistant.sample.md)
    ├── tests/          # Integration tests
    ├── data/           # Data files
    ├── appPackage/     # Teams app package (manifest.json)
    └── pyproject.toml  # Python project config
```

## Workflow

1. **Check progress** — Read [progress.md](progress.md) for current phase, status, blockers
2. **Do the work** — Implement next incomplete task
3. **Update progress** — Mark complete with timestamp and notes
4. **Parallel agents** — Launch multiple agents for independent work (cost not a concern)

**File Roles:**
- `CLAUDE.md` — AI instructions (how to work here)
- `Claude-KB.md` — Knowledge base (errors, gotchas, diagnostics, lessons learned)
- `LOG.md` — Chronological action log (append after every significant step)
- `progress.md` — Status tracker with phase tables and session logs
- `specs.md` — Source of truth for requirements (don't modify unless requirements change)
- `README.md` — Human-readable project overview

## Python Packages

### agcom
**Purpose:** Multi-agent communication system with email-like messaging, threading, and address book
**Tech Stack:** Python 3.10+, SQLite
**Location:** `python/agcom/`
**CLI:** Full-featured console interface with numbered indices and smart formatting
**Quick Start:** `agcom init --store db.db --me alice`
**Status:** Complete standalone package

### agcom_api
**Purpose:** REST API server exposing agcom functionality via HTTP
**Tech Stack:** Python 3.10+, FastAPI, Pydantic
**Location:** `python/agcom_api/`
**Endpoints:** 28 endpoints across 6 routers (auth, messages, threads, contacts, audit, health)
**Quick Start:** `agcom-api` (starts server on port 8000)
**Docs:** OpenAPI at `/docs`, ReDoc at `/redoc`
**Status:** Complete with session-based authentication

### assistant
**Purpose:** Local-first LLM assistant with script-to-tool promotion
**Tech Stack:** Python 3.10+, Teams SDK (DevTools), PydanticAI
**Location:** `python/assistant/`
**Current Features:**
- ✅ Teams bot with DevTools interface (bot/app.py)
- ✅ Multi-provider LLM support (OpenAI, Azure, Anthropic, Ollama, Groq)
- ✅ Script generation and local execution with sandboxing
- ✅ Permission system with audit logging (AST-based code analysis)
- ✅ Tool registry, storage, promoter, executor (tools/)
- ✅ **agcom integration**: REST API client + 6 LLM tools + 7 slash commands
- ✅ **LLM tool bridge**: PydanticAI integration via tool_bridge.py
- ✅ **Multi-agent team**: EM coordinates coder/runner/planner/reviewer/security
**Config:** Markdown-based natural language config + environment variables
**Architecture:** bot → llm → scripts/tools → permissions → audit → agcom

### agents (part of assistant)
**Purpose:** Multi-agent team coordinated by Engineering Manager
**Location:** `python/assistant/agents/`
**Quick Start:**
```bash
agcom-api              # Start messaging backend (port 8700)
agent-team start       # Start all 6 agents
my-assist              # Start assistant (delegates to team)
```
**Agents:**
| Agent | Handle | Role |
|-------|--------|------|
| EM | `em` | Coordinates team, routes tasks, checks quality |
| Coder | `coder` | Writes Python code |
| Runner | `runner` | Executes code, reports output |
| Planner | `planner` | Breaks down complex tasks |
| Reviewer | `reviewer` | Reviews code for bugs |
| Security | `security` | Checks for security issues |

**Flow:** User → Assistant → EM → Coder → Runner → EM → User
**Design:** LLM-driven decisions, minimal control structures, natural language coordination

## Quick Commands

### For Claude (Bash tool — uses bash syntax)

```bash
# Python commands - activate venv first
cd python && source .venv/Scripts/activate && pytest tests/ -v
cd python && source .venv/Scripts/activate && my-assist

# Agent team (requires agcom-api running)
cd python && source .venv/Scripts/activate && agcom-api  # Terminal 1
cd python && source .venv/Scripts/activate && agent-team start  # Terminal 2
cd python && source .venv/Scripts/activate && my-assist  # Terminal 3

# Reading docs - use full paths or relative
cat progress.md
cat ../progress.md  # from python/
```

### For User (PowerShell — manual terminal)

```powershell
cd python
.\.venv\Scripts\Activate.ps1
my-assist
pytest tests/ -v
```

### Setup (one-time)

```bash
cd python && python -m venv .venv && source .venv/Scripts/activate && pip install -e ".[dev]"
```

## Guidelines

### Key Principles
- **Specs are source of truth** - Check specs.md for requirements, never modify unless requirements change
- **Python code in python/** - All code lives under the python/ directory
- **Local-first design** - Assistant runs entirely on user's machine, no cloud dependencies
- **Safety first** - Permission system gates all sensitive operations

### Architecture Notes
- **LLM Layer**: PydanticAI with structured outputs (AssistantResponse model)
- **Execution**: Subprocess isolation with timeout, output truncation, working directory control
- **Permissions**: AST analysis + pattern matching, development mode auto-approves
- **Config Priority**: Environment variables > Markdown config > Defaults
- **Tool Storage**: Hybrid approach (SQLite metadata + file-based scripts) - aligns with agcom pattern
- **agcom Integration**: REST API client with async methods, retry logic, auto-login, 24 methods
- **agcom Tools**: 6 tools registered (send, list messages, list threads, search, contacts, reply)
- **agcom Commands**: 7 slash commands for bot (/agcom-send, /agcom-inbox, /agcom-threads, etc.)
- **Data Flow**: User message → LLM → Permission check → Script generation → Execution → Audit
- **Multi-Agent Flow**: User → Assistant → EM → Team (Coder/Runner/etc) → EM → User
- **Agent Design**: Natural LLM prompts, minimal if/else, trust the model's judgment

### Implementation Gaps
1. **Permission UX**: Confirmation flow for ASK-level permissions not yet implemented

## Gotchas & Knowledge Base

All gotchas, error resolutions, lessons learned, and diagnostic commands live in `Claude-KB.md`. Check there first when something goes wrong. Update it immediately when something new is discovered.
