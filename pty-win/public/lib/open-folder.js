// @ts-check
// Helpers extracted from openFolder() in app.js (Round 21).
//
// The orchestrating openFolder remains in app.js because it threads
// app-wide singletons (state, workspace mutators, focus helpers). These
// helpers are kept dependency-injected so they can be unit-tested
// without touching the real app.

const APPROX_CHAR_WIDTH = 7.6;      // Consolas 13px advance
const APPROX_CHAR_HEIGHT = 18;
const TABBAR_HEIGHT = 35;
const TOPBAR_HEIGHT = 26;
const STATUSBAR_HEIGHT = 22;
const BORDER_SLACK = 4;
const MIN_COLS = 80;
const MIN_ROWS = 24;
const RESUME_ON_RESTART_COMMANDS = new Set(["claude", "agency cc", "agency cp", "copilot", "pi"]);

/**
 * Compute the display name and the canonical session name for an open
 * request. Session name for pwsh has a "~pwsh" suffix; claude/other uses
 * the base name as-is.
 *
 * @param {string} folderPath
 * @param {string|null|undefined} folderName
 * @param {string|null|undefined} command
 * @returns {{ baseName: string, sessionName: string, isPwsh: boolean }}
 */
export function computeSessionNames(folderPath, folderName, command) {
  const baseName = folderName || folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;
  const isPwsh = command === "pwsh";
  const sessionName = isPwsh ? baseName + "~pwsh" : baseName;
  return { baseName, sessionName, isPwsh };
}

/**
 * Estimate cols/rows for a freshly-spawned PTY given the workspace
 * area's clientWidth/clientHeight. Values are floored to integers and
 * clamped to a minimum so the terminal is always usable.
 *
 * @param {number} clientWidth
 * @param {number} clientHeight
 * @returns {{ cols: number, rows: number }}
 */
export function estimatePtyDims(clientWidth, clientHeight) {
  const availW = clientWidth - BORDER_SLACK;
  const availH = clientHeight - TABBAR_HEIGHT - TOPBAR_HEIGHT - STATUSBAR_HEIGHT - BORDER_SLACK;
  const cols = Math.max(MIN_COLS, Math.floor(availW / APPROX_CHAR_WIDTH));
  const rows = Math.max(MIN_ROWS, Math.floor(availH / APPROX_CHAR_HEIGHT));
  return { cols, rows };
}

/**
 * Build the POST /api/sessions request body.
 * Falls back to `getDefaultAiCommand()` if no command was specified.
 *
 * @param {{
 *   folderPath: string,
 *   cols: number,
 *   rows: number,
 *   command?: string|null,
 *   args?: string[],
 *   getDefaultAiCommand: () => string
 * }} args
 */
export function buildCreateSessionRequest(args) {
  /** @type {{workingDir: string, cols: number, rows: number, command?: string, args?: string[]}} */
  const body = { workingDir: args.folderPath, cols: args.cols, rows: args.rows };
  body.command = args.command || args.getDefaultAiCommand();
  if (args.args && args.args.length) body.args = args.args;
  return body;
}

/**
 * @param {{ error?: unknown, detail?: unknown } | null | undefined} err
 */
export function formatCreateSessionError(err) {
  const error = typeof err?.error === "string" ? err.error : "Failed to create session";
  const detail = typeof err?.detail === "string" && err.detail.trim() ? err.detail.trim() : "";
  return detail ? `${error}: ${detail}` : error;
}

/**
 * Build the POST /api/sessions body used when restoring an orphaned workspace
 * pane after a pty-win server restart.
 *
 * @param {{ workingDir?: string, command?: string|null }} meta
 * @param {number} cols
 * @param {number} rows
 * @returns {{ workingDir: string | undefined, cols: number, rows: number, command?: string, args?: string[] }}
 */
export function buildRecreateSessionRequest(meta, cols, rows) {
  /** @type {{ workingDir: string | undefined, cols: number, rows: number, command?: string, args?: string[] }} */
  const body = { workingDir: meta.workingDir, cols, rows };
  if (meta.command && meta.command !== "claude") body.command = meta.command;
  if (!meta.command || RESUME_ON_RESTART_COMMANDS.has(meta.command)) {
    body.args = ["--continue"];
  }
  return body;
}

