# pty-win Work Tracker

## Completed This Session (2026-03-24)

| Item | Status | Details |
|------|--------|---------|
| Identity font size | Done | Bumped to 12px across sidebar, pane topbar, dashboard |
| Remove @ prefix | Done | Identity names render without @ in all locations |
| Root indicator alignment | Done | Unified indicator-slot CSS (gap/margin) between root and child nodes |
| Root async indicator update | Done | folder-info fetch now patches DOM in-place for root folders |
| Force-idle context menu | Done | Right-click session/folder row to force idle + trigger emcom inject |
| Session row context menu | Done | Sessions panel rows now support right-click (shares folder context menu) |

## In Motion

| Item | Status | Details |
|------|--------|---------|
| Force-idle server restart | Pending | Server needs restart to activate `POST /api/sessions/:name/force-idle` endpoint |

## Open / Next Up

| Item | Priority | Details |
|------|----------|---------|
| Root folder indent alignment | Low | Root vs child arrow/indent offset may still differ slightly |
| AI launcher e2e verification | Medium | Verify agency cc, copilot commands work end-to-end |
| Pane topbar AI preset label | Low | Show which AI preset is running in pane topbar |
| Drag-and-drop pane reorder | Low | Reorder panes within a workspace via drag |
