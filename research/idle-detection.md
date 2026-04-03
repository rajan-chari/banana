# Idle Detection Internals

Source: jade (claude-code-src), 2026-04-02

## Session State Machine (REPL.tsx:1155)

Explicit, not heuristic:
```
sessionStatus: TabStatusKind =
  isWaitingForApproval || isShowingLocalJSXCommand ? 'waiting'
  : isLoading ? 'busy'
  : 'idle'
```

Type: `TabStatusKind = 'idle' | 'busy' | 'waiting'`

## waitingFor Detail

When `waiting`: "approve Bash", "approve WebFetch", "worker request", "sandbox request", "dialog open", "input needed"

## Notification Hook

Fires from `services/notifier.ts`. Three trigger points:

| Event | Trigger | Delay | notification_type |
|-------|---------|-------|-------------------|
| Idle prompt | After query completion | 60s (configurable: messageIdleNotifThresholdMs) | idle_prompt |
| Permission prompt | After PermissionRequest render | 6s | permission_prompt |
| Elicitation dialog | After ElicitationDialog render | 6s | elicitation_dialog |

Hook stdin JSON includes: hook_event_name, session_id, transcript_path, cwd, message, notification_type

## Idle-Return Dialog (IdleReturnDialog.tsx)

NOT timer-based — fires on user prompt submission. Conditions:
- `lastQueryCompletionTimeRef.current > 0`
- `getTotalInputTokens() >= tokenThreshold` (default 100K, env `CLAUDE_CODE_IDLE_TOKEN_THRESHOLD`)
- Idle time ≥ threshold (default 75 min, env `CLAUDE_CODE_IDLE_THRESHOLD_MINUTES`)

Actions: continue, clear (new conversation), dismiss, never (persisted)

## External Signals for State Detection

| Signal | Mechanism | Reliability | Notes |
|--------|-----------|-------------|-------|
| PID file | `~/.claude/sessions/<pid>.json` fs.watch | High (when BG_SESSIONS on) | status/waitingFor gated behind compile-time flag — currently OFF |
| Notification hook | settings.json hooks config | High | Fires on idle_prompt, permission_prompt, elicitation |
| Terminal output heuristics | Parse PTY stream | Medium | What pty-win currently uses |
