# Tracker

Last updated: 2026-03-30

## In Motion

| Item | Status | Owner | Notes/Links |
|------|--------|-------|-------------|
| pty-win: force-not-busy context menu | Not started | frost | Rajan wants right-click "force not busy" on session entries. Check if commit `8f0340c` already covers this. |
| — | — | — | No active items. All binaries current. |

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
| 2026-04-07 | ensure_server() C# port | Both CLIs auto-start server if down. Commit `3db974b`. |
| 2026-04-07 | GitHub Actions CI workflow | Cross-platform builds (win/mac/linux) + Python tests. Commit `f8eb88f`. |
| 2026-04-07 | emcom version command | Detects binary reversion — prints v2.0.0, build time, features. Commit `08ba541`. |
| 2026-04-09 | Tracker reporting (Tier 1+2) | PR velocity, SLA, dwell times, people metrics. Commit `078f284`. |
| 2026-04-09 | GitHub metrics integration | Scout's JSONL reader, then migrated to SQLite metrics table with POST API. Commits `ca3ef1d`, `c41f0d7`. |
| 2026-04-09 | Report table formatting | Clean aligned tables for standup/sharing. Commit `1af1f38`. |
| 2026-04-09 | tracker version command | Same pattern as emcom version. Commit `267b8b0`. |
| 2026-04-10 | Split report/github commands | Never mix agent workflow + GitHub data. Separate commands and endpoints. Commit `541dfe1`. |
| 2026-04-10 | Binary reversion root cause | Git-tracked in fellow_scholars. Blake untracking. Added to Claude-KB. |
| 2026-04-10 | deploy.ps1 | Safe deployment script with version check + backup + verify. Commit `1f3aaa1`. |
| 2026-04-12 | Fix 401 on health + tracker GET | /api/health alias, tracker GET endpoints public for pty-win panel. Commit `4d46c94`. |
| 2026-04-13 | Fix --force register ignoring identity name | Force-register reuses identity.json name. Commit `465056e`. |
| 2026-04-13 | Last Activity column | Age + Last Activity relative times in tracker list. Commit `c1d3bc9`. |
| 2026-04-13 | last_github_activity field | Real GitHub timestamps for Last Activity. Scout updating during scans. Commit `e13c375`. |
| 2026-04-13 | CLI --last-github-activity flag | Was missing from update dispatch, silently ignored. Commit `82fe517`. |
| 2026-04-13 | Unknown flag error detection | create/update error on unrecognized flags instead of silent ignore. Commit `20cf89b`. |
| 2026-04-13 | Full --help system | Global + per-command help with flag descriptions and valid values. Commit `7f5ed7b`. |
|------|------|---------|
| 2026-03-25 | Adopt briefing.md spec | Created briefing.md, updated CLAUDE.md startup + session-end, commit `4cdeb73` |
| 2026-03-24 | Layered auto-save in CLAUDE.md | Added Layer 1 (milestone) + Layer 2 (periodic) strategy, commit `493024d` |
| 2026-03-24 | Tracker standardization | Aligned to finalized format, commit `4f36085` |
| 2026-03-24 | Full save (rc-save/session-save/greet-save) | Committed `c4a1e1f`, pushed |
| 2026-03-23 | Suppress polling logs | `_SuppressPollingFilter` in `main.py` lifespan, exe rebuilt |
| 2026-03-23 | Moss's unread-tag fix | Commit `c72d0ca`, included in exe rebuild |
| 2026-03-23 | Session end routine in CLAUDE.md | Added to CLAUDE.md |
| 2026-03-23 | emcom-server.exe rebuild | Logging + unread fixes in single rebuild |
