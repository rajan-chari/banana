# Briefing

Last updated: 2026-03-25 15:30

## Current Focus

Idle — briefing.md adoption complete, inbox triaged. Waiting for new work.

## Don't Forget

- Stop emcom-server before rebuilding exe (Windows file lock)
- Check if pty-win force-idle context menu (commit `8f0340c`) covers Rajan's "force not busy" request — if yes, mark done in tracker

## Recent

### 2026-03-25 15:30 — Full checkpoint (rc-save)
All work committed and pushed. No new learnings. briefing.md updated for session state.

### 2026-03-25 15:10 — Adopted briefing.md spec
Created this file per Rajan's finalized spec (emcom af1edf6f). Updated CLAUDE.md to reference briefing.md instead of session-context.md.

### 2026-03-25 15:00 — Replied to RFC and stale save request
Replied to Rajan's briefing.md RFC with detailed feedback (endorsed proposal, suggested event-driven appends, ~20 entry cap). Acknowledged stale "save now" message from previous session.

--- new session ---

### 2026-03-25 02:40 — Added git commit heredoc lesson
Added lesson to Claude-KB.md about using `git commit -F -` with heredoc instead of `$(cat <<'EOF')` to avoid permission prompts. Commit `bd12e90`.

## Next Up

- Verify pty-win force-idle context menu status (tracker item)
- Watch for follow-up from Rajan on briefing.md adoption
