# pty-win Work Tracker

Last updated: 2026-03-26 01:00

## In Motion

| Item | Status | Owner | Notes/Links |
|------|--------|-------|-------------|
| Server restart | Needed | Rajan | All pending changes including repo stagger |
| Idle detection logging | Design ready | Moss | NDJSON log on idle transitions, force-idle = labeled false negative |

## Watching

| Item | Waiting On | Details | Links |
|------|-----------|---------|-------|
| Layer 3 (context pressure) | Design decision | Detect context compression events → inject save | emcom thread d96a241e |
| Root folder indent alignment | Low priority | Root vs child arrow/indent offset may still differ slightly | |
| Pane topbar AI preset label | Low priority | Show which AI preset is running in pane topbar | |
| Drag-and-drop pane reorder | Low priority | Reorder panes within a workspace via drag | |

## Completed

| Date | Item | Outcome |
|------|------|---------|
| 2026-03-26 | Repo-aware checkpoint stagger | Auto-detect git root, stagger checkpoints 10s apart for shared repos |
| 2026-03-25 | Injection tagging | All prompts tagged [pty-win:type:priority:response] (23c03ca) |
| 2026-03-25 | Adopt briefing.md | Replaced session-context.md; updated checkpoint/shutdown injection prompts + CLAUDE.md startup |
| 2026-03-24 | Timestamped console logs | clog() helper: [pty-win HH:MM:SS] on all output (9e425d2) |
| 2026-03-24 | Revert shutdown self-skip | Agent session should save like any other; freeze was from promise bugs (c6cf0ad) |
| 2026-03-24 | Copilot preset + shutdown fix | Added copilot back, fixed premature resolve + missing resolve in shutdown (dd38343) |
| 2026-03-24 | Improved logging + 120s shutdown | [pty-win] console prefix for emcom/checkpoint events, 120s grace with 10s progress (a35a115) |
| 2026-03-24 | Fix copilot --append-system-prompt | Split AI_COMMANDS vs CLAUDE_COMMANDS — copilot doesn't support preamble flag (0f52ee3) |
| 2026-03-24 | Fix idle detection for all AI commands | Heuristic timer had local `isClaude === "claude"` check, missed agency cc (5d9f246) |
| 2026-03-24 | Fix session click focus + force-idle | Same-workspace focus race; force-idle checked only "claude" not all presets (1f38e96) |
| 2026-03-24 | Unified panel styling | Shared appendRowActions(), unscoped .cmd-tag CSS, matching absent/alive states |
| 2026-03-24 | AI launcher with presets | Configurable presets (Claude, Agency CC, Copilot, Agency GH), right-click picker, default persistence |
| 2026-03-24 | Layer 5: graceful shutdown | Ctrl+C injects save into all AI sessions, waits for idle, then exits (27037b3) |
| 2026-03-24 | Fix agency cc launch | Split multi-word commands for Windows cmd.exe args (16c613a) |
| 2026-03-24 | Layer 2: periodic checkpoints | 30-min light + 2-hr full ceremony injection into AI sessions (b62cc5c) |
| 2026-03-24 | Layer 4: dirty state detection | git status on exit → red toast warning in frontend (b62cc5c) |
| 2026-03-24 | Sessions panel indicator fix | Async folder-info fetch now patches DOM in-place (8c4cce1) |
| 2026-03-24 | Force-idle context menu | Right-click session/folder row → force idle + emcom inject (8f0340c) |
| 2026-03-24 | Root async indicator update | folder-info fetch patches DOM in-place for root folders (a3a9b2a) |
| 2026-03-24 | Identity font + @ prefix | 12px font, removed @ prefix across all locations (b614c4f) |
