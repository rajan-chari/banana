# Briefing

Last updated: 2026-04-13 checkpoint

## Current Focus

Shipped: (1) --force register bug fix — reuses identity.json name instead of random pool name (`465056e`), (2) Last Activity column in tracker list — shows relative Age + Last Activity times (`c1d3bc9`), (3) 401 auth fix for /health and tracker GET endpoints (`4d46c94`). All CLIs deployed. Server source has all fixes but emcom-server.exe still needs rebuild. No outstanding work.

## Don't Forget

- **Deploy emcom-server.exe on next restart** — new binary staged at `emcom/dist/emcom-server.exe`. Includes: WebSocket endpoint (`/tracker/ws`), date_found field, case-insensitive identity lookup. Copy to `~/.claude/skills/emcom/bin/` when server stops.
- Check if pty-win force-idle context menu (commit `8f0340c`) covers Rajan's "force not busy" request — if yes, mark done in tracker

## Recent

### 2026-04-10 — Split report/github commands — never mix data
Rajan flagged that 51 tracker items vs 104 GitHub PRs in one report was misleading — they're different data answering different questions. Split into: `tracker report` (agent workflow from work_items only) and `tracker github` (GitHub activity from metrics table only). Removed merged report view. Separate endpoints: GET /tracker/report, GET /tracker/github. Commit `541dfe1`.

### 2026-04-09 — Metrics reporting + SQLite migration
Built tracker report endpoints (Tier 1+2 metrics: PR velocity, SLA, dwell times, people). Integrated scout's metrics.jsonl for GitHub data (reviews/commits by person, PR cycle time). Fixed JSONL parser to match actual format. Added clean table formatting for CLI output. Then migrated metrics storage from JSONL file to SQLite `metrics` table with POST API (`/tracker/metrics`, `/tracker/metrics/batch`). Report falls back to JSONL if DB empty. Section labels: "ISSUE WORKFLOW" (tracker DB) + "GITHUB ACTIVITY" (metrics DB). Also: tracker version command (`267b8b0`), report format backwards-compat fix for CLI/server version mismatch (`9d1f31b`). Key commits: `078f284` (report), `ca3ef1d` (metrics reader), `0032335` (JSONL fix), `1af1f38` (tables), `c41f0d7` (SQLite migration). All binaries rebuilt and deployed.

### 2026-04-07 — emcom version command (binary reversion fix)
emcom.exe reverted to old build for the 2nd time (lost batch 1+2 features). Investigated: no hooks or scripts found that overwrite. Added `emcom version` command (BuildInfo.cs) that prints v2.0.0, build timestamp from exe mtime, and feature list. Redeployed correct AOT binary. Commit `08ba541`.

### 2026-04-07 — One-click deploy: ensure_server + CI + pip verify
Completed Rajan's 3-task GO for fellow-agents packaging: (1) Ported ensure_server() to C# CLIs — both emcom.exe and tracker.exe now auto-start emcom-server if /health check fails, spawning it as background process from same dir or PATH. Used AppContext.BaseDirectory for AOT compat. Commit `3db974b`. (2) GitHub Actions CI workflow (`.github/workflows/emcom-build.yml`) — builds emcom+tracker for win-x64/osx-arm64/linux-x64, runs Python server tests, manual dispatch creates GitHub Release with 6 binaries. Commit `f8eb88f`. (3) Verified pip install works cleanly for Mac/Linux server deployment. Also shipped --append-notes (`1ee7b30`), null number fix (`582f59d`), reminders convention to Claude-KB.

### 2026-04-07 — append-notes + null number fix + reminders convention
Added `--append-notes` flag to tracker update — appends timestamped entries with author prefix (`[04-07 15:50 frost] note text`) instead of replacing the notes field. `--notes` still replaces for backwards compat. Commit `1ee7b30`. Also fixed null issue numbers displaying as "repo#null" — now shows just repo name (`582f59d`). Saved tracker-based reminders convention to Claude-KB (use `--labels 'reminder'` with sub-labels: standup, once, weekly). Replied to Rajan's RFC on context collapse persistence rule.

