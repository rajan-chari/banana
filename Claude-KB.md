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
- **`os.kill(pid, 0)` doesn't work on Windows**: Always returns `OSError`, even for running processes. Use `tasklist /FI "PID eq {pid}"` instead. See `cli.py:_is_process_running()`.
- **Workspace root vs Python dir**: Docs (`CLAUDE.md`, `progress.md`, `specs.md`) are in `banana/`. All code is in `banana/python/`. Always `cd python` before running Python commands.
- **Venv activation is mandatory**: Every bash session must `source .venv/Scripts/activate` before running any Python command. Forgetting this causes `ModuleNotFoundError`.
- **Claude Code Bash tool uses Git Bash, not PowerShell**: Write bash syntax, not PowerShell. The user's terminal is PowerShell, but Claude's Bash tool is `/usr/bin/bash`.
- **`.claude/settings.local.json` is user-specific**: Already in `.gitignore`. Never commit it.
- **agcom-api default port is 8700**: Not 8000. Check `python/agcom_api/main.py` if unsure.
- **Config priority**: Environment variables > Markdown config > Defaults. Don't set values in markdown config if env vars are already set.
- **`query_db.py` helper**: Use `python query_db.py "SELECT * FROM table"` to inspect SQLite databases.
- **httpx + localhost on Windows is slow (~2s per request)**: httpx tries IPv6 DNS for "localhost" first. Use `127.0.0.1` instead. This applies to any httpx client, not just emcom.
- **emcom-server port is 8800**: Data in `~/.emcom/`. Start: `source emcom/.venv/Scripts/activate && emcom-server`.
- **emcom identity is CWD-based**: `identity.json` lives in the working directory. Each agent folder gets its own identity — don't use `--identity` to point at another folder's file.
- **argparse global flags before subcommand**: `emcom --identity foo.json inbox` works; `emcom inbox --identity foo.json` fails. Global args are on the main parser, not subparsers.
- **PyInstaller --onefile for emcom**: `pyinstaller --onefile --name emcom --console emcom/cli.py` produces a ~12M standalone exe. Clean up `dist/`, `build/`, `*.spec` after. User skill exes live at `~/.claude/skills/emcom/bin/`.
- **SKILL.md must be explicit about autonomy**: Claude will ask the user to pick names, confirm actions, etc. unless SKILL.md says "choose yourself, don't ask". Be directive.

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

### Testing Agents
- **`AgentTestHarness`** (`tests/agent_harness.py`): Creates real agent instances with real LLM calls, stubs only `_client` (agcom transport). Call `inject()` to feed messages directly to `process_message()` — no server needed.
- **LLM judge for semantic assertions**: `judge(response_text, criterion)` uses gpt-5.1 to evaluate natural language responses. Use for content quality; use structural assertions for deterministic fields (`result is None`, `task.status == "completed"`).
- **LLM judge can be overly strict**: If the judge returns False on reasonable responses, switch to deterministic keyword checks. The `test_runner_status_update` test hit this — Runner's system prompt influences LLM to echo "no executable code found" even through the fix-5 fallback path, which confused the judge.
- **Runner system prompt tension**: The system prompt says `report: "No executable code found - received description only."` but fix 5 in `process_message` routes non-code messages to the LLM for contextual responses. The LLM still echoes the system prompt's canned phrasing. If this matters, update the system prompt to remove the canned response template.

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
- **2026-02-21:** EM agent loses error context during coder→runner→coder loops. When runner fails, EM sends status messages to runner instead of immediately routing the error to coder. Then EM's "Previous work" context includes runner's "no code found" reply (to the status message) instead of the actual traceback. Coder can't learn from the failure and repeats the same approach. Fix needed: on runner failure, immediately route to coder with the full error traceback.
- **2026-02-21:** ISO timestamp string comparison is unreliable across formats. API returns `+00:00`, JS `toISOString()` returns `.000Z`. ASCII value of `+` (43) < `.` (46) so string comparison silently filters out all matches. Always compare `new Date()` objects, never raw ISO strings.
- **2026-02-21:** When analyzing agent message logs, never truncate message bodies. Truncation led to a wrong conclusion that EM wasn't forwarding code to runner (it was — the code was in a "Previous work" section past the truncation point). Read full data before drawing conclusions.
- **2026-02-21:** Base agent's `_handle_message` sends any non-None return from `process_message` back to the sender. Coordinator agents like EM must ALWAYS return None from team response handlers — all communication goes through explicit `_delegate_task`/`_report_completion`/`_send_progress_update`. A fallthrough `return response` creates noise messages to team members.
- **2026-02-21:** Store agent results as lists (append), not single values (overwrite). When runner sends noise replies, the real error traceback gets lost if results is `dict[str, str]`. Changed to `dict[str, list[str]]` and use `[-1]` for latest.
