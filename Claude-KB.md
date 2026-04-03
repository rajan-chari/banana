# Claude Knowledge Base — Banana

Living reference for Claude Code sessions. Update when you discover, decide, or question something a fresh session would need.

## Prerequisite Checks

| Check | Command | Expected | Fix |
|-------|---------|----------|-----|
| Python | `python --version` | 3.10+ | Install Python 3.10+ |
| Venv exists | `ls python/.venv/Scripts/activate` | File exists | `cd python && python -m venv .venv` |
| Packages installed | `cd python && source .venv/Scripts/activate && pip show microsoft-teams-ai` | Shows version | `pip install -e ".[dev]"` |
| agcom-api server | `curl http://localhost:8700/api/health` | `{"status":"ok"}` | Start: `agcom-api` |

## Diagnostic Commands

```bash
cd python && source .venv/Scripts/activate
pytest tests/ -v                    # all tests
agcom-api                           # messaging backend (:8700)
agent-team start                    # 6 agents
my-assist                           # assistant CLI
python query_db.py "SELECT ..."     # inspect SQLite
```

## Lessons Learned

- **2026-01-26:** Unit tests can pass while integration wiring is broken. Bug was in `app.py` orchestration — `register_assistant_in_backend()` only called when tools returned True. Lesson: test the composition, not just the parts.
- **2026-01-25:** PydanticAI 1.46 changed API surface. Pin versions or check changelogs before upgrading.
- **2026-01-27:** Multi-agent design works best with natural LLM prompts, not rigid if/else routing. Only hard rule: prevent delegation loops.
- **2026-02-18:** On-load instructions must be the very first section in CLAUDE.md or they get skipped.
- **2026-02-21:** EM loses error context in coder→runner→coder loops — forwards "no code found" instead of the actual traceback. Fix: on runner failure, immediately route to coder with full error.
- **2026-02-21:** ISO timestamp string comparison is unreliable (`+00:00` vs `.000Z`). Always compare `new Date()` objects.
- **2026-02-21:** Never truncate agent message bodies when debugging. Truncation led to wrong conclusion about EM forwarding.
- **2026-02-21:** Coordinator agents must always return None from team response handlers — a fallthrough `return response` creates noise messages.
- **2026-03-25:** emcom `--cc` flag doesn't accept comma-separated lists. Send separately.
- **2026-03-25:** Skills `rc-session-save` and `rc-greet-save` fail with `disable-model-invocation`. Only `rc-save` works.
- **2026-03-28:** skl2onnx doesn't support `TfidfVectorizer(analyzer='char_wb')` — only `'word'`. Accuracy impact minimal.
- **2026-04-01:** Status bar hook doesn't work with multiple pty-win instances — POST goes to one hardcoded port. Regex scraping works per-instance.
- **2026-04-01:** Claude Code exit summary only prints if hasConsoleBillingAccess() (API users, not subscribers).
- **2026-04-02:** UI border color alone can't create pane separation on dark backgrounds — gray just looks like a lighter background. Need three things together: physical gap (gutter), distinct hue (steel-blue #3d5a6a, not gray), and sufficient width (2px). Topbar dimming (bg + text muting) is more effective than border tweaks for focus distinction.
- **2026-04-02:** emcom threading already exists (emcom thread <id>, emcom threads) — check existing features before listing them as missing in feedback. Use `emcom --help` or ask frost before assuming a gap.
- **2026-04-02:** Permission prompt issues are systemic, not per-agent. Fixing the rc-save SKILL.md (shared by all agents) is more effective than messaging agents individually. Fix the template/skill, not the symptom.

## Decisions

- **2026-04-01:** Chose regex scraping over status bar JSON hook for cost tracking because Rajan runs multiple pty-win instances on different ports. Hook required hardcoded port routing; regex scrapes each instance's own PTY streams with no cross-instance coordination.
- **2026-04-01:** Chose to revert hook machinery entirely (removed endpoint, hookData, settings.local.json write) rather than keeping it as a fallback. Simpler to maintain one approach than two parallel paths.
- **2026-03-31:** Chose to copy pty-win dist/ directly into fellow-agents rather than using git submodules. Self-contained repo is simpler for a "clone and go" experience.

