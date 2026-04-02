# Tracker

Last updated: 2026-03-30

## In Motion

| Item | Status | Owner | Notes/Links |
|------|--------|-------|-------------|
| pty-win: force-not-busy context menu | Not started | frost | Rajan wants right-click "force not busy" on session entries. Check if commit `8f0340c` already covers this. |
| emcom: server restart for case-insensitive names | Pending Rajan approval | frost | Server source updated (COLLATE NOCASE), but running emcom-server.exe is old binary. Needs rebuild + restart to take effect. |

## Watching

| Item | Waiting On | Details | Links |
|------|------------|---------|-------|
| — | — | Nothing pending | |

## Completed

| Date | Item | Outcome |
| 2026-04-02 | emcom CLI batch 1: 5 UX improvements | inbox --full, read-all, tag batch, reply --handled, check. Commit `4b7b8e7` |
| 2026-04-02 | emcom CLI batch 2: 5 more improvements | status cmd, inbox filters, CC comma fix, stdin body, case-insensitive names (server-side). Commit `6f1e449` |
| 2026-04-02 | Team-wide feature announcement | Sent to milo for distribution. Covers existing + new features. |
|------|------|---------|
| 2026-03-25 | Adopt briefing.md spec | Created briefing.md, updated CLAUDE.md startup + session-end, commit `4cdeb73` |
| 2026-03-24 | Layered auto-save in CLAUDE.md | Added Layer 1 (milestone) + Layer 2 (periodic) strategy, commit `493024d` |
| 2026-03-24 | Tracker standardization | Aligned to finalized format, commit `4f36085` |
| 2026-03-24 | Full save (rc-save/session-save/greet-save) | Committed `c4a1e1f`, pushed |
| 2026-03-23 | Suppress polling logs | `_SuppressPollingFilter` in `main.py` lifespan, exe rebuilt |
| 2026-03-23 | Moss's unread-tag fix | Commit `c72d0ca`, included in exe rebuild |
| 2026-03-23 | Session end routine in CLAUDE.md | Added to CLAUDE.md |
| 2026-03-23 | emcom-server.exe rebuild | Logging + unread fixes in single rebuild |
