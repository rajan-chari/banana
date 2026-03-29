# Claude-KB.md

Domain knowledge and lessons learned for pty-win.

## Lessons Learned

### 2026-03-22: xterm.js open() can only be called once
xterm.js `term.open(element)` binds the terminal to a DOM element permanently. On workspace re-renders, create a persistent wrapper div on first open, then move it to the new container with `appendChild()`. Never call `open()` twice.

### 2026-03-22: body needs width: 100% for flexbox layout
Without `width: 100%` on `html, body`, the flexbox body shrink-wraps to content width instead of filling the viewport. This caused terminals to appear as narrow columns (~35% width). The fix is a single CSS line.

### 2026-03-22: fitAddon.fit() must sync resize to server
`term.onResize` doesn't always fire when `fit()` changes dimensions (e.g., if the terminal was already at those dims from a previous open). Always explicitly send a resize WebSocket message after every `fit()` call via a `fitAndSync()` helper.

### 2026-03-22: Dead sessions must be cleaned up on server
When a session dies (Claude exits), the server keeps it as "dead". If the user tries to reopen the same folder, the server returns 409 (name conflict). Fix: `autoRemoveDeadSession()` must DELETE from server, and `openFolder()` must clean up dead sessions before creating new ones.

### 2026-03-22: Workspace persistence requires re-render on WS connect
Workspaces are saved to localStorage, but terminals aren't. After page reload, the workspace layout is restored but terminals need the `sessions` WebSocket message to arrive before they can render. The `sessions` handler must call `renderActiveWorkspace()` (not just dashboard).

### 2026-03-22: Prune orphaned workspace leaves on session list update
If a session dies between page loads (server restarted), the workspace layout may reference sessions that no longer exist. When the `sessions` WS message arrives, compare leaf names against server session list and remove orphans via `buildBalancedTree()`.

### 2026-03-22: Double-click rename needs delayed single-click
Tab single-click switches workspace (calls `renderTabs()` which destroys DOM). Double-click to rename can't fire because the DOM element is gone after the first click. Fix: delay single-click by 250ms, cancel it if double-click fires within that window.

### 2026-03-22: Initial PTY dimensions should match browser
Server spawns PTY at 120x40 by default. Browser terminal may be 200x45. The mismatch causes Claude to render at 120 cols, leaving empty space. Fix: pass `cols`/`rows` in `POST /api/sessions` estimated from the workspace area dimensions.

### 2026-03-22: pty-win is npm-linked globally
`npm link` was run in the project directory, creating global shims in `AppData/Roaming/npm/`. The `pty-win` command is available from any directory. Since it's a symlink, `npm run build` updates it automatically — no re-linking needed. To run: `pty-win`, `pty-win --port 3602 --root "C:\some\project"`.

### 2026-03-22: Paired sessions (Claude + PowerShell) use pane groups
A folder can have both a Claude session (`myproject`) and a PowerShell session (`myproject~pwsh`). The tiling tree leaf still references the group name (bare folder basename). `state.paneGroups` maps group → `{claude?, pwsh?, activeType}` and is rebuilt from the session list on every WS `sessions` message. The pane header shows toggle buttons (`C` / `>_`) only when both session types exist. Key invariant: `killSession` and `autoRemoveDeadSession` must check for a living sibling before removing the tiling leaf — only remove when the entire group is dead.

### 2026-03-22: Sidebar folder matching must use full paths, not basenames
`refreshTreeRunningState()` originally matched by basename only, causing false positives across roots. Fix: tree nodes now store `data-path` (normalized full path) and matching uses `normPath(session.workingDir)` against it. Green folder names are back, correctly path-matched. The function also refreshes unread dots dynamically.

### 2026-03-22: Claude --continue for session resume on server restart
`recreateOrphanedSessions()` now passes `args: ["--continue"]` for Claude sessions. This makes Claude resume the most recent conversation for that working directory automatically. The startup kick (`"hi\r"`) must be skipped for resumed sessions — `session.ts` checks `config.args` for `--continue`/`-c` and suppresses `needsStartupKick`.

### 2026-03-22: VS Code open-editor endpoint is fire-and-forget
`POST /api/open-editor` runs `code <path>` via `execFile` with `shell: true`. Response is sent immediately (before `code` finishes launching). No PTY session needed — VS Code is a standalone process.

