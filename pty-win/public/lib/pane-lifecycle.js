// @ts-check
//
// Pane lifecycle runtime — extracted from app.js as Phase 4d of the
// modularization campaign. Owns the kill/close/dispose/refocus/
// auto-remove flow for panes and their underlying terminal entries.
//
// Public surface:
//   - killSession(name)          — user-initiated close (X button, etc.)
//   - closeFocusedPane()         — Ctrl+Shift+W on the focused pane
//   - showDirtyWarning(name, wd) — dirty-exit toast
//   - autoRemoveDeadSession(n)   — invoked from the WS dispatcher 1.5s
//                                  after a session goes dead
//
// killSession and autoRemoveDeadSession share sibling-detection logic;
// the duplication is intentional for now (Phase 4g cleanup will dedup).
// We copied both bodies verbatim from app.js to keep this extraction
// behaviour-preserving.

import { isDashboardMode } from "./navigation.js";

/**
 * @typedef {{ status?: string }} SessionInfo
 *
 * @typedef {Object} PaneLifecycleState
 * @property {Map<string, any>} sessions
 * @property {Map<string, any>} sessionMeta
 * @property {Map<string, any>} paneGroups
 * @property {Map<string, { term: any, resizeObserver?: { disconnect: () => void }, wrapperEl?: { remove: () => void } }>} terminals
 * @property {Array<{ id: string, layout: any }>} workspaces
 * @property {string | null} activeWorkspaceId
 * @property {string | null} focusedPane
 *
 * @typedef {Object} PaneLifecycleDeps
 * @property {PaneLifecycleState} state
 * @property {{
 *   byName: (name: string) => any,
 *   has: (name: string) => boolean,
 * }} sessions
 * @property {Document} [doc]
 * @property {{
 *   fetch: typeof fetch,
 *   setTimeout: typeof setTimeout
 * }} [env]
 * @property {{
 *   removeSessionFromLayout: (layout: any, name: string) => any,
 *   getLeafList: (layout: any) => string[],
 *   buildBalancedTree: (leaves: string[]) => any,
 *   treeContains: (layout: any, name: string) => boolean
 * }} layout
 * @property {{
 *   saveSessionMeta: () => void,
 *   escapeHtml: (s: string) => string,
 *   rebuildPaneGroups: () => void,
 *   refreshTreeRunningState: () => void,
 *   updateWorkspaceTabName: (ws: any) => void,
 *   setWorkspaceLayout: (ws: any, tree: any) => void,
 *   transactionFn: (fn: () => void) => void,
 *   focus: {
 *     get: () => string | null,
 *     set: (name: string | null) => boolean,
 *     clear: () => boolean,
 *     refocusToFirstLeaf: () => string | null,
 *   },
 * }} helpers
 * @property {{
 *   renderActiveWorkspace: () => void,
 *   renderTabs: () => void,
 *   renderDashboard: () => void
 * }} views
 */

/**
 * @param {PaneLifecycleDeps} deps
 */