### 2026-04-06 — date_found field + tracker WebSocket + PyInstaller fix
Three features shipped: (1) Fixed PyInstaller exe blocked by Windows Application Control — rebuilt emcom-server.exe and emcom-tui.exe with `--runtime-tmpdir ~/.emcom/runtime/` so DLL extraction goes to whitelisted path instead of %TEMP% (commit `bd2c71d`). (2) Tracker WebSocket endpoint `/tracker/ws?name=<agent>` for real-time updates — sends snapshot on connect, broadcasts on create/update/comment mutations (commit `29c7ac6`). (3) Added `date_found` optional field to work_items for staleness/age tracking — enables time-to-detect and total age calculations for the tracker panel (commit `52e8087`). tracker.exe deployed. emcom-server.exe staged for next restart.

### 2026-04-04 — Fixed emcom.exe regression
Rajan reported `emcom check` returning "Unknown command" — the deployed binary had been overwritten with a pre-feature build missing batch 1+2 features. Rebuilt via `dotnet publish` (AOT) from current source and redeployed to `~/.claude/skills/emcom/bin/`. All features confirmed working. Added Claude-KB lesson: always deploy from the AOT publish path (`emcomcs/bin/Release/net10.0/win-x64/publish/`), never the Debug build.

### 2026-04-04 — CLI integration tests + ruff + coverage
Added 21 CLI integration tests (test_cli_integration.py) that spin up a real server on port 8801 and invoke the actual AOT binaries via subprocess. Covers emcom send/inbox/tag/reply/check/status/search + tracker create/update/list/view/stats. Also: added ruff linting (all checks pass), ran coverage (88% for emcom_server), fixed ResourceWarning in test teardown (Database.close()). 119 total tests passing. Commits `199927e` (ruff), `8412604` (CLI tests).

### 2026-04-04 — Code quality audit + 16 edge case tests
Rajan requested audit after server crashes during tracker dev (caused by killing production server on port 8800). Completed audit: identified 4 risky areas (inbox JSON queries, auth case gap, thread aggregation, zero TUI tests). Added 16 edge case tests: auth case-insensitive (3), special characters including SQL injection (5), tag semantics (3), DB integrity e2e (2), multi-recipient (3). No bugs found — all 98 tests pass. Added Claude-KB lesson: never dev on port 8800. Commit `39cd859`.

