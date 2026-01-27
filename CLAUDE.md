# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

- **OS**: Windows 11
- **Shell**: PowerShell 7 (`C:\Program Files\PowerShell\7\pwsh.exe`)
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

This is a **local-first LLM assistant** project with a language-based folder structure. Python code lives in `python/`, containing two packages:
- **agcom**: Multi-agent communication library with email-like messaging
- **assistant**: LLM assistant with script-to-tool promotion capabilities

**Current Status**: Phase 5 Complete (Tool Registration) | Phase 6 In Progress (agcom Integration - 3/5 tasks)

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
- `specs.md` — Source of truth for requirements (don't modify unless requirements change)
- `progress.md` — Status tracker with phase tables and session logs
- `CLAUDE.md` — This file (AI guidance)

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
- ❌ **Critical Gap**: LLM cannot auto-invoke tools (needs bridge to PydanticAI)
**Config:** Markdown-based natural language config + environment variables
**Architecture:** bot → llm → scripts/tools → permissions → audit → agcom

## Quick Commands

**CRITICAL WORKFLOW**: Since you often run Python modules from `python/` subfolder:

1. **For Python commands** - Always navigate to `python/` first:
```powershell
# From workspace root (banana/)
cd python
.\.venv\Scripts\Activate.ps1  # Activate venv
my-assist                       # Run commands
cd ..                           # Return to root when done
```

2. **For reading project docs** - Use full paths or relative from root:
```powershell
# From workspace root (banana/):
cat progress.md
cat specs.md

# From python/ subdirectory:
cat ../progress.md
```

### Python Setup & Commands

**Setup (one-time only):**
```powershell
cd python
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

**Daily workflow (every terminal session):**
```powershell
cd python                       # Navigate to Python working directory
.\.venv\Scripts\Activate.ps1   # Activate venv (prompt shows (.venv))
my-assist                       # Run assistant
agcom init --store db.db --me alice  # Initialize CLI
agcom-api                       # Start REST API server
pytest tests/ -v                # Run tests
```

**Bash tool usage:**
- When using Bash tool for Python commands, always include `cd python` or use full paths
- Example: `cd python && .\.venv\Scripts\Activate.ps1 && pytest tests/ -v`
- Or use working_directory parameter if available

**Note**: Use `.\.venv\Scripts\Activate.ps1` (not `source` or `activate.bat`) in PowerShell.

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
- **Multi-Agent Flow**: User message → agcom client → REST API → agcom backend → messaging system

### Critical Implementation Gaps
1. **Phase 5.4**: LLM tool invocation bridge - tools exist but LLM can't discover/call them
2. **Phase 6.5**: Documentation for agcom integration (in progress)
3. **Permission UX**: Confirmation flow for ASK-level permissions not yet implemented

## Gotchas & Lessons Learned

### Integration Bugs Hide in Orchestration
- **Unit tests can pass while integration is broken** — Each function works correctly in isolation, but the wiring between them can be wrong
- **Test the composition**: When function A's result controls whether function B runs, test that orchestration explicitly
- **Conditionals are risky**: `if helper_returns_true(): do_important_thing()` — what if the helper legitimately returns False but the important thing should still happen?

### Environment & Subprocesses
- **Tools run in subprocesses**: When a tool modifies `.env`, the parent process must call `load_dotenv(override=True)` to see changes
- **`query_db.py` helper**: Use `python query_db.py "SELECT * FROM table"` to inspect SQLite databases
- **Restart servers after DB cleanup**: Deleting a database while a server runs leaves stale connections

### Code Style Preferences
- **Check-then-act over try-catch for flow control**: Prefer `if not exists(): create()` over `try: create() except AlreadyExists: pass`
- **Initialize resources at startup**: Databases, connections, etc. — fail fast on config errors

### Documentation Hygiene
- **No status snapshot files**: Don't create `*_COMPLETE.md` — put completion info in `progress.md` session logs
- **Consolidate aggressively**: Fewer files = less drift, easier maintenance
- **Root docs**: `CLAUDE.md` (AI), `README.md` (humans), `progress.md` (status), `specs.md` (requirements)

### LLM & PydanticAI
- **GPT-5.2 is broken with structured output + tools**: Causes infinite tool call loops. Use GPT-5.1, GPT-4o, or o3-mini instead
- **Always set UsageLimits**: `UsageLimits(tool_calls_limit=5)` prevents runaway loops from burning API credits
- **LLMs retry on error strings**: Returning "Tool execution failed: ..." makes the LLM retry. A full traceback with a clear permanent error stops it faster
- **Identity via message prefix**: PydanticAI's `Agent.override()` doesn't support `system_prompt`, but prepending `[CONTEXT: ...]` to the user message works

### Debugging LLM Issues
- **Simulate before integrating**: Create standalone test scripts that call the LLM directly (see `python/scripts/debug_*.py`). Much faster and cheaper than full bot test cycles
- **Mock tools first**: Use simple async functions returning canned responses to isolate LLM behavior from tool execution issues
- **Log tool calls and results**: Add logging in tool_bridge.py to see exactly what the LLM sends and receives
