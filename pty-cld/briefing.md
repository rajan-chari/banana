# Briefing -- pty-cld

**Last updated:** 2026-04-17 ~15:10
**Status:** Active — ported 3 perf optimizations from pty-win. Build clean, tests pass. Not yet committed.

## Current State

- **v0.2.1** — 3 perf optimizations ported from pty-win (see this session below)
- All features shipped on `main`; screen-aware idle detection, checkpoint timers, dynamic emcom attach working
- Web UI removed; pty-cld is terminal-only
- `@homebridge/node-pty-prebuilt-multiarch` for prebuilt binaries
- fellow-agents integration in progress — milo building CLI shim

## This Session (2026-04-17)

Rajan requested porting 3 perf optimizations from pty-win. All implemented, build clean, 84/84 tests pass:

1. **Output batching 16ms** (`src/index.ts`) — PTY→stdout writes buffered at 60fps max instead of per-onData. Flush forced on exit/cleanup to avoid lost output.
2. **Deferred xterm parsing** (`src/pty/screen-detector.ts`) — `write()` now buffers to `pendingData` string. `flush()` called on-demand before `detectPromptType()`, `getContentLines()`, `snapshot()`, `resize()`. Avoids parsing every PTY chunk through xterm-headless (~10% CPU reduction in pty-win).
3. **Async logging** (`src/log.ts`) — `createWriteStream` replaces `appendFileSync`. Lazy-init stream, swallows write errors.

Version bumped 0.2.0 → 0.2.1. Changes not yet committed.

## Open Items

| # | Item | Priority | Notes |
|---|------|----------|-------|
| 1 | Commit perf optimizations | High | Build clean, tests pass, ready to commit |
| 2 | Clean-machine install test | High | Rajan directive: every step must just work |
| 3 | Investigate separator-line `unknown` state | Low/cosmetic | Invisible chars in rendered buffer |
| 4 | Exponential backoff in poller | Nice-to-have | |
