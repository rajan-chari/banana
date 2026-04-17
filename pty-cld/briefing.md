# Briefing -- pty-cld

**Last updated:** 2026-04-17 ~18:16
**Status:** Idle — v0.2.1 committed and pushed. Awaiting next task or release tag.

## Current State

- **v0.2.1** on `main` (commit `706ffd6`) — 3 perf optimizations ported from pty-win
- All features shipped; screen-aware idle detection, checkpoint timers, dynamic emcom attach working
- Web UI removed; pty-cld is terminal-only
- `@homebridge/node-pty-prebuilt-multiarch` for prebuilt binaries
- **fellow-agents integration**: no code work needed. GHA release workflow pulls pty-cld from banana/main automatically. Milo flagged Rajan to push a release tag to pick up v0.2.1.

## This Session (2026-04-17)

Rajan requested porting 3 perf optimizations from pty-win. All implemented, build clean, 84/84 tests pass, committed `706ffd6`:

1. **Output batching 16ms** (`src/index.ts`) — PTY→stdout writes buffered at 60fps max instead of per-onData
2. **Deferred xterm parsing** (`src/pty/screen-detector.ts`) — `write()` buffers to `pendingData`, `flush()` on-demand before reads (~10% CPU reduction)
3. **Async logging** (`src/log.ts`) — `createWriteStream` replaces `appendFileSync`

## Open Items

| # | Item | Priority | Notes |
|---|------|----------|-------|
| 1 | Clean-machine install test | High | Rajan directive: every step must just work |
| 2 | Investigate separator-line `unknown` state | Low/cosmetic | Invisible chars in rendered buffer |
| 3 | Exponential backoff in poller | Nice-to-have | |
