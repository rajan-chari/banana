# pty-win Work Tracker

Last updated: 2026-03-24 16:50

## In Motion

| Item | Status | Owner | Notes/Links |
|------|--------|-------|-------------|
| Server restart needed | Pending | Rajan | Restart to activate: force-idle endpoint, checkpoint timers, dirty-state detection |

## Watching

| Item | Waiting On | Details | Links |
|------|-----------|---------|-------|
| Layer 3 (context pressure) | Design decision | Detect context compression events → inject save | See emcom thread d96a241e |
| AI launcher e2e verification | Next session | Verify agency cc, copilot commands work end-to-end | |
| Root folder indent alignment | Low priority | Root vs child arrow/indent offset may still differ slightly | |
| Pane topbar AI preset label | Low priority | Show which AI preset is running in pane topbar | |
| Drag-and-drop pane reorder | Low priority | Reorder panes within a workspace via drag | |

## Completed

| Date | Item | Outcome |
|------|------|---------|
| 2026-03-24 | Layer 2: periodic checkpoints | 30-min light + 2-hr full ceremony injection into AI sessions (b62cc5c) |
| 2026-03-24 | Layer 4: dirty state detection | git status on exit → red toast warning in frontend (b62cc5c) |
| 2026-03-24 | Sessions panel indicator fix | Async folder-info fetch now patches DOM in-place (8c4cce1) |
| 2026-03-24 | Force-idle context menu | Right-click session/folder row → force idle + emcom inject (8f0340c) |
| 2026-03-24 | Root async indicator update | folder-info fetch patches DOM in-place for root folders (a3a9b2a) |
| 2026-03-24 | Identity font + @ prefix | 12px font, removed @ prefix across all locations (b614c4f) |
| 2026-03-24 | Tracker.md standard | Adopted common format per Rajan's proposal |
