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

### 2026-03-08 — emcom: full implementation (6 phases)

Built emcom — email-metaphor messaging system for AI agent-to-agent communication. All 6 phases implemented and tested:

| Phase | What | Tests |
|-------|------|-------|
| 1. Scaffold | `pyproject.toml`, venv, entry points (`emcom`, `emcom-server`) | Entry points resolve |
| 2. Models + DB | Dataclasses (`Email`, `Identity`, `Thread`, `LocalIdentity`), `Database` class (SQLite WAL, 50-name seed pool) | 34 tests |
| 3. Server | FastAPI app, lifespan DB init, CORS, auth middleware (`X-Emcom-Name`), 7 routers (identity, names, email, threads, tags, search, attachments stub) | 25 tests |
| 4. Client | Sync `httpx` client (`EmcomClient`), identity.json management, auto-start server, error hierarchy | E2E verified |
| 5. CLI | 16 subcommands via argparse, short ID support (8-char prefix → full UUID), formatting helpers | Full E2E verified |
| 6. Skill | `.claude/skills/emcom/SKILL.md` — maps user intent to CLI commands | Created |

**59 total tests, all passing.** Key design decisions: sync httpx (not async), `X-Emcom-Name` header auth, JSON lists in SQLite, port 8800, data in `~/.emcom/`, short ID prefix resolution. Attachments + REPL + viewer deferred.

### 2026-03-08 16:00 — emcom: unified sent+received view

Added `emcom all` command — shows both sent and received emails in one chronological view with direction indicators (`>>` sent, `<<` received). Changes across all layers:

| Layer | Change |
|-------|--------|
| `db.py` | `all_mail(name)` — union of sent+received, sorted by date desc |
| `routers/email.py` | `GET /email/all` endpoint |
| `client.py` | `all_mail()` method |
| `formatting.py` | `format_all_mail()` with direction arrows |
| `cli.py` | `all` subcommand + import |
| `test_db.py` | 3 tests: includes both, excludes unrelated, sort order |
| `test_server.py` | 1 test: endpoint returns sent+received |

63 tests passing (was 59).

### 2026-03-10 — emcom: add `location` field to identities

Added `location` field (last 3 CWD segments) to identity registration so `emcom who` shows where each agent is running from.

| Layer | Change |
|-------|--------|
| `emcom_server/db.py` | Schema: `location TEXT NOT NULL DEFAULT ''`, ALTER TABLE migration, `register()`/`force_register()` accept+store location |
| `emcom_server/models.py` | `RegisterRequest.location: str = ""` |
| `emcom_server/routers/identity.py` | Pass `req.location` to db methods |
| `emcom/models.py` | `Identity.location: str` field |
| `emcom/client.py` | Compute location from CWD via `PurePosixPath`, send in registration body, read in `_to_identity` |
| `emcom/formatting.py` | `Location` column in `format_who()` |
| `tests/test_db.py` | Updated register/force_register tests with location assertions |
| `tests/test_server.py` | Updated register/who tests with location assertions |

66 tests passing (was 63). Rebuilt `emcom.exe` and `emcom-server.exe`.

### 2026-03-24 15:17 — emcom registration + tracker.md + session-end routine

- Registered as **milo** on emcom
- Created `tracker.md` with standard format (In Motion / Watching / Completed sections)
- Added `tracker.md` to CLAUDE.md on-load reads
- Added Session End section to CLAUDE.md (`/rc-save`, `/rc-session-save`, `/rc-greet-save`)

### 2026-03-25 15:00 — Inbox triage (7 messages)

- Processed 7 unread emcom messages from Rajan (03/24–03/25)
- Replied to RFC on briefing.md session continuity redesign — supportive, suggested Blockers section
- Replied to layered auto-save proposal — on board, flagged 30-min self-timing reliability concern
- Acknowledged stale save-now messages from past sessions
- Confirmed heredoc git commit pattern already adopted
- All messages tagged read

### 2026-03-25 15:10 — Adopted briefing.md spec

- Created `briefing.md` per Rajan's finalized spec (Current Focus / Don't Forget / Recent / Next Up)
- Updated CLAUDE.md on-load reads to include `briefing.md`
- No session-context.md existed in banana/ — no removal needed
- Committed and pushed

### 2026-03-25 18:50 — RFC reply: Onboarding → Team Operating Manual

