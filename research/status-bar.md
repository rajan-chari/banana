# Status Bar Format + Cost Tracking

Source: jade (claude-code-src), 2026-04-01

## Key Findings

- StatusLine is user-configurable via `settings.statusLine.command` — NOT hardcoded
- Command receives rich JSON on stdin (newline-terminated): cost, model, tokens, rate limits, session info
- Settings priority: userSettings (~/.claude/settings.json) > projectSettings (.claude/settings.json) > localSettings (.claude/settings.local.json)
- Settings schema: `{ type: 'command', command: string, padding?: number }`

## Status Bar JSON Fields (StatusLineCommandInput)

```
session_id, cwd, permission_mode, version, session_name
model: { id, display_name }
workspace: { current_dir, project_dir, added_dirs[] }
cost: { total_cost_usd, total_duration_ms, total_api_duration_ms, total_lines_added/removed }
context_window: { total_input_tokens, total_output_tokens, context_window_size, current_usage, used_percentage, remaining_percentage }
exceeds_200k_tokens: boolean
rate_limits?: { five_hour?: { used_percentage, resets_at }, seven_day?: { ... } }
vim?, agent?, remote?, worktree?
```

## Cost Display Format

- formatCost() in cost-tracker.ts:177-178
- cost > $0.50 → $X.XX (2 decimal places)
- cost ≤ $0.50 → $X.XXXX (4 decimal places)

## Exit Summary

- Printed by costHook.ts on process exit (process.on('exit'))
- ONLY prints if hasConsoleBillingAccess() is true (API users, not claude.ai subscribers)
- Hook JSON cost is NOT gated — always includes cost.total_cost_usd for all users

## Pricing (modelCost.ts)

| Model | Input | Output | Cache Read | Cache Write | per |
|-------|-------|--------|-----------|-------------|-----|
| Opus 4.6 (normal) | $5 | $25 | $0.50 | $6.25 | Mtok |
| Opus 4.6 (fast) | $30 | $150 | $3 | $37.50 | Mtok |
| Sonnet 4/4.5/4.6 | $3 | $15 | $0.30 | $3.75 | Mtok |
| Haiku 4.5 | $1 | $5 | $0.10 | $1.25 | Mtok |