/**
 * Clean up a dead session: DELETE on the server (swallowing failure to
 * match prior behavior) and tear down any local terminal entry. Leaves
 * `state` in a consistent post-removal state.
 *
 * @param {string} sessionName
 * @param {{
 *   state: { terminals: Map<string, { resizeObserver?: { disconnect: () => void }, term: { dispose: () => void }, wrapperEl?: { remove: () => void } }> },
 *   sessions: { remove: (name: string) => boolean },
 *   fetchFn?: typeof fetch
 * }} deps
 */
export async function cleanupDeadSession(sessionName, deps) {
  const fetcher = deps.fetchFn || fetch.bind(window);
  await fetcher(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: "DELETE" }).catch(() => {});
  deps.sessions.remove(sessionName);
  const entry = deps.state.terminals.get(sessionName);
  if (entry) {
    entry.resizeObserver?.disconnect();
    entry.term.dispose();
    entry.wrapperEl?.remove();
    deps.state.terminals.delete(sessionName);
  }
}

/**
 * Optimistically insert the just-created session into the local store
 * (Phase 9d) so the upcoming render finds it before the WS `sessions`
 * snapshot arrives. Also flips `activePaneTypes` for the group to the
 * newly-opened tab, and triggers a reconcile so the activePaneTypes
 * store stays consistent with the new membership (flip-to-other +
 * stale-prune rules).
 *
 * Order matters: `activePaneTypes.set` BEFORE `sessions.add` so any
 * synchronous `sessions.onChange` observer sees the intended active type.
 *
 * @param {{
 *   baseName: string,
 *   sessionName: string,
 *   isPwsh: boolean,
 *   command: string,
 *   folderPath: string,
 *   sessions: { add: (info: any) => boolean },
 *   activePaneTypes: { set: (name: string, type: "claude"|"pwsh") => void },
 *   reconcilePaneActiveTypes: () => void,
 * }} args
 */
export function optimisticallyAddNewSession(args) {
  const type = args.isPwsh ? "pwsh" : "claude";
  args.activePaneTypes.set(args.baseName, type);
  args.sessions.add({
    name: args.sessionName,
    group: args.baseName,
    command: args.command,
    status: "starting",
    workingDir: args.folderPath,
  });
  args.reconcilePaneActiveTypes();
}

/**
 * Place a freshly-created session into a workspace when no sibling
 * workspace exists yet. Either creates a new workspace named after the
 * base name or appends to the active workspace, then switches focus.
 *
 * Mirrors the no-sibling branch of openFolder.
 *
 * @param {{
 *   newWorkspace: boolean,
 *   baseName: string,
 *   createWorkspace: (name: string) => any,
 *   getOrCreateActiveWorkspace: () => any,
 *   addSessionToWorkspace: (wsId: string, name: string) => void,
 *   switchToWorkspace: (id: string) => void,
 *   renderActiveWorkspace: () => void,
 *   focusPane: (name: string) => void,
 *   updateWorkspaceTabName: (ws: any) => void
 * }} args
 */
export function tileNewSessionIntoWorkspace(args) {
  const ws = args.newWorkspace ? args.createWorkspace(args.baseName) : args.getOrCreateActiveWorkspace();
  args.addSessionToWorkspace(ws.id, args.baseName);
  args.switchToWorkspace(ws.id);
  args.renderActiveWorkspace();
  args.focusPane(args.baseName);
  args.updateWorkspaceTabName(ws);
}

/**
 * Attach a freshly-created session to a workspace that already contains
 * its sibling (the other of the claude/pwsh pair). Orchestration only —
 * the optimistic state insertion lives in `optimisticallyAddNewSession`,
 * called from `placeNewSession` BEFORE this branch fires.
 *
 * @param {{
 *   siblingWs: { id: string },
 *   baseName: string,
 *   switchToWorkspace: (id: string) => void,
 *   renderActiveWorkspace: () => void,
 *   focusPane: (name: string) => void
 * }} args
 */
export function attachToSiblingWorkspace(args) {
  args.switchToWorkspace(args.siblingWs.id);
  args.renderActiveWorkspace();
  args.focusPane(args.baseName);
}
