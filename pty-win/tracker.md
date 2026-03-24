# pty-win Work Tracker

Last updated: 2026-03-24 14:53

## In Motion

| Item | Status | Owner | Notes/Links |
|------|--------|-------|-------------|
| Force-idle server restart | Pending | Rajan | Server needs restart for `POST /api/sessions/:name/force-idle` — commit 8f0340c |

## Watching

| Item | Waiting On | Details | Links |
|------|-----------|---------|-------|
| AI launcher e2e verification | Next session | Verify agency cc, copilot commands work end-to-end | |
| Root folder indent alignment | Low priority | Root vs child arrow/indent offset may still differ slightly | |
| Pane topbar AI preset label | Low priority | Show which AI preset is running in pane topbar | |
| Drag-and-drop pane reorder | Low priority | Reorder panes within a workspace via drag | |

## Completed

| Date | Item | Outcome |
|------|------|---------|
| 2026-03-24 | Force-idle context menu | Right-click session/folder row → force idle + trigger emcom inject (8f0340c) |
| 2026-03-24 | Session row context menu | Sessions panel rows now support right-click context menu |
| 2026-03-24 | Root async indicator update | folder-info fetch patches DOM in-place for root folders (a3a9b2a) |
| 2026-03-24 | Root indicator alignment | Unified indicator-slot CSS gap/margin between root and child nodes |
| 2026-03-24 | Identity font + @ prefix | Bumped to 12px, removed @ prefix across sidebar/topbar/dashboard (b614c4f) |
| 2026-03-24 | Tracker.md standard | Adopted common tracker format per Rajan's proposal |
