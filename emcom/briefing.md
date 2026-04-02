# Briefing

Last updated: 2026-04-02 milestone

## Current Focus

Shipped 10 CLI improvements in 2 batches (commits `4b7b8e7`, `6f1e449`). AOT binary deployed. Feature announcement sent via milo. Waiting on Rajan approval for emcom-server restart (case-insensitive name lookup needs server-side binary update).

## Don't Forget

- Stop emcom-server before rebuilding exe (Windows file lock)
- Check if pty-win force-idle context menu (commit `8f0340c`) covers Rajan's "force not busy" request — if yes, mark done in tracker

## Recent

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
