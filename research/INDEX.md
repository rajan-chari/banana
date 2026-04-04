# Research Index

Findings from jade (claude-code-src analyst) and other investigations. Preserved here so new sessions don't need to re-discover these facts.

## Completed

| Date | File | Topic | Key Finding |
|------|------|-------|-------------|
| 2026-04-01 | [status-bar.md](status-bar.md) | Status bar format + cost tracking | StatusLine is user-configurable (settings.statusLine.command), receives JSON on stdin. formatCost uses 4 decimals ≤$0.50. Exit summary gated on hasConsoleBillingAccess. |
| 2026-04-01 | [cost-persistence.md](cost-persistence.md) | Cost accumulation + persistence | ~/.claude.json keyed by project path. --resume adds previous cost. total_duration_ms = wall clock, total_api_duration_ms = API only. |
| 2026-04-02 | [idle-detection.md](idle-detection.md) | Idle detection internals | Explicit state machine (idle/busy/waiting) in REPL.tsx. PID file at ~/.claude/sessions/<pid>.json. BG_SESSIONS flag OFF — status field not written. Notification hook fires 60s after query completion. |
| 2026-04-02 | [pid-file.md](pid-file.md) | PID file schema | Full JSON schema. status/waitingFor gated behind BG_SESSIONS (compile-time, OFF). cwd always present. |

| 2026-04-02 | [permissions.md](permissions.md) | Permission system: architecture, rule syntax, all tool behaviors, 7 common prompt triggers + fixes, recommended configs per agent type |
| 2026-04-04 | [hooks.md](hooks.md) | Hook system: Stop/Notification/UserPromptSubmit for idle detection. Settings format, merge behavior (safe to add), input JSON schema, messageIdleNotifThresholdMs config. |

| 2026-04-04 | [multi-agent-testing.md](multi-agent-testing.md) | Testing patterns: MassTransit saga harness for emcom, @microsoft/tui-test for PTY, Playwright routeWebSocket for browser E2E, @xstate/graph for state machine exhaustive paths. |

## In Progress

(none)
