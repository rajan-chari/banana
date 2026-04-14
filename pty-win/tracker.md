# pty-win Work Tracker

Last updated: 2026-04-13 23:51

## In Motion

| Item | Status | Owner | Notes/Links |
|------|--------|-------|-------------|
| Server restart + browser refresh | Needed | Rajan | Server: 6a1cd5f; frontend: fbb0de3 |
| fellow-agents dist pull | Waiting on milo | milo | moss tasks done, milo integrating |

## Watching

| Item | Waiting On | Details | Links |
|------|-----------|---------|-------|
| Root folder indent alignment | Low priority | Root vs child arrow/indent offset may still differ slightly | |
| Drag-and-drop pane reorder | Low priority | Reorder panes within a workspace via drag (tabs done; panes still open) | |

## Completed

| Date | Item | Outcome |
|------|------|---------|
| 2026-04-13 | --host flag for Docker | Default 127.0.0.1, --host 0.0.0.0 for containers |
| 2026-04-13 | Tracker Activity field name fix | last_activity → last_github_activity |
| 2026-04-13 | Tracker panel alignment + Activity column | flex→grid fix, sticky header, Activity column for last_activity |
| 2026-04-09 | Scroll jump + focus loss fix | Hooks→broadcastStatus, skip DOM rebuild on status-only, focus restore |
| 2026-04-08 | Shell button cross-platform fix | pwsh→bash on Linux/Mac, /api/config exposes platform |
| 2026-04-07 | One-click deploy packaging | node-pty prebuilt, onnxruntime optional, CI workflow |
| 2026-04-07 | Cost history sampling | 60s interval, 24h cap, /api/cost-history, persist on shutdown |
| 2026-04-07 | Playwright MCP testing convention | Port 3650+ for testing, never 3600 production. Persisted to KB |
| 2026-04-07 | Injection format cleanup | Timestamps on all injections, constants→functions, no leading whitespace |
| 2026-04-04 | Reverted prefersReducedMotion from hooks | User-level setting, not per-session |
| 2026-04-04 | Hook JSON fix: {} for Zod validation | Claude Code rejects custom fields in hook responses |
| 2026-04-04 | Tracker panel + proxy endpoint | New tab, grouped by status, 10s refresh, /api/emcom-proxy/tracker |
| 2026-04-04 | Coverage metrics (@vitest/coverage-v8) | Extracted modules 96-100%, overall 11% (I/O code untested by design) |
| 2026-04-04 | Session-state tests (35) | Pure state machine extraction, 79 total tests |
| 2026-04-04 | Test suite: 44 tests (tiling + paneGroups) | Extracted pure functions, vitest, safety net for scariest code paths |
| 2026-04-04 | Claude Code hooks for idle detection | Stop/Notify/PromptSubmit hooks replace heuristic; per-project settings.local.json; heuristic kept as fallback |
| 2026-04-03 | Shutdown grace 120s → 240s | Agents need more time to commit+push on shutdown |
| 2026-04-03 | Cost in checkpoint prompts | Appends "Session cost: $X.XX" so agents are cost-aware |
| 2026-04-03 | Last Active column in dashboard | Shows relative time since last PTY output (lastActiveMs in SessionInfo) |
| 2026-04-02 | Dashboard cost column → last | Session|Status|cb/s|KB/s|Cost order |
| 2026-04-02 | Drag-and-drop sessions onto tabs | Session/folder rows draggable, drop on tabs/+/pane area, amber highlight |
| 2026-04-02 | Unfocused pane border → #aaa | Near-white grey for clear visibility |
| 2026-04-02 | Dimmed unfocused pane topbar | #252525 bg, muted text, contrast with focused amber |
| 2026-04-02 | Pane visual separation (3 iterations) | 2px border, 2px gap, dimmed topbar, bg differentiation |
| 2026-04-02 | Dashboard: merged table + collapsible cards | Single table, clickable rows, bright text, collapsible Workspaces section |
| 2026-04-02 | Context-independence in checkpoint prompts | Appended reminder text to light, full, and shutdown injection prompts |
| 2026-04-01 | Unfocused pane border #505050 | Visible edge between panes without competing with orange focus |
| 2026-04-01 | Dashboard redesign: mission control | IBM Plex Mono, amber/cyan, scanline bg, status badges, header strip, stats on top |
| 2026-04-01 | Dashboard + Diag merged | Single tab with cards + stats + costs; Diag tab removed |
| 2026-04-01 | Reverted hook → regex-only | Multi-instance conflict; removed hook endpoint, HookData, PS1 POST |
| 2026-04-01 | Hook bugs fixed (broadcast + regex + cwd) | broadcastSessionList after hookData; dual regex; workspace.current_dir field |
| 2026-04-01 | Status bar hook via global PS1 | POSTs to /api/hook/status-line, 50ms timeout, no per-workspace files |
| 2026-04-01 | Diag tab: model + token usage | hookData drives model ID, ctx%, token counts in cost table |
| 2026-04-01 | Cost regex fixes (×2) | Final: /Total cost:\s+\$(\d+\.\d+)/ |
| 2026-04-01 | force-idle console logging | clog() on force-idle endpoint |
| 2026-04-01 | Cost display in Diag tab | Moved from dashboard; Session Costs table with total row, 5s refresh |
| 2026-04-01 | Per-session cost tracking | Regex cost capture, /api/costs, costs.json persist (needs server restart) |
| 2026-04-01 | Add Root button → Folders header | Moved from sidebar footer to panel-actions row |
| 2026-04-01 | Focused pane border: blue → orange | #d4882a amber-orange, topbar tint matched, --border-focus untouched |
| 2026-03-31 | Pane topbar tweaks (VS Code btn, identity click) | VS Code button moved left, click identity switches feed panel |
| 2026-03-31 | Claude --resume in context menus | Right-click AI tag or pane topbar → Resume session with --resume flag |
| 2026-03-31 | Session row highlight + topbar visibility | Brighter active row (0.22), VS Code button always visible |
| 2026-03-31 | Pane topbar AI preset label | Preset icon+name badge in pane topbar for AI sessions (milo spec) |
| 2026-03-31 | Resume-aware startup injection | Resumed sessions get loop/cron restart kick (→6a1cd5f) |
| 2026-03-31 | Feed toolbar: sort/filter/search/threads | 4 controls in toolbar row (→fbb0de3) |
| 2026-03-31 | Feed panel bug fixes (11 commits) | Resize perf, expand state, picker stability, cache-bust, --help, unread badge, etc. |
| 2026-03-31 | Emcom feed panel redesign | Neo-terminal: IBM Plex Mono, green accents, sender colors, animations (→f9e0c2e) |
| 2026-03-31 | Feed identity picker in UI | Dropdown from /who, localStorage persist, --feed-identity removed (→962e205) |
| 2026-03-30 | Drag-to-move panes + layout presets | Drop zones, insertAdjacentToPane, ⊞ preset menu (→6296387) |
| 2026-03-30 | Emcom feed: fix /email/all endpoint + REST-only | Corrected endpoint from frost's source; no CLI (→f25c199) |
| 2026-03-30 | Checkpoint improvements | Light 2h, full 4h; light no git; next time in prompt (→055b315) |
| 2026-03-30 | Ctrl+V paste in AI sessions | Clipboard paste via attachCustomKeyEventHandler (→055b315) |
| 2026-03-30 | Emcom feed panel (right side) | Collapsible, 10s poll, thread-grouped, unread bold (→055b315) |
| 2026-03-30 | Quick Access: status dots + spacing fix | Stars → blinking dots, margin-right: 6px; DevTools-verified (→dbdeef2) |
| 2026-03-30 | Stagger session startups at boot by repo group | 7s between groups, spreads spawn syscalls + resume floods (→e96c6bd) |
| 2026-03-30 | Perf: batching + async writes + ONNX worker | 16ms WS batch, appendFile async, ONNX on worker_threads (→d921ae0) |
| 2026-03-30 | Diagnostics tab | Fixed "Diag" tab, live stats table, 5s poll, hot-row highlight (→8e59976) |
| 2026-03-30 | Rolling stats collector | 5s window cb/s+bytes/s per session, /api/stats endpoint, 30s clog (→98c94e5) |
| 2026-03-28 | ONNX local inference (Phase 5 final) | runLocalMLInference() via onnxruntime-node; replaces HTTP path (→d7de3df) |
| 2026-03-28 | ML inference HTTP path (Phase 5 initial) | queryMLService() on unknown promptType — superseded by ONNX (→92bb505) |
| 2026-03-28 | Draggable/reorderable workspace tabs | Drag left/right, blue drop indicator, localStorage persist (→41d6247) |
| 2026-03-28 | Heuristic poll interval 250ms → 1s | Matches quiet threshold, reduces redundant checks (→f2068f7) |
| 2026-03-28 | Quick-message popup on AI action button | Click ▶ on running session → floating input → injects text into PTY (→a8a9d4f) |
| 2026-03-28 | Full checkpoint interval 2h → 3h | Per Rajan request (→48e9e9b) |
| 2026-03-28 | ML dataset rolling files + auto_detect cap | 250 records/file, 1000 sample cap, durable across restarts (→36016e6) |
| 2026-03-28 | ML sample throttling | Transition + 60s periodic; lastSavedLabel/lastSavedAt per session (→58ae20a) |
| 2026-03-28 | ML data collection layer | saveMlSample JSONL, auto_detect/force_idle/timeout_flag, applyMLInference stub (→7c007fe) |
| 2026-03-27 | QA column alignment + kill-btn spacer | DevTools-verified pixel-perfect alignment; kill-btn always rendered as spacer (→128dc50) |
| 2026-03-27 | Action button UI polish sprint | Fixed containers, vivid fills, square cmd, QA pills, QA identity/dots (→8b6a9a0) |
| 2026-03-27 | Consistent pill hover for all buttons | play/pwsh/code/absent/kill all get filled pill on hover (869fb54, e7aa911) |
| 2026-03-27 | Fix context menu item shifting | ctx-disabled replaces display:none; pin/fav items no longer misalign (77fb746) |
| 2026-03-27 | Fix VS Code button + logging + scroll | Bad \\$ escaping broke PS script; added clog(); unified scrollbar (49cf4c3, bc8c205) |
| 2026-03-27 | Fix stagger: per-injection offset | scheduleCheckpointInjection() applies offset every round (b86b1f8) |
| 2026-03-27 | Process lifecycle logging | clog() for started/exited/killed with pid, cmd, exit code (b772c8f) |
| 2026-03-27 | Quick Access panel | Pinned folders at top of sidebar, one-click open/focus (605d1e4) |
| 2026-03-27 | VS Code focus fix v2 | Win32 minimize browser before launch — tested working (3285252) |
| 2026-03-27 | Idle-skip fix + verbose logging | Stamp checkpoint time after response, log every timer outcome (089de84, 4154f8f) |
| 2026-03-26 | VS Code focus fix | Exit fullscreen + AppActivate so VS Code appears in front (8d73790) |
| 2026-03-26 | Skip idle checkpoints | Skip checkpoint injection when no activity since last checkpoint |
| 2026-03-26 | Repo-aware checkpoint stagger | Auto-detect git root, stagger checkpoints 10s apart for shared repos |
| 2026-03-25 | Injection tagging | All prompts tagged [pty-win:type:priority:response] (23c03ca) |
| 2026-03-25 | Adopt briefing.md | Replaced session-context.md; updated checkpoint/shutdown injection prompts + CLAUDE.md startup |
| 2026-03-24 | Timestamped console logs | clog() helper: [pty-win HH:MM:SS] on all output (9e425d2) |
| 2026-03-24 | Revert shutdown self-skip | Agent session should save like any other; freeze was from promise bugs (c6cf0ad) |
| 2026-03-24 | Copilot preset + shutdown fix | Added copilot back, fixed premature resolve + missing resolve in shutdown (dd38343) |
| 2026-03-24 | Improved logging + 120s shutdown | [pty-win] console prefix for emcom/checkpoint events, 120s grace with 10s progress (a35a115) |
| 2026-03-24 | Fix copilot --append-system-prompt | Split AI_COMMANDS vs CLAUDE_COMMANDS — copilot doesn't support preamble flag (0f52ee3) |
| 2026-03-24 | Fix idle detection for all AI commands | Heuristic timer had local `isClaude === "claude"` check, missed agency cc (5d9f246) |
| 2026-03-24 | Fix session click focus + force-idle | Same-workspace focus race; force-idle checked only "claude" not all presets (1f38e96) |
| 2026-03-24 | Unified panel styling | Shared appendRowActions(), unscoped .cmd-tag CSS, matching absent/alive states |
| 2026-03-24 | AI launcher with presets | Configurable presets (Claude, Agency CC, Copilot, Agency GH), right-click picker, default persistence |
| 2026-03-24 | Layer 5: graceful shutdown | Ctrl+C injects save into all AI sessions, waits for idle, then exits (27037b3) |
| 2026-03-24 | Fix agency cc launch | Split multi-word commands for Windows cmd.exe args (16c613a) |
| 2026-03-24 | Layer 2: periodic checkpoints | 30-min light + 2-hr full ceremony injection into AI sessions (b62cc5c) |
| 2026-03-24 | Layer 4: dirty state detection | git status on exit → red toast warning in frontend (b62cc5c) |
| 2026-03-24 | Sessions panel indicator fix | Async folder-info fetch now patches DOM in-place (8c4cce1) |
| 2026-03-24 | Force-idle context menu | Right-click session/folder row → force idle + emcom inject (8f0340c) |
| 2026-03-24 | Root async indicator update | folder-info fetch patches DOM in-place for root folders (a3a9b2a) |
| 2026-03-24 | Identity font + @ prefix | 12px font, removed @ prefix across all locations (b614c4f) |
