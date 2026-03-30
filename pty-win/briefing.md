# Briefing
Last updated: 2026-03-30 02:40

## Current Focus
Startup stagger + perf fixes all shipped. Server restart + browser refresh needed.

## Don't Forget
- Server restart needed — all server-side changes through e96c6bd pending
- Browser refresh needed for startup stagger (frontend change)

## Recent
### 2026-03-30 02:40 — Stagger session startups at boot by repo group
Groups sessions by repo root, launches each group 7s apart. Spreads both pty.spawn() syscalls and --resume onData floods. Commit e96c6bd.

### 2026-03-30 02:20 — Perf: output batching, async writes, ONNX worker thread
16ms WS send batching, appendFile async, ONNX moved to worker_threads. Commit d921ae0.


### 2026-03-30 02:00 — Diagnostics tab with live stats table
Fixed "Diag" tab next to Dashboard. Polls /api/stats every 5s, shows busy vs not-busy cb/s / KB/s / avg chunk. Red highlight for sessions >100 cb/s busy. Frontend-only. Commit 8e59976.

### 2026-03-30 01:50 — Rolling stats collector
Per-session 5s rolling window: onData cb/s, bytes/s, avg chunk, split by busy/not-busy. GET /api/stats endpoint + 30s clog summary. Commit 98c94e5.

### 2026-03-28 19:15 — ONNX local inference replaces HTTP service call
onnxruntime-node installed. runLocalMLInference() lazy-loads classifier.onnx, string_input → output_label + output_probability['busy']. mlModelPath config + --ml-model-path CLI flag. Coordinated with amber + milo. Commit d7de3df.

### 2026-03-28 18:30 — ML inference wired into idle detection (Phase 5, HTTP)
queryMLService() on "unknown" promptType — superseded by ONNX local (d7de3df). Commit 92bb505.

### 2026-03-28 18:00 — Draggable/reorderable workspace tabs
Drag tabs left/right to reorder. Blue border drop indicator. Order persists via localStorage. Frontend-only — browser refresh to activate. Commit 41d6247.

### 2026-03-28 05:10 — Heuristic poll interval 250ms → 1s
Redundant to poll faster than the 1s quiet threshold. Commit f2068f7.

### 2026-03-28 05:05 — Quick-message live-tested
Rajan sent "hi is this working" via the popup — injected correctly into PTY.

### 2026-03-28 05:00 — Quick-message: simplify to direct PTY inject
Rajan simplified: drop emcom send entirely, just write text + "respond to Rajan via emcom.\r" into the PTY. No senderIdentityDir, no identity required. Works for any running AI session. Commit a8a9d4f.

### 2026-03-28 04:50 — Quick-message input on AI session action button
Click the AI tag (▶) on a running session → floating popup → type message → Enter injects into PTY. Esc cancels. Shows sent ✓ on success. Initially used emcom send (0560a23), then simplified to direct PTY inject (a8a9d4f).

### 2026-03-28 04:25 — Full checkpoint interval 2h → 3h
Rajan requested change. Commit 48e9e9b.

### 2026-03-28 04:10 — ML dataset rolling files + auto_detect cap
Rolling file rotation every 250 records (labels-001.jsonl, labels-002.jsonl...). Auto-stop cap: mlCollectionMaxSamples (default 1000) stops auto_detect once reached; force_idle/timeout_flag always save. Lazy-init scans files on restart to recover counts. Commit 36016e6.

### 2026-03-28 03:30 — ML sample throttling
Rajan requested throttle on auto_detect samples. Added lastSavedLabel + lastSavedAt per session — save on label transition OR >= 60s same label. force_idle/timeout_flag unaffected. Commit 58ae20a.

### 2026-03-28 03:20 — ML data collection layer (full implementation)
Implemented per Rajan's spec: src/ml-dataset.ts (saveMlSample → JSONL), session.ts (auto_detect on heuristic, busyStartTime, timeout_flag, applyMLInference stub), server.ts (force_idle strong sample), config.ts (busyTimeoutMs 5min, mlServiceUrl). ml-dataset/ gitignored. Commits 7c007fe.

### 2026-03-27 22:50 — Fix QA column alignment (DevTools-assisted)
Used Chrome DevTools MCP to measure pill X positions live. Root causes: (1) kill-btn missing from QA rows (21px gap), (2) kill-btn CSS not scoped to QA rows. Fix: always render kill-btn as spacer, extended CSS to .quick-access-row, hid kill-btn in tree-node rows with display:none. Pixel-perfect alignment confirmed. Commits 0c78ee2, 999de49, 128dc50.

### 2026-03-27 21:40 — Fix Quick Access column alignment
quick-access-row had gap:6px vs session-row margin-based spacing; cmd-tag had no min-width so >_ vs </> were different widths. Fixed with height/padding match + min-width:30px + inline-flex centering. Commit 41b5a26.

### 2026-03-27 21:20 — UI polish sprint: action button pills
Multiple iterations with Rajan: fixed-width pill containers for all buttons (same size regardless of state), vivid fill colors on hover, square border-radius for >_ cmd tag, Quick Access action pills, identity tag colors + indicator dots for Quick Access rows. Commits 78ed3a7 through 8b6a9a0.

### 2026-03-27 19:30 — Fix context menu item shifting
display:none on fav-add/fav-remove caused pin items to shift into their click positions. Fixed with ctx-disabled class (greyed, pointer-events:none) + separator between sections. Commit 77fb746.

### 2026-03-27 18:30 — Fix VS Code button + launch logging + scroll styles
VS Code button was broken by `\\$hwnd` in JS template literal producing `\$hwnd` (invalid PowerShell). Fixed escaping, added full clog() logging for launch flow, unified scrollbar styles across panels. Commits 49cf4c3, bc8c205.

### 2026-03-27 13:50 — Fix checkpoint stagger: per-injection, not per-timer-start
Now uses scheduleCheckpointInjection() to delay each actual inject by the repo offset every round. Commit b86b1f8.

### 2026-03-27 13:05 — Quick Access panel
New sidebar panel above SESSIONS for pinned folders. Gold star, one-click open/focus, green dot for active sessions. Right-click pin/unpin. localStorage persisted. Commit 605d1e4.

### 2026-03-26 01:00 — Repo-aware checkpoint staggering
Auto-detect git repo root per session, count siblings, assign checkpoint timer offset (position × 10s). No config file needed.

### 2026-03-25 20:30 — Injection tagging
All pty-win injection prompts now prefixed with `[pty-win:<type>:<priority>:<response>[:skip-if-busy]]`. Commit 23c03ca.

## Next Up
1. Restart server to pick up all pending changes (through 36016e6)
2. Layer 3 (context pressure detection) — waiting on design decision
3. Root folder indent alignment (low priority)
