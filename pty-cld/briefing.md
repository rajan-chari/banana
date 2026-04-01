# Briefing — pty-cld

**Last updated:** 2026-04-01 ~00:00
**Status:** Idle — committed prior-session changes, no new dev

## Current State

- Screen-aware idle detection working in production
- All code committed and pushed on `main` (latest: `61ed565`)
- Checkpoint timers, resume kick, dynamic emcom, injection tags all shipped

## This Session

- Processed emcom inbox: Rajan's "Hi everyone!" check-in thread (6 messages, status updates only)
- Committed prior-session code changes: checkpoint timers, resume kick, dynamic emcom attach, injection tags (`61ed565`)
- Updated session-context.md

## Open Items

| # | Item | Priority |
|---|------|----------|
| 1 | Update README.md — stale config section | Low |
| 2 | Test or deprecate web UI (`--serve`) | Low |
| 3 | Investigate separator-line `unknown` state | Low/cosmetic |
| 4 | Exponential backoff in poller | Nice-to-have |
