# Briefing — pty-cld

**Last updated:** 2026-04-10 ~12:14
**Status:** Stable, no code changes. Confirmed pty-cld is optional for v1 deploy.

## Current State

- Screen-aware idle detection working in production
- All code committed and pushed on `main` (latest: `cdc54f6`)
- **42 vitest tests** covering input-injector (26) and screen-detector (16)
- Rajan directive: **hold on refactoring** — safety net is in place, document edge cases if found

## This Session

- **One-click deploy discussion** — Rajan and milo asked about pty-cld's packaging constraints for a one-click agent system installer. Responded: pty-cld is **optional for v1** because node-pty (native C++ addon) requires per-OS compilation (VS Build Tools on Windows, Xcode CLI on macOS, build-essential on Linux). All other deps are pure JS. pty-win covers the browser use case.
- **Consolidated plan approved** — Rajan confirmed pty-cld skipped for v1, will add as optional in v2. No concerns from our side.
- **New team rule persisted** — Independent verification required for all community-facing content (GitHub comments, PRs, docs, samples). Added to `Claude-KB.md` (Guardrails section) and `CLAUDE.md` so fresh sessions see it. Not yet committed.

## Open Items

| # | Item | Priority | Notes |
|---|------|----------|-------|
| 1 | Update README.md — stale config section | Low | |
| 2 | Test or deprecate web UI (`--serve`) | Low | |
| 3 | Investigate separator-line `unknown` state | Low/cosmetic | |
| 4 | Exponential backoff in poller | Nice-to-have | |
| 5 | Document additional edge cases from testing | Active | Rajan: "tests reveal truth about the code" |
