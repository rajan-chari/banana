# Briefing
Last updated: 2026-03-27 18:45

## Current Focus
Idle detection data collection — logging screen snapshots on idle transitions to build a labeled dataset for tuning detection heuristics.

## Don't Forget
- Server restart still needed — all fixes through bc8c205

## Recent
### 2026-03-27 18:30 — Fix VS Code button + launch logging + scroll styles
VS Code button was broken by `\\$hwnd` in JS template literal producing `\$hwnd` (invalid PowerShell). Fixed escaping, added full clog() logging for launch flow, unified scrollbar styles across panels. Commits 49cf4c3, bc8c205.

### 2026-03-27 13:50 — Fix checkpoint stagger: per-injection, not per-timer-start
Previous setTimeout→setInterval approach only staggered the first round. Now uses scheduleCheckpointInjection() to delay each actual inject by the repo offset every round. Idle-detection pathway also routes through stagger. Commit b86b1f8.

### 2026-03-27 13:10 — Process lifecycle logging
Added clog() for process started/exited/killed with pid, cmd, cwd, exit code. Commit b772c8f.

### 2026-03-27 13:05 — Quick Access panel
New sidebar panel above SESSIONS for pinned folders. Gold star, one-click open/focus, green dot for active sessions. Right-click pin/unpin. localStorage persisted. Commit 605d1e4.

### 2026-03-27 12:50 — VS Code focus fix v2
Replaced AppActivate with Win32 GetForegroundWindow + ShowWindow(SW_MINIMIZE). Minimizes browser before launching VS Code. Tested live — works. Commit 3285252.

### 2026-03-27 01:30 — Fix idle-skip + verbose checkpoint logging
Fixed bug where checkpoint response output defeated the skip (stamped lastCheckpointTime at injection instead of after response). Added checkpointInFlight flag — timestamp now set when session goes idle post-response. Also made every timer fire log its outcome (skipped/queued/injecting). Commits 089de84, 4154f8f.

### 2026-03-26 22:10 — Fix VS Code opening behind fullscreen browser
Client exits fullscreen + blurs window; server uses PowerShell AppActivate after 2s delay. Commit 8d73790.

### 2026-03-26 20:30 — Skip checkpoints on idle sessions
Sessions now track `lastCheckpointTime` vs `lastOutputTime`. If no PTY output since the last checkpoint, both light and full checkpoints are skipped with a log message. Saves tokens and reduces noise from "No changes. Skipping." responses.

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
