# Claude Knowledge Base — Banana (Local-First LLM Assistant)

Living reference for Claude Code sessions. Update this file whenever a new error is encountered and resolved, a workaround is discovered, or a step behaves differently than expected.

## Prerequisite Checks

Run these to verify the environment is ready. If any fail, see the fix column.

| Check | Command | Expected | Fix |
|-------|---------|----------|-----|
| Python | `python --version` | 3.10+ | Install Python 3.10+ |
| Venv exists | `ls python/.venv/Scripts/activate` | File exists | `cd python && python -m venv .venv` |
| Packages installed | `cd python && source .venv/Scripts/activate && pip show microsoft-teams-ai` | Shows version | `cd python && source .venv/Scripts/activate && pip install -e ".[dev]"` |
| agcom CLI | `cd python && source .venv/Scripts/activate && agcom --help` | Shows usage | Re-install: `pip install -e ".[dev]"` |
| agcom-api server | `curl http://localhost:8700/api/health` | `{"status":"ok"}` | Start: `cd python && source .venv/Scripts/activate && agcom-api` |
| assistant | `cd python && source .venv/Scripts/activate && my-assist --help` | Shows usage | Re-install: `pip install -e ".[dev]"` |
| agent-team CLI | `cd python && source .venv/Scripts/activate && agent-team --help` | Shows usage | Re-install: `pip install -e ".[dev]"` |

## Error Messages

Keyed by error text for searchability. Add new entries as they're encountered.

### GPT-5.2 infinite tool call loops

- **When:** Using GPT-5.2 with structured output + tools via PydanticAI
- **Cause:** GPT-5.2 has a known bug with structured output combined with tool calls — enters infinite loop
- **Fix:** Switch to GPT-5.1, GPT-4o, or o3-mini. Don't fight this — it's an upstream issue.

### "Tool execution failed: ..." causes LLM retry loops

- **When:** A tool returns an error string starting with "Tool execution failed"
- **Cause:** LLMs interpret vague error messages as transient and retry. A short error string gives the LLM no signal that the failure is permanent.
- **Fix:** Return full tracebacks with clear permanent error indicators. The LLM will stop retrying when it sees the error is structural, not transient.

### `.env` changes not visible to parent process

- **When:** A tool modifies `.env` in a subprocess, but the assistant doesn't see the new values
- **Cause:** Tools run in subprocesses. Environment changes in a child process don't propagate to the parent.
- **Fix:** After `.env` is modified, the parent process must call `load_dotenv(override=True)` to reload.

### Stale connections after DB deletion

- **When:** Deleting a SQLite database file while agcom-api is running, then operations fail
- **Cause:** The server holds open connections to the old database file
- **Fix:** Restart the server after deleting/recreating the database.

### Unit tests pass but integration is broken

- **When:** Individual functions work but the composed pipeline fails
- **Cause:** Orchestration wiring bug — the conditional that connects function A's output to function B's input is wrong
- **Fix:** Test the composition explicitly. Check that `if helper_returns_true(): do_important_thing()` actually triggers when expected. See session log 2026-01-26.

## Diagnostic Commands

```bash
# Activate venv (required before all commands)
cd python && source .venv/Scripts/activate

# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_agcom_api.py -v

# Check agcom-api health
curl http://localhost:8700/api/health

# Inspect SQLite database
python query_db.py "SELECT * FROM messages LIMIT 5"

# Check installed packages
pip list | grep -i teams

# Start agcom-api server
agcom-api

# Start agent team (requires agcom-api running)
agent-team start

# Start assistant
my-assist
```

## Gotchas

### Environment
- **Workspace root vs Python dir**: Docs (`CLAUDE.md`, `progress.md`, `specs.md`) are in `banana/`. All code is in `banana/python/`. Always `cd python` before running Python commands.
- **Venv activation is mandatory**: Every bash session must `source .venv/Scripts/activate` before running any Python command. Forgetting this causes `ModuleNotFoundError`.
- **Claude Code Bash tool uses Git Bash, not PowerShell**: Write bash syntax, not PowerShell. The user's terminal is PowerShell, but Claude's Bash tool is `/usr/bin/bash`.
- **`.claude/settings.local.json` is user-specific**: Already in `.gitignore`. Never commit it.
- **agcom-api default port is 8700**: Not 8000. Check `python/agcom_api/main.py` if unsure.
- **Config priority**: Environment variables > Markdown config > Defaults. Don't set values in markdown config if env vars are already set.
- **`query_db.py` helper**: Use `python query_db.py "SELECT * FROM table"` to inspect SQLite databases.