### 2026-03-23: Root folders must have same capabilities as child folders
Root labels in the sidebar initially only had expand/collapse. User expects parity: play, pwsh, VS Code buttons, indicators, green name, unread dots — all identical to child folders. Root names use semibold (600) for subtle visual distinction. Server endpoint `GET /api/folder-info` provides metadata for a single directory (indicators are fetched async).

### 2026-03-23: Sessions panel — consolidated rows per pane group
The sessions panel iterates `state.paneGroups` (not `state.sessions`) so Claude + PowerShell for the same folder appear as one row. Tags (`▶` for Claude, `>_` for pwsh) are bright when alive, dim red when absent. Dim tags are clickable to start that session type. Indicators use `state.folderInfoCache` (Map of normPath → folder-info) to avoid re-fetching `/api/folder-info` on every render. CSS padding/border-radius must be on the base `.cmd-tag` class (not just `.absent`) to keep alive and absent tags aligned.

### 2026-03-23: Sidebar uses two collapsible panels (SESSIONS + FOLDERS)
The sidebar now has two panels with matching `.panel-header` design: SESSIONS (above) and FOLDERS (below). Each has an arrow toggle, title, count badge, and collapse state persisted to localStorage. The FOLDERS panel wraps the old `#folder-tree` div and holds the collapse-all/refresh buttons in `.panel-actions`. The folders panel uses `flex: 1` + `flex-direction: column` to fill remaining sidebar space; its `.panel-body` overrides `max-height: none`.

### 2026-03-24: Folder indicators must use .indicator-slot wrapper
Folder tree indicators were added directly to the row with `margin-left: 4px` each, while sessions panel used a `.indicator-slot` flex wrapper with `gap: 4px` and `margin-left: 0` on children. This caused subtle spacing differences. Fix: wrap folder indicators in the same `.indicator-slot` div. General rule: when two panels show the same elements, use identical DOM structure and CSS classes.

### 2026-03-24: CSS scoped to .session-row won't apply to shared components
When `appendRowActions()` was extracted as a shared helper for both panels, `.session-row .cmd-tag` styles (font-size, padding) didn't apply to folder rows. Folder tags inherited 13px from parent instead of the intended 9px. Fix: unscope shared CSS selectors (`.cmd-tag`, `.cmd-tag.alive`, `.cmd-tag.absent`, `.cmd-tag.code`) so they apply globally. Only scope styles that genuinely differ between contexts (e.g., `.session-row .cmd-tag.absent` if folders needed different absent styling — but they don't anymore).

### 2026-03-24: Shell sessions must not get emcom pollers
Both Claude and PowerShell sessions for the same folder were getting emcom pollers (both auto-detected `identity.json`). When pwsh went idle, emcom prompts were injected into PowerShell. Fix: skip identity detection for `command === "pwsh"` in `POST /api/sessions`.

### 2026-03-24: spawn detached:true breaks Ctrl+C on Windows
`spawn("code", [path], { detached: true, ... })` creates a new process group that interferes with console signal handling. The pty-win server couldn't be stopped with Ctrl+C. Fix: remove `detached: true`, use only `windowsHide: true` + `child.unref()`. Also made shutdown more aggressive: `ws.terminate()` instead of `ws.close()`, 2s force exit timeout.

### 2026-03-23: VS Code launch on Windows — use spawn with windowsHide
`execFile("cmd.exe", ["/c", "start", "", "code", path])` opens a visible cmd.exe window. Fix: use `spawn("code", [path], { shell: true, stdio: "ignore", windowsHide: true })` and call `child.unref()`. Do NOT use `detached: true` (see lesson above).

### 2026-03-23: WebSocket close listeners must be consolidated
`attachSessionToWs()` adds a `close` listener per session per WS client. With 11+ sessions this triggers `MaxListenersExceededWarning`. Fix: use a `wsSessionCleanups` Map to batch all cleanup functions per WS into a single `close` listener.

### 2026-03-23: Move pane between workspaces via right-click
Pane topbar has a `contextmenu` handler that builds a dynamic menu listing all other workspaces + "New workspace". `movePaneToWorkspace(groupName, fromWs, toWs)` removes from source layout via `removeSessionFromLayout()`, adds to target via `getLeafList()` + `buildBalancedTree()`, then updates tab names and saves.

