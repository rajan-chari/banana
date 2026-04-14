# Briefing -- pty-cld

**Last updated:** 2026-04-14 ~10:40
**Status:** Active — shipping prep for fellow-agents package. Major cleanup in progress.

## Current State

- Screen-aware idle detection working in production
- **84 vitest tests** all passing
- Build clean after dependency swap and web UI removal
- Rajan approved shipping pty-cld as terminal-only option in fellow-agents npm package

## This Session

- **fellow-agents integration approved** — Rajan wants pty-cld shipped alongside pty-win. `npm install -g fellow-agents` will give users both browser UI (pty-win) and terminal-only (pty-cld) commands.
- **Swapped node-pty -> @homebridge/node-pty-prebuilt-multiarch** — prebuilt binaries, no native build tools needed. Drop-in replacement; one API difference: `write()` only accepts `string`. Same package pty-win uses.
- **Removed dead web UI** — deleted `server.ts`, removed `express`/`ws` deps, removed `--serve` flag. Never tested, dead weight for shipping.
- **Updated README.md** — reflects current features (screen-aware detection, CLI flags, checkpoint timers, dynamic emcom attach). Removed web UI section.
- **Persisted external quality bar** — Rajan directive: startup journeys must be super smooth, external comments must have high fact confirmation. Added to Claude-KB.md.
- **Coordinating with milo** — entry point confirmed (`node dist/index.js`), milo building shim in fellow-agents CLI. Build pipeline follows pty-win pattern in release.yml.

## Open Items

| # | Item | Priority | Notes |
|---|------|----------|-------|
| 1 | Commit and push cleanup changes | High | node-pty swap, web UI removal, README rewrite |
| 2 | Clean-machine install test | High | Rajan directive: every step must just work |
| 3 | Investigate separator-line `unknown` state | Low/cosmetic | |
| 4 | Exponential backoff in poller | Nice-to-have | |