- Read Rajan's RFC and all 6 team replies (scout-triage, sage, moss, blake, spark.net, spark-ts)
- Replied with new-agent perspective: emcom registration checklist, stale message handling, first-10-minutes quick-start, event-driven checkpoints over wall-clock
- Updated briefing.md with RFC activity
- Added 2 learnings to Claude-KB.md: emcom --cc limitation, disabled skills (rc-session-save, rc-greet-save)

### 2026-04-07 21:58 — fellow-agents release workflow

- Created `.github/workflows/release.yml` in fellow-agents repo (461f96a)
- Workflow: workflow_dispatch → checkout banana → build emcom+tracker (.NET 10), emcom-server (PyInstaller), pty-win (tsc) → 3 platforms (win-x64, osx-arm64, linux-x64) → zip per platform + pty-win.zip → GitHub Release
- Updated `setup.sh` with auto-download from releases (matching setup.ps1 behavior)
- Pushed to rajan-chari/fellow-agents
- Remaining: BANANA_PAT secret, first workflow_dispatch, E2E test from fresh clone

### 2026-04-08 00:30 — fellow-agents release v1.0.0 published

- Rajan triggered workflow_dispatch, pty-win build failed (npm ci lockfile drift)
- Fixed: npm ci → npm install (1dd60ef), pushed
- Re-triggered: all jobs pass, v1.0.0 release published on rajan-chari/fellow-agents
- BANANA_PAT already removed (756675f) — banana repo is public

### 2026-04-08 01:30 — Azure tenant migration + dev VMs provisioned

- New BAMI tenant: teamssdk (tenantId 3f3d1cea-7a18-41af-872b-cfbbd5140984, subscription dcdaf10d-a590-4515-8500-11ac049fd36a, resource group rajan-rg)
- Updated azure-env.json and azure-env.md in fellow_scholars/claude/rules/
- Notified bolt, sage, blake via emcom
- B-series VMs capacity-restricted on new subscription. Used D2s_v4 (2 vCPU, 8GB) instead
- Created dev-windows (40.117.128.81, RDP, then deallocated) and dev-linux (13.72.81.221, SSH)
- NSG rules locked to Rajan's IP (141.157.209.78)
- Installing xfce4 + xrdp + firefox on dev-linux for desktop access (background task)
- Creds saved to fellow_scholars/claude/rules/azure-vms.json

### 2026-04-08 04:15 — fellow-agents E2E test complete (both platforms)

**Linux (Ubuntu 24.04):** setup.sh works. Binaries download, emcom-server starts, agents register, pty-win serves UI. Fixes pushed: executable bit, Claude optional, sudo npm link. Key bug: pty-win shell button hardcodes pwsh (moss notified).

**Windows (Server 2022):** setup.ps1 works with pwsh 7. PS 5.1 can't parse nested hashtables — replaced with JSON here-string but PS 5.1 still chokes. pwsh 7 required. pty-win serves UI, terminal works. npm link launch from setup.ps1 broken — manual `node dist\index.js` works.

**Fixes pushed to fellow-agents:** 0420a53, ed5ed9c, d8731d4, fc06605, efe730b (5 commits).

Both VMs deallocated. Auto-shutdown configured at midnight ET.

### 2026-04-16 22:45 — Tracker feature: opened_by + responders fields

Added two new fields to work items per Rajan's request:
- **opened_by** (TEXT, nullable): who originally reported the issue (distinct from created_by and github_author)
- **responders** (TEXT, JSON array): list of agents who have engaged with the item

Changes across 3 layers:
- **Python server** (db.py): schema + migration + TRACKED_FIELDS + create/update. Responders parsed like labels (JSON). `add_responder` in update appends without duplicates.
- **Python router** (tracker.py): CreateWorkItemRequest + UpdateWorkItemRequest models + passthrough.
- **C# CLI** (Models.cs, Program.cs, Formatting.cs): WorkItem + request DTOs + `--opened-by`, `--responders`, `--add-responder` flags + view display.

Tests: 100 passed (21 CLI integration errors = no server running, pre-existing). C# build: 0 warnings, 0 errors.

### 2026-04-17 08:30 — fellow-agents: clear stale workspace config on fresh install

Added step 4/7 to both setup.ps1 and setup.sh per Rajan's request:
1. Removes old `.claude/` dirs from workspace templates (regenerated in step 6)
2. Rewrites `identity.json` server URL to match `--EmcomPort` parameter

Fixes: identity.json had hardcoded `:8800` — custom port users would register against wrong server. Steps renumbered 4→7 (was 4→6).
