# Session Log

Chronological record of Claude Code session actions. Append new entries at the bottom.

---

### 2026-02-18 — Session management system created

- Added mandatory on-load section to top of `CLAUDE.md` (read KB, check state, read log, greet user)
- Added self-improvement protocol to `CLAUDE.md` (continuous/inline updates, not deferred)
- Added logging requirement to `CLAUDE.md` (every action gets a dated LOG.md entry)
- Created `Claude-KB.md` with:
  - Prerequisite checks table (Python, venv, packages, servers)
  - 5 error message entries (GPT-5.2 loops, tool errors, .env visibility, stale DB, integration bugs)
  - Diagnostic commands section
  - 12 gotchas extracted from existing CLAUDE.md and project docs
  - 5 lessons learned entries from session logs
- Created `LOG.md` (this file)
- Pattern adapted from `fellow_scholars/teams-e2e` project

### 2026-02-18 — Md file restructuring (14 → 10 files, ~1700 lines removed)

- **CLAUDE.md**: Removed "Gotchas & Lessons Learned" section (moved to Claude-KB.md). CLAUDE.md is now instructions-only.
- **Claude-KB.md**: Absorbed gotchas from CLAUDE.md (organized into subsections: Environment, Code Style, LLM, Multi-Agent, Documentation). Absorbed SQLite performance notes from PERFORMANCE_NOTES.md.
- **README.md** (root): Slimmed from 108 → 35 lines. Removed duplicated package descriptions, just links to python/README.md.
- **python/README.md**: Slimmed from 282 → 85 lines. Removed bloated agcom integration section (95 lines) and coverage tutorial. Kept setup, commands, dev workflow, agcom env vars summary, project structure.
- **Deleted** `python/COVERAGE.md` (489 lines) — generic pytest-cov tutorial, not project knowledge
- **Deleted** `python/PERFORMANCE_NOTES.md` (88 lines) — absorbed into Claude-KB.md > Gotchas > SQLite Performance
- **Deleted** `python/agcom/QUICKSTART.md` (114 lines) — subset of agcom/README.md
- **Deleted** `python/assistant/agcom/README.md` (1001 lines) — over-documented internal layer
- Verified no stale references to deleted files remain

### 2026-02-18 — On-load inventory & drift check

- Ran full repo inventory across all top-level directories
- Found 3 projects: `python/` (main), `chat/` (React+FastAPI chat app), `emailag/` (agcom reimplementation)
- **Drift identified**: CLAUDE.md repo structure and progress.md only cover `python/` — missing `chat/` and `emailag/`
- `emailag/` duplicates 3 packages from `python/` (agcom, agcom_api, agcom_viewer) — flagged to user
- `python/task_status.json` has one stale completed task from 2026-02-01 (MSFT chart)

### 2026-02-18 — CLAUDE.md trimmed (~290 → 91 lines)

- Shortened on-load section: removed hardcoded menu, example table, justification paragraph
- Removed orphaned `.state.json`/`task_status.json` check (nothing generates these)
- Merged 3 overlapping sections (Self-Improvement, Logging, KB Updates) into one
- Removed redundant "Workspace vs Working Directory" subsection
- Flattened Working Style from 5 subsections + anti-patterns into single list
- Cut Repository Overview table (on-load generates it), collapsed 65-line tree to 13 lines
- Cut Workflow, File Roles, Python Packages detail (~90 lines), kept quick commands + agent summary
- Cut Architecture Notes, Implementation Gaps, Gotchas pointer (discoverable/duplicate/belongs elsewhere)
- Updated project descriptions to user's preferred style

### 2026-02-21 16:30 — Fix EM coordination bugs + make agents smarter

5 bugs fixed across 3 files to reduce screenshot task from 36 messages to ~8-10:

| Fix | File | Change |
|-----|------|--------|
| 1 | `em.py` | `_handle_team_response` always returns None — no more accidental replies to team members via base class |
| 2 | `em.py` | `TaskRecord.results` changed from `dict[str, str]` to `dict[str, list[str]]` — preserves error history instead of overwriting |
| 3 | `delegation.py` | Added `_find_similar_pending()` with Jaccard similarity (>0.7) — blocks duplicate task submissions |
| 4 | `em.py` | Added `_cancel_similar_tasks()` — cancels duplicate active tasks when one completes |
| 5 | `runner.py` | Non-code messages now go through LLM instead of returning canned "no code found" |

Fallback routing added in em.py: runner failure → coder, coder sends code → runner, otherwise → log and ignore.

### 2026-02-21 — Emailag viewer restyle, python viewer bugfix, EM analysis

- **emailag viewer restyled**: Replaced CRT amber phosphor theme with clean dark monitoring dashboard
  - Source Sans 3 + DM Mono fonts, slate blue palette, no scanlines/vignette/glow
  - Tried DM Sans first, then Source Sans 3 for better readability at small sizes
  - User's brother approved the clean version over the edgy one
- **python viewer time filter bug fixed**: `app.js` compared ISO timestamps as strings
  - API returns `+00:00`, JS produces `.000Z` — ASCII `+` < `.` so all messages filtered out
  - Fix: compare `new Date()` objects instead of strings (lines 540, 732)
- **Committed and pushed** `ddbd789` — restyle + bugfix + doc updates (CLAUDE.md, progress.md, .gitignore)
- **EM coordination bugs analyzed** for screenshot task (36 messages, should have been ~8):
  1. EM sends status messages to runner instead of routing errors to coder (4 wasted msgs)
  2. EM loses real error traceback — puts runner's "no code found" in context instead of actual AttributeError
  3. Assistant sends duplicate requests (no dedup)
  4. EM doesn't cancel tasks when another succeeds
  - Full analysis saved in `restart-here.md` for next session
- **Next**: Fix EM error routing, dedup, task cancellation

### 2026-02-22 — Agent LLM decision tests

- Created `tests/agent_harness.py` — `AgentTestHarness` class: real LLM, stubbed agcom transport
  - `create_em()`, `create_runner()`, `create_coder()` with mock `_client`
  - `inject()` calls `process_message()` directly, captures sent messages
  - `seed_task()` pre-creates `TaskRecord` for EM routing tests
  - `judge()` LLM evaluator for semantic assertions
- Created `tests/test_agent_llm_decisions.py` — 13 tests, all passing:
  - **EM routing (5)**: code→runner, error→coder, success→complete, always returns None, result history preserved
  - **Runner intelligence (3)**: status update awareness, description-vs-code, real code execution
  - **Coder output (1)**: generates valid Python
  - **Dedup logic (2)**: blocks similar, allows different (pure logic)
  - **Cancel logic (2)**: cancels similar on completion, preserves unrelated (pure logic)

### 2026-02-23 14:00 — Instance guard for agent-team

- Added PID file lock (`~/.agent-team.pid`) to `assistant/agents/cli.py`
- Prevents running two `agent-team start` instances simultaneously (was causing 2x agents, exponential message storms)
- `_check_and_create_pid_file()`: checks existing PID, detects stale files from crashed processes
- `_remove_pid_file()`: safe cleanup (only removes if PID matches current process)
- `cmd_stop()` now prints the PID it's signaling
- Cross-platform: `os.kill(pid, 0)` works on both Unix and Windows (Python 3.10+)