### 2026-04-03 — Work tracker feature shipped
Built complete work tracking system hosted inside emcom-server. Server: 3 new tables (work_items, work_item_history, work_item_links), 13 REST endpoints under /tracker, state machine with 11 statuses, dedup on (repo, number), auto audit trail. CLI: standalone tracker.exe (C# AOT, 5.2 MB) with 13 commands (create, update, list, view, queue, stats, decisions, stale, blocked, search, history, comment, link). 17 new tests (83 total). Both binaries deployed. Commits `8424578` (server), `3daee16` (CLI).

### 2026-04-03 — Replied to pty-win feedback + emcom-server.exe staged
Rajan asked for pty-win experience feedback. Replied with: checkpoints and emcom polling work well, friction points are idle session noise, no build grace period, stale pending tags, underutilized context. Suggested idle work queue. Also rebuilt emcom-server.exe via PyInstaller — staged at `emcom/dist/emcom-server.exe`, ready to deploy to `~/.claude/skills/emcom/bin/` on next server restart (includes case-insensitive identity lookup).

### 2026-04-02 — Shipped batch 2 + feature announcement
Batch 2 (commit `6f1e449`): case-insensitive identity lookup (server-side COLLATE NOCASE), emcom status command, inbox --from/--subject/--since filters, CC comma-separated fix, body from stdin. AOT rebuilt and deployed. Also sent team-wide feature announcement via milo covering all existing + new features. Server restart still needed for case-insensitive names to take effect.

### 2026-04-02 — Implemented 5 CLI UX improvements (batch 1)
Milo relayed Rajan's request for CLI workflow improvements. Implemented in emcomcs C# source (Program.cs, Formatting.cs): (1) `inbox --full` shows bodies inline, (2) `read-all` reads all unread at once, (3) `tag` batch mode detects tag-first syntax, (4) `reply --handled` auto-tags after reply, (5) `check` combines inbox + read-all. Build passes, 66 tests pass. Binary exe not yet rebuilt — needs AOT publish.

### 2026-04-01 19:40 — Replied to Rajan check-in
Rajan sent "Hi everyone!" check-in. Replied with status (idle, standing by).

### 2026-04-01 02:30 — Replied to milo re: emcom binary locations
Milo building fellow-agents starter kit, needed binary paths. Replied with `~/.claude/skills/emcom/bin/` (emcom.exe, emcom-server.exe, emcom-tui.exe) and clarified C# AOT vs PyInstaller packaging. Cleaned up 6 stale pending tags.

### 2026-03-30 15:35 — Replied to pty-win feed panel question
Rajan asked if emcom-tui has web/REST components for a pty-win feed panel. TUI is terminal-only, but pointed him to the emcom-server REST API (port 8800) — all endpoints moss needs are there.

### 2026-03-28 shutdown — Shutdown save
Idle all day. No new work.

### 2026-03-28 — Shutdown save
Extended idle. No new work since onboarding read.

### 2026-03-27 19:15 — Read updated onboarding.md
New agents on roster: heidi (async-messaging), thorn (tomato), researcher (on-demand research). Frost/emcom listed correctly. No changes needed.

### 2026-03-27 14:20 — Replied to utility scripts RFC
Rajan RFC on creator/tester/runner workspaces for utility scripts. Replied with 4 script ideas (server health checker, briefing pruner, exe rebuild orchestrator, stale message tagger) + questions on tester access and graduation process.

### 2026-03-27 — Shutdown save
Idle since last checkpoint. No new work.

### 2026-03-26 20:30 — Full checkpoint
Replied to Rajan's check-in (emcom 96d4a83b → 6b59dcd9). Otherwise idle.

### 2026-03-26 00:10 — Full checkpoint (overnight)
No new work. Briefing refreshed for new day.

### 2026-03-25 22:30 — Shutdown save
Server shutting down. All work committed. Session was idle since last checkpoint.

### 2026-03-25 20:35 — Full checkpoint (rc-save)
Team operating manual shipped by Rajan (three-tier design). Confirmed my CLAUDE.md is clean — no stale refs. No new learnings. All committed and pushed.

### 2026-03-25 19:00 — Previous checkpoint (rc-save)
Added Claude-KB lesson (emcom --cc comma-separated names fail). Updated briefing.md. All work committed and pushed.

### 2026-03-25 18:50 — Replied to team operating manual RFC
Read full RFC thread (7 messages). Added emcom-specific feedback: identity model, tag semantics, CLI flags, server lifecycle. Endorsed team consensus on fellow-scholars location, injection tagging. Offered to draft emcom/communication section.

### 2026-03-25 15:30 — Previous checkpoint
All work committed and pushed. briefing.md updated for session state.

### 2026-03-25 15:10 — Adopted briefing.md spec
Created this file per Rajan's finalized spec (emcom af1edf6f). Updated CLAUDE.md to reference briefing.md instead of session-context.md.

### 2026-03-25 15:00 — Replied to RFC and stale save request
Replied to Rajan's briefing.md RFC with detailed feedback (endorsed proposal, suggested event-driven appends, ~20 entry cap). Acknowledged stale "save now" message from previous session.

--- new session ---

### 2026-03-25 02:40 — Added git commit heredoc lesson
Added lesson to Claude-KB.md about using `git commit -F -` with heredoc instead of `$(cat <<'EOF')` to avoid permission prompts. Commit `bd12e90`.

## Next Up

- Verify pty-win force-idle context menu status (tracker item)
- Watch for tagged injections from moss (pty-win injection tagging)
- Watch for any new work from Rajan