## Facts

- **Claude Code statusLine** is user-configurable via `settings.statusLine.command`. Receives JSON on stdin with cost, model, tokens, rate limits. Settings priority: userSettings > projectSettings > localSettings.
- **Claude Code cost persistence**: `~/.claude.json` keyed by project path. Keys: lastCost (float), lastTotalInputTokens, lastTotalOutputTokens, lastModelUsage, lastSessionId. --resume adds previous cost to running total (matched by sessionId).
- **cost.total_duration_ms** = wall-clock time since session start. total_api_duration_ms = cumulative API wait time (with retries). Difference = idle + tool execution + local processing.
- **formatCost()**: cost > $0.50 → 2 decimal places, cost ≤ $0.50 → 4 decimal places.
- **emcom binaries**: emcom.exe is C# AOT native (5.8MB), emcom-server.exe is Python/PyInstaller (27MB), emcom-tui.exe is Python/PyInstaller (22MB). All in `~/.claude/skills/emcom/bin/`.
- **Chrome DevTools MCP ports**: 3600 = Rajan's session, 3601 = milo's session. MCP goes stale after session restart.
- **emcom usernames are case-sensitive**: `--to rajan` fails, `--to Rajan` works.
- **httpx + localhost on Windows**: ~2s penalty per request due to IPv6 DNS. Use `127.0.0.1` instead.
- **agcom-api port is 8700**, emcom-server port is 8800.
- **SQLite**: ~24.5 msg/s write, 15+ concurrent reads (WAL mode). Write queue not needed at current load.
- **Claude Code PID file**: `~/.claude/sessions/<pid>.json` updated on every state transition. Contains `status: 'idle'|'busy'|'waiting'` + `waitingFor` detail. File-watchable via `fs.watch`. This is what `claude ps` uses. More reliable than any heuristic for idle detection.
- **Claude Code sessionStatus**: Explicit state machine — `idle` (waiting for input), `busy` (API streaming / tool execution), `waiting` (permission prompt / elicitation dialog). Computed in REPL.tsx.
- **Claude Code Notification hook**: Fires on `idle_prompt` (60s after query completion), `permission_prompt` (6s after render), `elicitation_dialog` (6s). Hook stdin JSON includes `notification_type` field. Idle timeout configurable via `messageIdleNotifThresholdMs` in config.
- **Claude Code idle-return dialog**: Triggers on user input submission (not timer) when idle > 75min AND > 100K tokens. Configurable via env: `CLAUDE_CODE_IDLE_THRESHOLD_MINUTES`, `CLAUDE_CODE_IDLE_TOKEN_THRESHOLD`.

## Open Questions

- **PID file idle detection for pty-win/pty-cld**: Blocked — BG_SESSIONS feature flag is OFF in current Claude Code builds (compile-time, not toggleable). PID files exist but lack status/waitingFor fields. When Anthropic ships BG_SESSIONS, add `fs.watch` on `~/.claude/sessions/<pid>.json`. Detection: if any PID file has `status` field, the flag is on. Until then, heuristics work fine.
- **Detach/reattach**: Rajan ideated closing a pane but keeping the PTY alive, then reattaching (browser or pty-cld). Architecture sketched (pty-win as process manager, multiple viewers via WebSocket) but not confirmed for implementation.
- **pty-cld force-idle subcommand**: Rajan expressed interest but hasn't confirmed. Would read .pty-cld-port from CWD and POST /idle.
- **EM coordination efficiency**: 5 bugs fixed (2026-02-21) but not re-tested end-to-end. Target: 36 msgs → ~8-10 for a simple task.
- **fellow-agents end-to-end test**: Built and pushed but nobody has run `./start.ps1` from a fresh clone yet.