### Code Style
- **Check-then-act, not try-catch for flow control**: Project style prefers `if not exists(): create()` over `try: create() except AlreadyExists: pass`.
- **Initialize resources at startup**: Databases, connections, etc. — fail fast on config errors.

### LLM & PydanticAI
- **PydanticAI Agent.override() doesn't support system_prompt**: Use message prefix `[CONTEXT: ...]` prepended to user message instead.
- **UsageLimits are essential**: Always set `UsageLimits(tool_calls_limit=5)` when calling PydanticAI agents to prevent runaway loops.
- **Simulate before integrating**: Create standalone test scripts that call the LLM directly. Much faster and cheaper than full bot test cycles.
- **Mock tools first**: Use simple async functions returning canned responses to isolate LLM behavior from tool execution issues.
- **Log tool calls and results**: Add logging in tool_bridge.py to see exactly what the LLM sends and receives.

### Multi-Agent
- **Loop prevention**: Only hard rule — don't delegate back to whoever just responded. EM must enforce this.
- **Runner validates code before execution**: Uses LLM to extract/clean code, then `ast.parse()` for syntax check before running.
- **Trust the LLM**: Use natural prompts, not rigid control structures. Let the model decide routing/completion.
- **Check quality at coordinator**: EM should verify results make sense, not just pass through.
- **Clear failure signals**: `task_complete=False` tells coordinator to retry/reroute, not just report the error.

### Documentation
- **No status snapshot files**: Don't create `*_COMPLETE.md` — put completion info in `progress.md` session logs.
- **Consolidate aggressively**: Fewer files = less drift, easier maintenance.

### SQLite Performance
- **Write throughput**: ~24.5 messages/second sequential (tested with 50 messages).
- **Concurrent reads**: 15+ simultaneous reads, no blocking (WAL mode).
- **Single writer at a time**: SQLite architecture constraint. Writers serialized by `BEGIN IMMEDIATE`.
- **Key settings**: `PRAGMA journal_mode=WAL`, `PRAGMA busy_timeout=5000`, `PRAGMA foreign_keys=ON`.
- **Connection per request**: Avoids connection sharing issues in FastAPI.
- **Write queue not needed**: Prototyped (`agcom_api/write_queue.py`) but SQLite+WAL handles current load. Code exists but is commented out in `main.py`.

## Lessons Learned

Add entries here as sessions uncover new knowledge. Format: `- **YYYY-MM-DD:** <what was learned>`

- **2026-01-26:** Unit tests can pass while integration wiring is broken. The bug was in `app.py`'s orchestration — `register_assistant_in_backend()` was only called when `try_register_agcom_tools_if_configured()` returned True, but tools loaded from storage return False. Fix: call registration unconditionally when identity is newly configured. Lesson: test the composition, not just the parts.
- **2026-01-25:** PydanticAI 1.46 changed API surface for config. Fixed in `assistant/llm/config.py`. Lesson: pin versions or check changelogs before upgrading.
- **2026-01-27:** Multi-agent design works best with natural LLM prompts and minimal control structures. Rigid if/else routing is fragile. Trust the model's judgment for routing decisions. Only hard rule needed: prevent delegation loops.
- **2026-01-27:** Runner agent should validate code syntax with `ast.parse()` before execution. LLM-extracted code sometimes has markdown artifacts or truncation issues. Catching these before subprocess execution gives clearer error messages.
- **2026-02-18:** Added session management system (CLAUDE.md on-load section, Claude-KB.md, LOG.md). Pattern adapted from fellow_scholars/teams-e2e project. Key insight from that project: on-load instructions must be the very first section in CLAUDE.md or they get skipped. Self-improvement must be continuous (inline), not deferred to end-of-session.