### 2026-03-23: Unread count must have a single source of truth
`unreadCount` was double-counted: server-side `onNewMessages` incremented it, then `onUnreadCount` (from poller) also set it. Frontend `notification` handler also incremented on top of `status` handler. Fix: poller's `onUnreadCount` callback is the sole authority — it reports the actual emcom server count each poll. `onNewMessages` no longer touches `unreadCount`. Frontend `notification` handler no longer increments — just triggers re-render. Also: emcom-server `add_tags("handled")` must remove `unread` tag (commit c72d0ca in emcom repo).

### 2026-03-24: Multi-word commands must be split for Windows PTY spawn
`config.command` like `"agency cc"` was passed as a single string in `["/c", config.command, ...args]`. node-pty quotes it, making cmd.exe look for a program literally named `"agency cc"`. Fix: `config.command.split(/\s+/)` before building the args array so `"agency cc"` becomes `["agency", "cc"]`.

### 2026-03-24: Async folder-info fetch must patch DOM — applies to ALL panels
The root folder async fetch bug (fetch stores to cache but never updates rendered DOM) also affected the sessions panel. Any panel that renders indicators from `state.folderInfoCache` and fetches async must patch the DOM in the `.then()` callback. This is now done in three places: root labels, session rows, and (already correct) child folder nodes which get data from the tree API response.

### 2026-03-23: Root folder-info fetch must update DOM in-place
Root folders get their indicator data (CLAUDE.md, identity.json) via async `/api/folder-info` fetch, unlike child folders which get it from the `/api/folders` tree response. The fetch stored to `state.folderInfoCache` but never updated the DOM, so root indicators were always hidden. Fix: in the fetch `.then()` callback, query the label's `.indicator-slot` and `.identity-tag` elements and toggle classes/text directly. Don't re-render the whole tree — just patch the specific elements.

### 2026-03-27: CSS display:none on menu items causes click target shifting
Hiding context menu items with `display:none` collapses them, causing items below to shift up and occupy their click positions. A user clicking item A can unknowingly click item B (which shifted up). Fix: use a `.ctx-disabled` class with `opacity: 0.35; pointer-events: none` instead — items stay in the DOM at their position, just visually greyed out.

### 2026-03-27: CSS selectors scoped to specific parent classes miss new parent classes
When adding a new container (e.g., `.quick-access-row`) that reuses shared components, check all CSS selectors that target those components. Selectors like `.session-row .identity-tag, .tree-node .identity-tag` won't apply to `.quick-access-row .identity-tag` — you must explicitly add the new parent to each rule.

### 2026-03-27: gap: vs margin-left: on flex rows causes column misalignment
Using `gap: 6px` on one row type and `margin-left: 2px` on another causes pill columns to be spaced differently. When two row types (e.g., quick-access-row and session-row) need aligned columns, they must use identical spacing mechanisms. Also: pill elements without `min-width` render at variable widths based on text content (`>_` vs `</>`), breaking column alignment. Fix: add `min-width` + `inline-flex` centering to all fixed-column elements.

### 2026-03-27: JS template literals don't need \\ before $ (unless followed by {)
In JS template literals, `$hwnd` is the literal string `$hwnd` — template interpolation only triggers on `${...}`. Using `\\$hwnd` produces `\$hwnd` which broke a PowerShell script embedded in a template literal. Only escape `$` when it precedes `{` for interpolation. This caused the VS Code launch button to be completely broken.

### 2026-03-29: onnxruntime-node seq(map) output requires double cast
When an ONNX model outputs `seq(map(string, float))` (e.g. sklearn pipeline probability maps), the TypeScript type for `tensor.data[0]` is `string | number | bigint` — it doesn't know about map types. Cast with `as unknown as Record<string, number>` to access keyed probabilities. This is a known gap in the ort type definitions, not a runtime issue.

### 2026-03-22: Dynamic emcom attach — watch for identity.json
If a Claude session starts before `emcom register` runs, there's no `identity.json` yet so no emcom poller is created. Fix: `PtySession.watchForIdentity()` polls every 5s for `identity.json` to appear, then calls `attachEmcom()` to create and start the poller dynamically. One limitation: `--append-system-prompt` (EMCOM_PREAMBLE) can't be injected retroactively — it's baked into Claude's launch args. Sessions that gain emcom mid-flight won't have the anti-double-polling instruction.
