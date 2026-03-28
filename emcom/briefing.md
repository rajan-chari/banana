# Briefing

Last updated: 2026-03-28

## Current Focus

Session ending (shutdown). Extended idle since 2026-03-27 19:30.

## Don't Forget

- Stop emcom-server before rebuilding exe (Windows file lock)
- Check if pty-win force-idle context menu (commit `8f0340c`) covers Rajan's "force not busy" request — if yes, mark done in tracker

## Recent

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
