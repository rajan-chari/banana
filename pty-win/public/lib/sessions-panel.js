// @ts-check
//
// Sessions panel renderer (Phase 6b).
//
// Owns renderSessionsPanel — the top-of-sidebar list of active session
// groups. Tag building is delegated to the rowActions factory in
// session-row.js (Phase 6a). The collapse/expand toggle stays in app.js
// for now; that lives in a future panel-shell extraction.
//
// Notable behavior carried over from app.js:
// - Empties the list and renders a single .sessions-empty row when there
//   are no groups.
// - For each group, builds the base row, appends actions, lazy-fetches
//   /api/folder-info if not cached, and wires click/contextmenu/dragstart.
// - The async fetch callback now checks row.isConnected before patching
//   indicators, avoiding wasted work on stale rows (rubber-duck callout).
//
// Imports kept narrow — all collaborators flow in via deps.

/**
 * @typedef {{
 *   state: {
 *     sessions: Map<string, any>,
 *     activePaneTypes: Map<string, "claude"|"pwsh">,
 *     focusedPane: string | null,
 *     folderInfoCache: Map<string, any>,
 *   },
 *   byId: (id: string) => HTMLElement | null,
 *   doc: Document,
 *   env: { fetchFn: typeof fetch },
 *   helpers: {
 *     normPath: (p: string | null | undefined) => string,
 *     buildSessionGroups: (paneGroups: any, sessions: Map<string, any>) => any[],
 *     createSessionRow: (g: any, focusedPane: string | null) => HTMLElement,
 *     createEmptyRow: () => HTMLElement,
 *     buildSessionRowActionsOpts: (g: any, cached: any, onKill: () => void) => any,
 *     patchSessionRowIndicators: (row: HTMLElement, info: any) => void,
 *     activeNameForRow: (g: any) => string | null,
 *     getPaneGroups: (sessions: Map<string, any>, activePaneTypes: Map<string, "claude"|"pwsh">) => Map<string, any>,
 *   },
 *   actions: {
 *     appendRowActions: (container: HTMLElement, opts: any) => void,
 *     killSession: (name: string) => void,
 *     focusExistingSession: (name: string) => void,
 *     showContextMenu: (e: MouseEvent, path: string) => void,
 *   }
 * }} SessionsPanelDeps
 */

/**
 * @param {SessionsPanelDeps} deps
 */
export function createSessionsPanel(deps) {
  const { state, byId, doc, env, helpers, actions } = deps;
  const fetcher = env.fetchFn || fetch.bind(window);

  function renderSessionsPanel() {
    const list = byId("sessions-list");
    const countEl = doc.querySelector(".session-count");
    if (!list) return;

    const paneGroups = helpers.getPaneGroups(state.sessions, state.activePaneTypes);
    const groups = helpers.buildSessionGroups(paneGroups, state.sessions);
    if (countEl) countEl.textContent = groups.length > 0 ? `(${groups.length})` : "";

    list.innerHTML = "";
    if (groups.length === 0) {
      list.appendChild(helpers.createEmptyRow());
      return;
    }

    for (const g of groups) {
      const row = helpers.createSessionRow(g, state.focusedPane);
      const cacheKey = helpers.normPath(g.workingDir);
      const cached = state.folderInfoCache.get(cacheKey);

      actions.appendRowActions(row, helpers.buildSessionRowActionsOpts(g, cached, () => {
        if (g.claudeAlive && g.pg.claude) actions.killSession(g.pg.claude);
        if (g.pwshAlive && g.pg.pwsh) actions.killSession(g.pg.pwsh);
      }));

      if (!cached && g.workingDir) {
        fetcher(`/api/folder-info?path=${encodeURIComponent(g.workingDir)}`)
          .then((r) => r.json())
          .then((info) => {
            state.folderInfoCache.set(cacheKey, info);
            if (!row.isConnected) return;
            helpers.patchSessionRowIndicators(row, info);
          })
          .catch(() => {});
      }

      const activeName = helpers.activeNameForRow(g);
      if (activeName) {
        /** @type {any} */ (row).onclick = () => actions.focusExistingSession(activeName);
      }
      row.addEventListener("contextmenu", /** @param {Event} ev */ (ev) => {
        const e = /** @type {MouseEvent} */ (ev);
        if (g.workingDir) actions.showContextMenu(e, g.workingDir);
      });
      /** @type {any} */ (row).draggable = true;
      row.addEventListener("dragstart", /** @param {Event} ev */ (ev) => {
        const e = /** @type {DragEvent} */ (ev);
        if (!e.dataTransfer) return;
        e.dataTransfer.setData("pty-win/session", JSON.stringify({ group: g.group, workingDir: g.workingDir }));
        e.dataTransfer.effectAllowed = "copy";
      });
      list.appendChild(row);
    }
  }

  return { renderSessionsPanel };
}
