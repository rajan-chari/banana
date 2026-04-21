# Briefing -- pty-cld

**Last updated:** 2026-04-20 ~22:02
**Status:** Idle — v0.2.1 shipped, wiki seeded, Claude-KB cleaned. Awaiting release tag.

## Current State

- **v0.2.1** on `main` (commit `706ffd6`) — 3 perf optimizations ported from pty-win
- All features shipped; screen-aware idle detection, checkpoint timers, dynamic emcom attach working
- Web UI removed; pty-cld is terminal-only
- `@homebridge/node-pty-prebuilt-multiarch` for prebuilt binaries
- **fellow-agents integration**: GHA release workflow pulls from banana/main automatically. Milo flagged Rajan for a release tag.
- **Team wiki**: 4 pages seeded at `team-wiki/tooling/pty-cld/` (architecture, idle detection, state machine). CLAUDE.md updated to read them on startup.
- **Claude-KB.md**: cleaned — removed 12 entries now in wiki, kept 9 dev-specific gotchas + guardrails
- **New agent**: forge onboarded in fellow-agents workspace, will coordinate on pty-cld packaging changes

## Recent Sessions

### 2026-04-20
- Seeded team-wiki with 3 articles (architecture, idle detection, injection state machine) via librarian
- Verified wiki content landed, cleaned Claude-KB.md of duplicates
- Updated CLAUDE.md startup to read wiki pages on session start (Rajan directive)
- Responded to forge intro (new fellow-agents dev) and Rajan's shared wiki RFC

### 2026-04-17
- Ported 3 perf optimizations from pty-win (committed `706ffd6`):
  1. Output batching 16ms — PTY→stdout at 60fps max
  2. Deferred xterm parsing — ~10% CPU reduction
  3. Async logging — WriteStream replaces appendFileSync

## Open Items

| # | Item | Priority | Notes |
|---|------|----------|-------|
| 1 | Clean-machine install test | High | Rajan directive: every step must just work |
| 2 | Investigate separator-line `unknown` state | Low/cosmetic | Invisible chars in rendered buffer |
| 3 | Exponential backoff in poller | Nice-to-have | |
