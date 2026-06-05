// @ts-check
//
// WebSocket message dispatcher and side-effecting handlers for the
// client. Extracted from app.js so the connection plumbing (the
// `connect()` IIFE-style bootstrap) stays in the composition root,
// while the handler bodies and their deps are expressed as narrow
// ports.
//
// Why ports instead of a flat 15-key deps bag: handleWsSessions alone
// pulls in layout/orphan/render/tree utilities. Grouping them into
// `panes`, `views`, `tree`, `layouts`, `sessions`, and `appChrome`
// makes the dispatcher's collaborators legible and makes test setup
// (mocking five small objects vs. fifteen functions) actually pleasant.
//
// Pure layout/diff helpers (hasSessionNameSetChanged, findOrphanedLeaves,
// classifyOrphanGroups, rebalanceLayoutsWithoutLeaves) live in
// ws-handlers.js and are passed in via the `layouts` port.

import { hasSessionNameSetChanged } from "./ws-handlers.js";
import { isDashboardMode } from "./navigation.js";
import { getPaneGroup } from "./pane-groups.js";

/**
 * @typedef {Object} WsDispatcherDeps
 * @property {{
 *   sessions: Map<string, any>,
 *   sessionMeta: Map<string, any>,
 *   workspaces: any[],
 *   terminals: Map<string, { term: any, fitAddon: any }>,
 *   activePaneTypes: Map<string, "claude"|"pwsh">,
 *   ws?: WebSocket | null,
 *   activeWorkspaceId?: string | null,
 *   focusedPane?: string | null,
 * }} state
 * @property {{ rebuildPaneGroups: () => void, updatePaneStatus: (name: string) => void }} panes
 * @property {{
 *   renderSessionsPanel: () => void,
 *   renderQuickAccess: () => void,
 *   renderDashboard: () => void,
 *   renderActiveWorkspace: () => void,
 *   showDirtyWarning: (sessionName: string, workingDir: string) => void,
 * }} views
 * @property {{ refreshTreeRunningState: () => void }} tree
 * @property {{
 *   findOrphanedLeaves: (workspaces: any[], serverGroups: Set<string>, getLeafList: any) => any,
 *   classifyOrphanGroups: (orphans: any, sessionMeta: Map<string, any>) => { recreatable: string[], unrecoverable: string[] },
 *   rebalanceLayoutsWithoutLeaves: (workspaces: any[], unrecoverable: string[], getLeafList: any, buildBalancedTree: any) => Array<{ workspace: any, newLayout: any }>,
 *   getLeafList: (layout: any) => string[],
 *   buildBalancedTree: (sessions: string[]) => any,
 *   updateWorkspaceTabName: (ws: any) => void,
 *   setWorkspaceLayout: (ws: any, tree: any) => void,
 *   transactionFn: (fn: () => void) => void,
 * }} layouts
 * @property {{
 *   recreateOrphanedSessions: (names: string[]) => Promise<void> | void,
 *   autoRemoveDeadSession: (sessionName: string) => void,
 *   saveSessionMeta: () => void,
 * }} sessions
 * @property {{
 *   replaceAll: (list: Iterable<any>) => Set<string>,
 *   updateStatus: (name: string, patch: any) => boolean,
 *   byName: (name: string) => any,
 *   has: (name: string) => boolean,
 *   list: () => any[],
 *   names: () => string[],
 * }} sessionsStore
 * @property {{ applyInstanceName: (name: string) => void }} appChrome
 * @property {Window} [win]
 */

/**
 * Build the WS dispatcher and side-effecting handlers. Returns:
 * - dispatch(msg)                       — route a parsed message
 * - refitAllTerminalsAndResize()        — refit xterms + notify server
 * - restoreTerminalFocusAfterRebuild()  — restore focus after each dispatch
 *
 * Handlers mutate `state` in place. Ports are read-only; the caller
 * wires real implementations or test fakes per port.
 *
 * @param {WsDispatcherDeps} deps
 */
