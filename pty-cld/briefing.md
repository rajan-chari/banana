# Briefing -- pty-cld

**Last updated:** 2026-04-16 ~22:38
**Status:** Idle — all prior work committed and pushed. Awaiting next task.

## Current State

- All features shipped and committed on `main` (latest `88f95f2`)
- Screen-aware idle detection, checkpoint timers, dynamic emcom attach — all working in production
- Web UI removed; pty-cld is terminal-only
- Swapped to `@homebridge/node-pty-prebuilt-multiarch` (prebuilt binaries, no native build tools)
- fellow-agents integration in progress — milo building CLI shim in fellow-agents package

## Recent Session (2026-04-16)

- Idle session — no user requests. Startup + checkpoint only.

## Prior Session (2026-04-14)

- fellow-agents integration approved by Rajan — `npm install -g fellow-agents` gives browser UI (pty-win) + terminal-only (pty-cld)
- Swapped node-pty -> @homebridge/node-pty-prebuilt-multiarch (prebuilt, drop-in)
- Removed dead web UI (`server.ts`, express/ws deps, `--serve` flag)
- Updated README.md with current features
- Persisted external quality bar directive to Claude-KB.md
- Coordinating with milo on fellow-agents entry point (`node dist/index.js`)

## Open Items

| # | Item | Priority | Notes |
|---|------|----------|-------|
| 1 | Clean-machine install test | High | Rajan directive: every step must just work |
| 2 | Investigate separator-line `unknown` state | Low/cosmetic | Invisible chars in rendered buffer |
| 3 | Exponential backoff in poller | Nice-to-have | |
