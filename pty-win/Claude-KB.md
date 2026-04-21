# Claude-KB.md

Domain knowledge and lessons learned for pty-win.

Shared knowledge (xterm.js quirks, node-pty Windows, CSS layout traps, emcom integration, Claude Code hooks) has been migrated to team-wiki at `c:\s\projects\work\teams\working\team-wiki\tooling\`. Only workspace-specific lessons remain here.

## Team Rules

### Independent Verification for Community-Facing Content
All community-facing content (GitHub comments, PRs, docs, samples) must be independently verified before posting. Author prepares, a different agent tests/reviews. No self-verification.
- **Code** (PRs, samples): must compile + run, tested by a different agent
- **Non-code** (comments, recommendations): fact-checked by a different agent
- **Exception**: low-risk responses (ack issues, asking for repro) exempt
- **Scope**: GitHub/public only. Internal emcom/tracker/briefing excluded.

Source: team-manual.md commit d83df24.

## Lessons Learned

### 2026-03-22: Dead sessions must be cleaned up on server
When a session dies (Claude exits), the server keeps it as "dead". If the user tries to reopen the same folder, the server returns 409 (name conflict). Fix: `autoRemoveDeadSession()` must DELETE from server, and `openFolder()` must clean up dead sessions before creating new ones.

### 2026-03-22: Workspace persistence requires re-render on WS connect
Workspaces are saved to localStorage, but terminals aren't. After page reload, the workspace layout is restored but terminals need the `sessions` WebSocket message to arrive before they can render. The `sessions` handler must call `renderActiveWorkspace()` (not just dashboard).

### 2026-03-22: Prune orphaned workspace leaves on session list update
If a session dies between page loads (server restarted), the workspace layout may reference sessions that no longer exist. When the `sessions` WS message arrives, compare leaf names against server session list and remove orphans via `buildBalancedTree()`.

### 2026-03-22: Double-click rename needs delayed single-click
Tab single-click switches workspace (calls `renderTabs()` which destroys DOM). Double-click to rename can't fire because the DOM element is gone after the first click. Fix: delay single-click by 250ms, cancel it if double-click fires within that window.

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

### 2026-03-23: WebSocket close listeners must be consolidated
`attachSessionToWs()` adds a `close` listener per session per WS client. With 11+ sessions this triggers `MaxListenersExceededWarning`. Fix: use a `wsSessionCleanups` Map to batch all cleanup functions per WS into a single `close` listener.

### 2026-03-23: Move pane between workspaces via right-click
Pane topbar has a `contextmenu` handler that builds a dynamic menu listing all other workspaces + "New workspace". `movePaneToWorkspace(groupName, fromWs, toWs)` removes from source layout via `removeSessionFromLayout()`, adds to target via `getLeafList()` + `buildBalancedTree()`, then updates tab names and saves.

### 2026-03-24: Async folder-info fetch must patch DOM — applies to ALL panels
The root folder async fetch bug (fetch stores to cache but never updates rendered DOM) also affected the sessions panel. Any panel that renders indicators from `state.folderInfoCache` and fetches async must patch the DOM in the `.then()` callback. This is now done in three places: root labels, session rows, and (already correct) child folder nodes which get data from the tree API response.

### 2026-03-23: Root folder-info fetch must update DOM in-place
Root folders get their indicator data (CLAUDE.md, identity.json) via async `/api/folder-info` fetch, unlike child folders which get it from the `/api/folders` tree response. The fetch stored to `state.folderInfoCache` but never updated the DOM, so root indicators were always hidden. Fix: in the fetch `.then()` callback, query the label's `.indicator-slot` and `.identity-tag` elements and toggle classes/text directly. Don't re-render the whole tree — just patch the specific elements.

### 2026-03-27: JS template literals don't need \\ before $ (unless followed by {)
In JS template literals, `$hwnd` is the literal string `$hwnd` — template interpolation only triggers on `${...}`. Using `\\$hwnd` produces `\$hwnd` which broke a PowerShell script embedded in a template literal. Only escape `$` when it precedes `{` for interpolation. This caused the VS Code launch button to be completely broken.

### 2026-03-29: onnxruntime-node seq(map) output requires double cast
When an ONNX model outputs `seq(map(string, float))` (e.g. sklearn pipeline probability maps), the TypeScript type for `tensor.data[0]` is `string | number | bigint` — it doesn't know about map types. Cast with `as unknown as Record<string, number>` to access keyed probabilities. This is a known gap in the ort type definitions, not a runtime issue.

### 2026-04-07: Making onnxruntime-node optional via dynamic import in worker
Move to `optionalDependencies` in package.json. In the worker thread (ml-worker.ts), use `await import("onnxruntime-node")` wrapped in try/catch. If import fails, register a message handler that returns `{ error: "not installed" }` so the main thread's ML pipeline degrades gracefully (returns null, heuristic + hooks remain primary idle detection).

### 2026-04-01: Cost regex must match both duration formats
Status line outputs `$9.97 2m34s` (minutes+seconds) and `$0.50 553ms` (milliseconds). Regex `/\$(\d+\.\d+)\s+\d+m\d*s/` handles both. The `\d*` after `m` optionally matches the seconds digits.

### 2026-04-04: Work tracker CLI
`tracker` command is in PATH. Create items with `tracker create --repo X --number N --title 'desc' --severity normal|high|critical --assigned NAME`. Update with `tracker update repo#N --status STATUS --comment 'reason'`. States: new → triaged → investigating → findings-reported → decision-pending → pr-up → testing → ready-to-merge → merged/deferred/closed. Set `--blocker 'who/what'` when blocked. Tracker panel visible in pty-win Dashboard tab.

### 2026-04-15: Bump package.json version on every rebuild
During debug/iteration cycles, bump the patch version in `package.json` before each `npm run build`. The `/api/config` endpoint returns `build.version` + `build.commit` + `build.startedAt`, so the user can instantly verify the running server matches the latest code. Stale builds waste debugging time — a version mismatch is the first thing to check when a fix "doesn't work."

### 2026-04-13: Playwright verification must show real data, not just structure
When using Playwright to verify UI changes that display data, the test instance must have a working backend with real data. Verifying that a column header appears is not confirmation — the cells must show actual values. The tracker field name bug (last_activity vs last_github_activity) was missed because the Playwright test on port 3701 had no emcom backend, so only "CONNECTION FAILED" was shown instead of actual tracker items.
