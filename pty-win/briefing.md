# Briefing
Last updated: 2026-04-01 13:40

## Current Focus
Dashboard redesign (mission control aesthetic) + UI polish from milo. Hook reverted to regex-only.

## Don't Forget
- Server restart needed — TS changes: hook removed, regex fix, force-idle log, cost tracking
- Browser refresh for frontend (dashboard redesign, pane borders, card costs, stats on top)

## Recent
### 2026-04-01 13:35 — Unfocused pane border #505050
Visible but subtle, won't compete with orange focus.

### 2026-04-01 13:00 — Dashboard redesign: mission control
IBM Plex Mono, amber accents, cyan data, scanline grid bg, status badges, per-card cost, header strip with live counts. Stats+costs moved above cards. All sessions shown in cost table.

### 2026-04-01 12:20 — Reverted status bar hook to regex-only
Multi-instance port conflict. Removed hook endpoint, HookData, settings.local.json writing. Kept dual regex (exit + live with 2m34s format), costs.json, /api/costs.

### 2026-04-01 12:20 — Dashboard + Diag merged into one tab
Session cards + stats + costs in single Dashboard tab. Diag tab removed.

### 2026-04-01 12:00 — Hook bugs fixed (3)
broadcastSessionList() missing after hookData set; dual regex (exit + live); cwd field was workspace.current_dir not cwd; toFixed(2).

### 2026-04-01 11:30 — Status bar hook via global status_line.ps1
Dropped per-workspace settings.local.json approach. status_line.ps1 now POSTs to /api/hook/status-line with 50ms HttpClient timeout. Diag tab shows model + token usage from hookData. force-idle now clog()s to console.

### 2026-04-01 11:25 — Cost regex fixes
Updated regex twice: \$(\d+\.\d+)\s+\d+m?s → Total cost:\s+\$(\d+\.\d+)

### 2026-04-01 05:22 — Cost display moved to Diag tab
Removed from dashboard. Added 'Session Costs' table to Diag tab, fetches /api/costs in parallel with /api/stats.

### 2026-04-01 05:08 — Per-session cost tracking
Regex captures cost from PTY data stream ($X.XX pattern). costUsd on SessionInfo, /api/costs endpoint, costs.json persisted on shutdown/loaded on startup. Dashboard shows total + per-card costs. TS builds clean.

### 2026-04-01 04:20 — Add Root button moved to Folders header
Moved from sidebar footer to FOLDERS panel-actions row. Footer div removed.

### 2026-04-01 01:40 — Focused pane border: blue → orange
Changed from var(--border-focus) blue to #d4882a amber-orange. Topbar tint updated to match. Global --border-focus untouched.

### 2026-03-31 14:22 — Pane topbar tweaks: VS Code btn + identity click
Moved VS Code button to left side (after preset badge). Click pane identity → switches feed panel via custom event.

### 2026-03-31 13:55 — Revision: brighter highlight + always-visible VS Code
Session row highlight bumped to rgba(0,122,204,0.22). VS Code pane button now always visible (not hover-only).

### 2026-03-31 13:50 — Session row highlight + pane topbar VS Code button
Active row highlight rgba(0,122,204,0.12), VS Code </> button in pane topbar (hover-to-show). Both revised shortly after.

### 2026-03-31 14:01 — Claude --resume in context menus
Right-click absent AI tag → Resume session + Choose preset. Pane context menu → Resume at top. openFolder now accepts args array passed to server.

### 2026-03-31 05:10 — Pane topbar AI preset label
Implemented milo's spec: preset icon+name badge in pane topbar for AI sessions. Frontend-only. Verified by milo.

### 2026-03-31 05:00 — Layer 3 closed + milo sync
Removed Layer 3 (context pressure) from tracker — superseded by other solutions. Synced status with milo (new UI coordinator). milo picked up preset label, will nudge Rajan on restart.

### 2026-03-31 04:35 — Resume-aware startup injection
Resumed sessions get "Session resumed. Restart any loops or crons..." instead of silence. Fresh sessions still get "hi". Commits b4b41f1, 6a1cd5f.

### 2026-03-31 00:30 — Feed toolbar: sort, sender filter, search, thread collapse
4 controls in toolbar row. Text search, sender dropdown, sort toggle, thread collapse. Commit fbb0de3.

### 2026-03-31 — Feed panel bug fixes (batch)
Cache-bust /who fetch (7d6861e), default C:\ root (8c2355e), --help flag (136c19f), unread badge alignment (5cf73a3), compact diag table (17296e3), expand/collapse all buttons (216196c), identity toggle (78a1c47), skip re-render if data unchanged (3a3b1fa), picker stays open during poll (9e9e59b), resize perf + no max-width (e1d616a, 03fb4c5, 6d28c7b), expand state preserved across poll (bfdeddb).

### 2026-03-31 — Emcom feed panel redesign (neo-terminal)
IBM Plex Mono, phosphor green accents, sender-colored accent bars, CSS animations, noise texture, thread viz, XSS prevention, scroll preservation. Commit f9e0c2e.

### 2026-03-31 02:30 — Feed identity picker in UI
Dropdown from /who, localStorage, --feed-identity removed. Commit 962e205.



## Recent
### 2026-03-30 22:00 — Drag-to-move panes + layout presets
Drag pane topbar → 4 drop zones on other panes → insert on that edge. ⊞ layout button on active tab: Auto/2-col/3-col/2-top+1-bottom/1-top+2-bottom/Large-left+stack. appendLeafToTree preserves manual layouts. DevTools-verified. Commit 6296387.

### 2026-03-30 16:15 — Emcom feed: fix endpoint /email/all + REST-only clarification
No CLI, REST-only via EmcomClient. Fixed endpoint /email?limit → /email/all (from frost's source). Commit f25c199.

### 2026-03-30 15:30 — Checkpoint improvements + ctrl+v paste + emcom feed panel
Light 30m→2h, full 3h→4h; light prompts no git; next time in prompt. Ctrl+v paste in AI sessions. Collapsible feed panel right side, 10s poll, thread-grouped. Commit 055b315.

### 2026-03-30 03:10 — Quick Access panel: status dots + spacing fix
Replace stars with blinking status dots (matches Sessions panel). Fixed dot-to-name margin-right: 6px. Verified with DevTools. Commits 8fdb0ef, dbdeef2.

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
2. Root folder indent alignment (low priority)
