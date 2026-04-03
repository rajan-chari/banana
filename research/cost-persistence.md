# Cost Accumulation + Persistence

Source: jade (claude-code-src), 2026-04-01

## Persistence Location

- `~/.claude.json` (or `~/.claude<suffix>.json` for OAuth variants)
- Keyed by project absolute path under `config.projects[absolutePath]`
- Env override: `CLAUDE_CONFIG_DIR`

## Persisted Fields

```
lastCost, lastAPIDuration, lastAPIDurationWithoutRetries,
lastToolDuration, lastDuration, lastLinesAdded, lastLinesRemoved,
lastTotalInputTokens, lastTotalOutputTokens, lastSessionId,
lastModelUsage (per-model breakdown)
```

## Resume Behavior

- On `--resume`, `restoreCostStateForSession(sessionId)` adds previous session costs back into running total
- Match is by `lastSessionId` — if saved ID matches the session being resumed, costs are restored
- New session (no resume) = fresh zero
- Exit summary on resumed session reflects CUMULATIVE total (all turns, including pre-resume)

## Duration Fields

- `total_duration_ms` = Date.now() - STATE.startTime = wall-clock since process start (includes idle, thinking, API, tools)
- `total_api_duration_ms` = sum of all API call durations including retries = time waiting for Anthropic API
- Difference = idle time + tool execution + local processing

## Cost Formula (modelCost.ts:131-142)

```
cost = (input_tokens / 1M) * inputRate
     + (output_tokens / 1M) * outputRate
     + (cache_read_tokens / 1M) * cacheReadRate
     + (cache_creation_tokens / 1M) * cacheWriteRate
     + web_search_requests * $0.01
```

Tool calls do NOT cost extra — they're output tokens (tool_use blocks) + input tokens (tool result fed back).
