# Work Tracker

## Active

| Item | Status | Details |
|------|--------|---------|
| Suppress polling logs | Done, exe rebuilt | Added `_SuppressPollingFilter` to `main.py` lifespan. Filters `GET /email/tags/unread` from uvicorn access log. Rebuilt `emcom-server.exe` 2026-03-23. |
| Moss's unread-tag fix | Done, exe rebuilt | Commit `c72d0ca` — `add_tags()` now removes `unread` when `handled` is added. Included in same exe rebuild. |
| Session end routine in CLAUDE.md | Done | Added `/rc-save`, `/rc-session-save`, `/rc-greet-save` to CLAUDE.md per Rajan's request. |
| pty-win: force-not-busy context menu | Not started | Rajan wants right-click on session entry to "force not busy" so emcom check can be injected when busy detection fails. Conversation interrupted before design. |

## Completed (archive)

| Item | Date | Details |
|------|------|---------|
| rc-save skills in CLAUDE.md | 2026-03-23 | Added session end routine section |
| emcom-server.exe rebuild (logging + unread fix) | 2026-03-23 | Both fixes in single rebuild |
