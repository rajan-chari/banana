# Briefing
Last updated: 2026-03-26 01:00

## Current Focus
Idle detection data collection — logging screen snapshots on idle transitions to build a labeled dataset for tuning detection heuristics.

## Don't Forget
- Server restart still needed — all fixes through repo stagger commit

## Recent
### 2026-03-26 01:00 — Implemented repo-aware checkpoint staggering
Rajan reported index.lock conflicts when multiple agents on fellow-scholars checkpoint simultaneously. Fix: auto-detect git repo root per session (`git rev-parse --show-toplevel`), count siblings on same repo, assign checkpoint timer offset (position × 10s). Shutdown saves also staggered per repo group. No config file needed — fully automatic.

### 2026-03-26 00:15 — Q&A session: state storage architecture
Rajan asked where pty-win persists its config. Documented: server-side state is all CLI args + in-memory (no config file), client-side is browser localStorage keyed by origin. Multiple instances get isolated storage via different ports. No code changes.

### 2026-03-25 20:30 — Implemented injection tagging
All pty-win injection prompts now prefixed with `[pty-win:<type>:<priority>:<response>[:skip-if-busy]]`. Types: emcom, startup-kick, checkpoint-light, checkpoint-full, shutdown. Agents can distinguish automated injections from user input and calibrate response effort. Commit 23c03ca.

### 2026-03-25 15:04 — Adopted briefing.md spec
Replaced session-context.md with briefing.md per Rajan's finalized spec. Updated pty-win injection prompts (checkpoint light/full, shutdown) to include briefing.md. Updated CLAUDE.md startup instructions.

### 2026-03-25 14:45 — RFC feedback on briefing.md
Replied to Rajan's RFC with feedback: strong yes, count-based pruning (~20), update at checkpoints + direction changes, keep both briefing.md and LOG.md.

### 2026-03-25 14:30 — Idle detection data collection ideation
Designed NDJSON logging for idle transitions: timestamp, session, command, trigger (auto/force), quietMs, promptType, contentLines. Force-idle right-click = confirmed false negative (free labeling signal). ~30 lines of changes to implement.

--- new session ---

### 2026-03-24 22:35 — Session end
All fixes committed through 4fae99e. Copilot preset, shutdown promise bugs, clog() timestamps, AI_COMMANDS consistency. Server restart needed.

## Next Up
1. Implement idle detection logging (NDJSON to ~/.pty-win/idle-log.ndjson)
2. Restart server to pick up all pending changes
3. Layer 3 (context pressure detection) — waiting on design decision
