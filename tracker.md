# Tracker
Last updated: 2026-04-18 12:01

## In Motion
| Item | Status | Owner | Notes/Links |
|------|--------|-------|-------------|
| pty-win server restart | Blocked on Rajan | Rajan | Deploy opened_by/responders, hook-based idle detection, cost regex, merged dashboard. Large TS backlog. |
| Tracker: opened_by + responders fields | Code complete | milo | c4d9621 — Python server + C# CLI done. Needs server restart + AOT rebuild. |
| fellow-agents next release | Waiting on Rajan | milo | Rajan needs to push tag. Includes pty-cld v0.2.1 perf optimizations (pine 706ffd6). |
| pty-win injection submit bug | Investigating | Rajan | \r not triggering Enter on Windows. Testing via --debug dashboard. |
| Phase 8: Polish & Hardening | Not started | milo | Error handling, logging, docs, testing |

## Watching
| Item | Waiting On | Details | Links |
|------|------------|---------|-------|
| Tracker WS frontend wiring | emcom-server.exe rebuild | Frost's WS endpoint ready, polling works, WS not yet wired | |
| Bolt subagent architecture | scout's pattern | Validated by jade. Waiting for scout to ship first. | |
| EM coordination efficiency | Next work session | 36 msgs → target ~8-10 | LOG.md 2026-02-21 |

## Completed
| Date | Item | Outcome |
|------|------|---------|
| 2026-04-17 | fellow-agents template improvements (6 items) | e0ddccd — startup protocol, capabilities greet, settings.local.json, coordinator tracking, guardrails, checkpoints |
| 2026-04-17 | fellow-agents: trim default permissions | ef44de3 — emcom + tracker only. SDK guardrail removed. |
| 2026-04-17 | fellow-agents: stale config cleanup | 00af997+5645f4a — identity.json URL rewrite + ~/.emcom/ removal on fresh install |
| 2026-04-16 | Tracker: opened_by + responders fields | c4d9621 — schema, migration, create/update, add_responder, C# CLI flags |
| 2026-04-15 | pty-win bug fixes | Linux injection, double-paste, tracker hover, row numbers |
| 2026-04-14 | fellow-agents npm package | 9f1cbf6+4e03a67 — CLI, first-run download, npm-publish job |
| 2026-04-14 | Tracker panel polish | 11768e5+14e69ab+904f0a1 — In Status removed, 380px, brighter colors |
| 2026-04-13 | Docker E2E test | f0c5980 — Dockerfile.test + GHA workflow |
| 2026-04-13 | fellow-agents E2E test (both platforms) | setup.sh + setup.ps1 verified. 8 findings logged. |
| 2026-04-10 | Independent verification rule | d83df24 — broadcast to 18 agents |
