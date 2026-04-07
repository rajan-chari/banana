# Tracker

Last updated: 2026-03-30

## In Motion

| Item | Status | Owner | Notes/Links |
|------|--------|-------|-------------|
| pty-win: force-not-busy context menu | Not started | frost | Rajan wants right-click "force not busy" on session entries. Check if commit `8f0340c` already covers this. |
| emcom-server.exe deploy | Staged, deploy on next restart | frost | Binary at `emcom/dist/emcom-server.exe` includes WS endpoint + date_found + runtime-tmpdir fix. Copy to `~/.claude/skills/emcom/bin/` when server stops. |

## Watching

| Item | Waiting On | Details | Links |
|------|------------|---------|-------|
| — | — | Nothing pending | |

## Completed

| Date | Item | Outcome |
| 2026-04-02 | emcom CLI batch 1: 5 UX improvements | inbox --full, read-all, tag batch, reply --handled, check. Commit `4b7b8e7` |
| 2026-04-02 | emcom CLI batch 2: 5 more improvements | status cmd, inbox filters, CC comma fix, stdin body, case-insensitive names (server-side). Commit `6f1e449` |
| 2026-04-02 | Team-wide feature announcement | Sent to milo for distribution. Covers existing + new features. |
| 2026-04-03 | Work tracker feature | Server (3 tables, 13 endpoints) + CLI (tracker.exe AOT) + 17 tests. Commits `8424578`, `3daee16`. Both binaries deployed. |
| 2026-04-04 | Code quality audit + edge case tests | 16 new tests covering auth case, special chars, tag semantics, e2e integrity, multi-recipient. Commit `39cd859`. |
| 2026-04-04 | Ruff linting + coverage report | Added ruff, fixed all lint issues, ResourceWarning fix, 88% coverage for emcom_server. Commit `199927e`. |
| 2026-04-04 | CLI integration tests | 21 tests invoking real AOT binaries against test server on port 8801. 119 total passing. Commit `8412604`. |
| 2026-04-06 | PyInstaller --runtime-tmpdir fix | Rebuilt emcom-server.exe + emcom-tui.exe to extract to `~/.emcom/runtime/` instead of %TEMP%. Commit `bd2c71d`. |
| 2026-04-06 | Tracker WebSocket endpoint | /tracker/ws for real-time updates — snapshot on connect, broadcast on mutations. Commit `29c7ac6`. |
| 2026-04-06 | date_found field | Optional field for staleness tracking. DB migration included. tracker.exe deployed. Commit `52e8087`. |
| 2026-04-07 | Null number display fix | Items without GitHub issue number show repo name instead of "repo#null". Commit `582f59d`. |
| 2026-04-07 | --append-notes feature | Appends timestamped entries to notes field instead of replacing. Commit `1ee7b30`. |
|------|------|---------|
| 2026-03-25 | Adopt briefing.md spec | Created briefing.md, updated CLAUDE.md startup + session-end, commit `4cdeb73` |
| 2026-03-24 | Layered auto-save in CLAUDE.md | Added Layer 1 (milestone) + Layer 2 (periodic) strategy, commit `493024d` |
| 2026-03-24 | Tracker standardization | Aligned to finalized format, commit `4f36085` |
| 2026-03-24 | Full save (rc-save/session-save/greet-save) | Committed `c4a1e1f`, pushed |
| 2026-03-23 | Suppress polling logs | `_SuppressPollingFilter` in `main.py` lifespan, exe rebuilt |
| 2026-03-23 | Moss's unread-tag fix | Commit `c72d0ca`, included in exe rebuild |
| 2026-03-23 | Session end routine in CLAUDE.md | Added to CLAUDE.md |
| 2026-03-23 | emcom-server.exe rebuild | Logging + unread fixes in single rebuild |