// eslint-disable-next-line max-lines-per-function -- handler bodies share closures over deps
export function createWsDispatcher(deps) {
  const win = deps.win || (typeof window !== "undefined" ? window : globalThis);

  function refitAllTerminalsAndResize() {
    for (const [n, e] of deps.state.terminals) {
      try {
        e.fitAddon.fit();
        const { cols, rows } = e.term;
        deps.state.ws?.send(JSON.stringify({ type: "resize", session: n, payload: { cols, rows } }));
      } catch { /* ignore — terminal may be unmounted mid-fit */ }
    }
  }

  function handleWsData(/** @type {any} */ msg) {
    const entry = deps.state.terminals.get(msg.session);
    if (entry) entry.term.write(msg.payload);
  }

  function handleWsSessions(/** @type {any} */ msg) {
    const serverNames = new Set(msg.payload.map((/** @type {{ name: string }} */ s) => s.name));
    const prevNames = deps.sessionsStore.replaceAll(msg.payload);
    const layoutChanged = hasSessionNameSetChanged(prevNames, serverNames);

    for (const s of msg.payload) {
      deps.state.sessionMeta.set(s.name, { workingDir: s.workingDir, command: s.command });
    }
    deps.sessions.saveSessionMeta();

    deps.panes.rebuildPaneGroups();

    const serverGroups = new Set(deps.sessionsStore.list().map((/** @type {any} */ s) => s.group || s.name));
    const orphans = deps.layouts.findOrphanedLeaves(deps.state.workspaces, serverGroups, deps.layouts.getLeafList);
    const { recreatable, unrecoverable } = deps.layouts.classifyOrphanGroups(orphans, deps.state.sessionMeta);

    if (unrecoverable.length > 0) {
      const updates = deps.layouts.rebalanceLayoutsWithoutLeaves(
        deps.state.workspaces,
        unrecoverable,
        deps.layouts.getLeafList,
        deps.layouts.buildBalancedTree,
      );
      deps.layouts.transactionFn(() => {
        for (const { workspace, newLayout } of updates) {
          deps.layouts.setWorkspaceLayout(workspace, newLayout);
        }
      });
    }

    if (recreatable.length > 0) {
      deps.sessions.recreateOrphanedSessions(recreatable);
    }

    deps.tree.refreshTreeRunningState();
    deps.views.renderSessionsPanel();
    deps.views.renderQuickAccess();
    if (isDashboardMode(deps.state)) {
      deps.views.renderDashboard();
    } else if (layoutChanged) {
      deps.views.renderActiveWorkspace();
      win.requestAnimationFrame(() => refitAllTerminalsAndResize());
    } else {
      for (const s of msg.payload) deps.panes.updatePaneStatus(s.name);
    }
  }

  function handleWsStatus(/** @type {any} */ msg) {
    const found = deps.sessionsStore.updateStatus(msg.session, {
      status: msg.payload.status,
      unreadCount: msg.payload.unreadCount,
      pendingPermission: !!msg.payload.pendingPermission,
    });
    if (!found) return;
    deps.panes.rebuildPaneGroups();
    deps.panes.updatePaneStatus(msg.session);
    deps.tree.refreshTreeRunningState();
    deps.views.renderSessionsPanel();
    deps.views.renderQuickAccess();
    if (isDashboardMode(deps.state)) deps.views.renderDashboard();

    if (msg.payload.status === "dead") {
      if (msg.payload.dirtyOnExit) {
        deps.views.showDirtyWarning(msg.session, msg.payload.workingDir);
      }
      win.setTimeout(() => deps.sessions.autoRemoveDeadSession(msg.session), 1500);
    }
  }

  function handleWsConfig(/** @type {any} */ msg) {
    if (msg.name != null) deps.appChrome.applyInstanceName(msg.name);
  }

  function handleWsNotification(/** @type {any} */ msg) {
    const s = deps.sessionsStore.byName(msg.session);
    if (!s) return;
    deps.panes.updatePaneStatus(msg.session);
    deps.views.renderSessionsPanel();
    deps.views.renderQuickAccess();
    if (isDashboardMode(deps.state)) deps.views.renderDashboard();
  }

  /**
   * @param {{ type: string, [k: string]: any }} msg
   */
  function dispatch(msg) {
    switch (msg.type) {
      case "data": handleWsData(msg); break;
      case "sessions": handleWsSessions(msg); break;
      case "status": handleWsStatus(msg); break;
      case "config": handleWsConfig(msg); break;
      case "notification": handleWsNotification(msg); break;
    }
  }

  function restoreTerminalFocusAfterRebuild() {
    if (!deps.state.focusedPane || isDashboardMode(deps.state)) return;
    const pg = getPaneGroup(deps.state.sessions, deps.state.focusedPane, deps.state.activePaneTypes);
    const sessionName = pg ? (pg.activeType === "pwsh" ? pg.pwsh : pg.claude) : deps.state.focusedPane;
    const entry = deps.state.terminals.get(sessionName || deps.state.focusedPane);
    const doc = win.document;
    const focusInPane = doc.activeElement?.closest(".pane");
    const focusLostToBody = doc.activeElement === doc.body;
    if (entry && (focusInPane || focusLostToBody)) {
      entry.term.focus();
    }
  }

  return { dispatch, refitAllTerminalsAndResize, restoreTerminalFocusAfterRebuild };
}
