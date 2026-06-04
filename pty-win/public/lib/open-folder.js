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
 * Clean up a dead session: DELETE on the server (swallowing failure to
 * match prior behavior) and tear down any local terminal entry. Leaves
 * `state` in a consistent post-removal state.
 *
 * @param {string} sessionName
 * @param {{
 *   state: { sessions: Map<string, unknown>, terminals: Map<string, { resizeObserver?: { disconnect: () => void }, term: { dispose: () => void }, wrapperEl?: { remove: () => void } }> },
 *   fetchFn?: typeof fetch
 * }} deps
 */
export async function cleanupDeadSession(sessionName, deps) {
  const fetcher = deps.fetchFn || fetch.bind(window);
  await fetcher(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: "DELETE" }).catch(() => {});
  deps.state.sessions.delete(sessionName);
  const entry = deps.state.terminals.get(sessionName);
  if (entry) {
    entry.resizeObserver?.disconnect();
    entry.term.dispose();
    entry.wrapperEl?.remove();
    deps.state.terminals.delete(sessionName);
  }
}

/**
 * Attach a freshly-created session to a workspace that already contains
 * its sibling (the other of the claude/pwsh pair). Mutates the pane
 * group, switches the workspace, and re-renders.
 *
 * Replaces the two near-duplicate branches in the original openFolder
 * by parameterizing on `isPwsh`.
 *
 * @param {{
 *   siblingWs: { id: string },
 *   baseName: string,
 *   sessionName: string,
 *   isPwsh: boolean,
 *   state: { paneGroups: Map<string, { activeType: string, claude?: string|null, pwsh?: string|null }> },
 *   switchToWorkspace: (id: string) => void,
 *   renderActiveWorkspace: () => void,
 *   focusPane: (name: string) => void
 * }} args
 */
export function attachToSiblingWorkspace(args) {
  const type = args.isPwsh ? "pwsh" : "claude";
  const pg = args.state.paneGroups.get(args.baseName) || { activeType: type };
  pg[type] = args.sessionName;
  pg.activeType = type;
  args.state.paneGroups.set(args.baseName, pg);
  args.switchToWorkspace(args.siblingWs.id);
  args.renderActiveWorkspace();
  args.focusPane(args.baseName);
}
