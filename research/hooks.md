# Claude Code Hooks — Implementation Reference

Source: jade (claude-code-src), 2026-04-04

## Hook Types Used by pty-win

| Hook | When it fires | pty-win uses it for |
|------|--------------|---------------------|
| Stop | Claude finishes a turn | Transition to idle, trigger emcom/checkpoint injection |
| UserPromptSubmit | User/injection sends input | Transition to busy |
| Notification (idle_prompt) | 5s after query completion, user hasn't interacted | Confirmed idle, safe to inject |
| Notification (permission_prompt) | 6s after permission dialog renders | Status: waiting |

## Settings Format

```json
{
  "hooks": {
    "Stop": [{ "matcher": "", "hooks": [{ "type": "http", "url": "http://127.0.0.1:PORT/api/hook/stop", "timeout": 2 }] }],
    "Notification": [{ "matcher": "idle_prompt|permission_prompt", "hooks": [{ "type": "http", "url": "http://127.0.0.1:PORT/api/hook/notify", "timeout": 2 }] }],
    "UserPromptSubmit": [{ "matcher": "", "hooks": [{ "type": "http", "url": "http://127.0.0.1:PORT/api/hook/prompt-submit", "timeout": 2 }] }]
  },
  "messageIdleNotifThresholdMs": 5000
}
```

Written to `<cwd>/.claude/settings.local.json` per session.

## Hook Input JSON (stdin for command type, body for http type)

Base fields (always present):
- session_id: string
- transcript_path: string
- cwd: string (key for session matching)
- permission_mode?: string

Notification-specific:
- hook_event_name: "Notification"
- notification_type: "idle_prompt" | "permission_prompt" | "elicitation_dialog"
- message: string
- title?: string

## Merge Behavior (CRITICAL)

Hooks from ALL settings layers fire — no override. Source: hooksSettings.ts:92-141.
- getAllHooks() iterates userSettings, projectSettings, localSettings
- Pushes every hook into a flat array
- All fire for matching event+matcher

pty-win hooks in settings.local.json ADD to user's existing hooks in settings.json. Safe.

## Idle Notification Threshold

- Default: 60000ms (60s)
- Config: `messageIdleNotifThresholdMs` (top-level in settings.json)
- pty-win sets to 5000ms (5s) for near-instant idle detection
- No minimum — can set to 1000ms (1s)

## Hook Type: http vs command

- `type: "http"` — native, Claude Code POSTs JSON directly. No process spawning. Recommended.
- `type: "command"` — spawns a shell process, pipes JSON to stdin. Use for complex logic.
