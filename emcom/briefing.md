# Briefing

Last updated: 2026-04-07 shutdown

## Current Focus

Session ending. Recent deliverables: (1) null issue number display fix (`582f59d`), (2) reminders convention saved to Claude-KB, (3) `--append-notes` feature for tracker — appends timestamped entries instead of replacing notes (`1ee7b30`). emcom-server.exe with all recent features staged at `emcom/dist/` — deploy on next restart. No outstanding work.

## Don't Forget

- **Deploy emcom-server.exe on next restart** — new binary staged at `emcom/dist/emcom-server.exe`. Includes: WebSocket endpoint (`/tracker/ws`), date_found field, case-insensitive identity lookup. Copy to `~/.claude/skills/emcom/bin/` when server stops.
- Check if pty-win force-idle context menu (commit `8f0340c`) covers Rajan's "force not busy" request — if yes, mark done in tracker

## Recent

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
