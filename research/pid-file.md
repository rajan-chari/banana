# PID File Schema

Source: jade (claude-code-src), 2026-04-02

## Location

`~/.claude/sessions/<pid>.json` (or `$CLAUDE_CONFIG_DIR/sessions/<pid>.json`)
Directory created with mode 0o700.

## Base Schema (always present)

```json
{
  "pid": 12345,
  "sessionId": "uuid-string",
  "cwd": "/path/to/working/dir",
  "startedAt": 1743580000000,
  "kind": "interactive",
  "entrypoint": "cli"
}
```

## Extended Fields (feature-gated)

| Field | Gate | When Updated |
|-------|------|-------------|
| status ("idle"/"busy"/"waiting") | BG_SESSIONS | Every REPL state transition |
| waitingFor | BG_SESSIONS | Same as status |
| updatedAt | BG_SESSIONS | Same as status |
| name | BG_SESSIONS | Session rename |
| logPath | BG_SESSIONS | At registration |
| agent | BG_SESSIONS | At registration |
| messagingSocketPath | UDS_INBOX | At registration |
| bridgeSessionId | Always | Remote Control bridge connect/disconnect |

## BG_SESSIONS Status: OFF

- Compile-time flag (bun:bundle), NOT runtime toggleable
- Verified empirically: 24 PID files on machine, none have status field
- Detection: if any PID file has `status` field → flag is on
- Upgrade path: when Anthropic ships BG_SESSIONS, switch from heuristics to fs.watch

## Useful Even Without BG_SESSIONS

- `cwd` always present → match sessions to pty-win by working directory
- `pid` as filename → enumerate all running Claude sessions
- `sessionId` → correlate with cost persistence in ~/.claude.json
- Cleanup: stale files filtered by isProcessRunning(pid) check