// eslint-disable-next-line max-lines-per-function
export function createPaneLifecycle(deps) {
  const { state, layout, helpers, views } = deps;
  const sessions = deps.sessions;
  const doc = deps.doc || document;
  const env = {
    fetch: deps.env?.fetch || fetch.bind(globalThis),
    setTimeout: deps.env?.setTimeout || setTimeout.bind(globalThis),
  };

  function closeFocusedPane() {
    const focused = helpers.focus.get();
    if (!focused) return;
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    if (!ws) return;
    helpers.setWorkspaceLayout(ws, layout.removeSessionFromLayout(ws.layout, focused));
    helpers.focus.refocusToFirstLeaf();
    views.renderActiveWorkspace();
  }

  /**
   * @param {string} sessionName
   */
  async function killSession(sessionName) {
    try {
      await env.fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: "DELETE" });
    } catch {}

    // Determine group — only remove tiling leaf if no sibling alive
    const groupName = sessionName.replace(/~pwsh$/, "");
    const siblingName = sessionName.endsWith("~pwsh") ? groupName : groupName + "~pwsh";
    const siblingAlive = sessions.has(siblingName) && sessions.byName(siblingName)?.status !== "dead";

    if (!siblingAlive) {
      helpers.transactionFn(() => {
        for (const ws of state.workspaces) {
          helpers.setWorkspaceLayout(ws, layout.removeSessionFromLayout(ws.layout, groupName));
        }
      });
    } else {
      const pg = state.paneGroups.get(groupName);
      if (pg) pg.activeType = sessionName.endsWith("~pwsh") ? "claude" : "pwsh";
    }

    disposeTerminalEntry(sessionName);

    state.sessions.delete(sessionName);
    state.sessionMeta.delete(sessionName);
    helpers.saveSessionMeta();
    helpers.rebuildPaneGroups();
    if (state.focusedPane === groupName && !siblingAlive) helpers.focus.clear();

    helpers.refreshTreeRunningState();
    views.renderActiveWorkspace();
    views.renderTabs();
  }

  /**
   * @param {string} sessionName
   * @param {string} workingDir
   */
  function showDirtyWarning(sessionName, workingDir) {
    const folderName = workingDir.split(/[/\\]/).filter(Boolean).pop() || workingDir;
    console.warn(`[dirty] ${sessionName} exited with uncommitted changes in ${folderName}`);
    const toast = doc.createElement("div");
    toast.className = "dirty-toast";
    toast.innerHTML = `<strong>⚠ ${helpers.escapeHtml(folderName)}</strong> has uncommitted changes (session ${helpers.escapeHtml(sessionName)} exited)`;
    toast.onclick = () => toast.remove();
    doc.body.appendChild(toast);
    env.setTimeout(() => toast.remove(), 30000);
  }

  /**
   * Remove a no-longer-existent pane group from all workspaces by
   * rebuilding any workspace that contained it as a balanced tree of
   * the remaining leaves.
   *
   * @param {string} groupName
   */
  function removeGroupFromAllWorkspaces(groupName) {
    helpers.transactionFn(() => {
      for (const ws of state.workspaces) {
        if (ws.layout && layout.treeContains(ws.layout, groupName)) {
          const leaves = layout.getLeafList(ws.layout).filter((n) => n !== groupName);
          helpers.setWorkspaceLayout(ws, layout.buildBalancedTree(leaves));
        }
      }
    });
  }

  /**
   * Tear down the terminal entry for a session.
   *
   * @param {string} sessionName
   */
  function disposeTerminalEntry(sessionName) {
    const entry = state.terminals.get(sessionName);
    if (!entry) return;
    entry.resizeObserver?.disconnect();
    entry.term.dispose();
    entry.wrapperEl?.remove();
    state.terminals.delete(sessionName);
  }

  /**
   * @param {string} groupName
   * @param {boolean} siblingAlive
   */
  function refocusAfterPaneRemoval(groupName, siblingAlive) {
    if (state.focusedPane !== groupName || siblingAlive) return;
    helpers.focus.refocusToFirstLeaf();
  }

  /**
   * @param {string} sessionName
   */
  function autoRemoveDeadSession(sessionName) {
    const s = sessions.byName(sessionName);
    if (!s || s.status !== "dead") return;

    env.fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: "DELETE" }).catch(() => {});

    const groupName = sessionName.replace(/~pwsh$/, "");
    const siblingName = sessionName.endsWith("~pwsh") ? groupName : groupName + "~pwsh";
    const siblingAlive = sessions.has(siblingName) && sessions.byName(siblingName)?.status !== "dead";

    if (!siblingAlive) {
      removeGroupFromAllWorkspaces(groupName);
    } else {
      const pg = state.paneGroups.get(groupName);
      if (pg) pg.activeType = sessionName.endsWith("~pwsh") ? "claude" : "pwsh";
    }

    disposeTerminalEntry(sessionName);

    state.sessions.delete(sessionName);
    state.sessionMeta.delete(sessionName);
    helpers.saveSessionMeta();
    helpers.rebuildPaneGroups();

    refocusAfterPaneRemoval(groupName, siblingAlive);

    helpers.refreshTreeRunningState();
    if (isDashboardMode(state)) views.renderDashboard();
    else views.renderActiveWorkspace();
    views.renderTabs();
  }

  return {
    killSession,
    closeFocusedPane,
    showDirtyWarning,
    autoRemoveDeadSession,
    // Exposed for tests:
    _removeGroupFromAllWorkspaces: removeGroupFromAllWorkspaces,
    _disposeTerminalEntry: disposeTerminalEntry,
    _refocusAfterPaneRemoval: refocusAfterPaneRemoval,
  };
}
