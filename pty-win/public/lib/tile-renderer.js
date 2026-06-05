// @ts-check
//
// Tile renderer — extracted from app.js as Phase 4b of the
// modularization campaign. Owns the rendering of a workspace's
// tile tree (recursive splits with draggable handles) and the
// post-render xterm fit-all sweep.
//
// `createPane` is injected as a callback rather than imported, so
// this module stays independent of the pane runtime (Phase 4c). The
// resize handle's mouseup re-fits all terminals in the active
// workspace by re-traversing the layout tree.

import { getPaneGroup } from "./pane-groups.js";

/**
 * @typedef {Object} TileRendererDeps
 * @property {{
 *   workspaces: Array<{ id: string, layout: any }>,
 *   activeWorkspaceId: string | null,
 *   sessions: Map<string, any>,
 *   activePaneTypes: Map<string, "claude"|"pwsh">,
 *   terminals: Map<string, { fitAddon: { fit: () => void } }>,
 * }} state
 * @property {(id: string) => HTMLElement} byId
 * @property {(groupName: string) => HTMLElement} createPane
 * @property {Document} [doc]
 * @property {{ requestAnimationFrame: (cb: () => void) => number }} [win]
 */

/**
 * @param {TileRendererDeps} deps
 */
// eslint-disable-next-line max-lines-per-function -- factory closure groups four mutually-recursive render helpers; splitting would require leaking the createPane callback and recursion across modules
export function createTileRenderer(deps) {
  const doc = deps.doc || (typeof document !== "undefined" ? document : null);
  const raf = deps.win?.requestAnimationFrame || (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : (/** @type {() => void} */ cb) => { cb(); return 0; });

  function renderActiveWorkspace() {
    if (!doc) return;
    const area = deps.byId("workspace-area");
    area.innerHTML = "";

    const ws = deps.state.workspaces.find((w) => w.id === deps.state.activeWorkspaceId);
    if (!ws || !ws.layout) {
      const empty = doc.createElement("div");
      empty.className = "dashboard active";
      empty.innerHTML = '<div class="dashboard-empty">Empty workspace. Use the folder browser or <kbd>Ctrl+P</kbd> to open a folder.</div>';
      area.appendChild(empty);
      return;
    }

    const container = doc.createElement("div");
    container.className = "workspace active";
    area.appendChild(container);

    renderTileNode(ws.layout, container);
    raf(() => fitAllTerminals(ws.layout));
  }

  /**
   * @param {any} node
   * @param {HTMLElement} parentEl
   */
  function renderTileNode(node, parentEl) {
    if (!doc) return;
    if (node.type === "leaf") {
      parentEl.appendChild(deps.createPane(node.session));
      return;
    }

    const container = doc.createElement("div");
    container.className = "split-container";
    container.style.flexDirection = node.direction === "h" ? "row" : "column";
    parentEl.appendChild(container);

    const child1 = doc.createElement("div");
    child1.className = "split-child";
    child1.style.flex = `${node.ratio} 0 0%`;
    container.appendChild(child1);

    const handle = doc.createElement("div");
    handle.className = `drag-handle ${node.direction === "v" ? "vertical" : ""}`;
    setupDragHandle(handle, node, container);
    container.appendChild(handle);

    const child2 = doc.createElement("div");
    child2.className = "split-child";
    child2.style.flex = `${1 - node.ratio} 0 0%`;
    container.appendChild(child2);

    renderTileNode(node.children[0], child1);
    renderTileNode(node.children[1], child2);
  }

  /**
   * @param {HTMLElement} handle
   * @param {any} node
   * @param {HTMLElement} container
   */
  function setupDragHandle(handle, node, container) {
    handle.addEventListener("mousedown", /** @param {MouseEvent} e */ (e) => {
      if (!doc) return;
      e.preventDefault();
      handle.classList.add("dragging");
      doc.body.style.cursor = node.direction === "h" ? "col-resize" : "row-resize";
      doc.body.style.userSelect = "none";
      const startPos = node.direction === "h" ? e.clientX : e.clientY;
      const startRatio = node.ratio;
      const totalSize = node.direction === "h" ? container.offsetWidth : container.offsetHeight;

      const onMove = /** @param {MouseEvent} ev */ (ev) => {
        const delta = (node.direction === "h" ? ev.clientX : ev.clientY) - startPos;
        node.ratio = Math.max(0.15, Math.min(0.85, startRatio + delta / totalSize));
        const children = container.querySelectorAll(":scope > .split-child");
        const c0 = /** @type {HTMLElement | null} */ (children[0] || null);
        const c1 = /** @type {HTMLElement | null} */ (children[1] || null);
        if (c0) c0.style.flex = `${node.ratio} 0 0%`;
        if (c1) c1.style.flex = `${1 - node.ratio} 0 0%`;
      };

      const onUp = () => {
        handle.classList.remove("dragging");
        if (doc) {
          doc.body.style.cursor = "";
          doc.body.style.userSelect = "";
          doc.removeEventListener("mousemove", onMove);
          doc.removeEventListener("mouseup", onUp);
        }
        const ws = deps.state.workspaces.find((w) => w.id === deps.state.activeWorkspaceId);
        if (ws?.layout) raf(() => fitAllTerminals(ws.layout));
      };

      doc.addEventListener("mousemove", onMove);
      doc.addEventListener("mouseup", onUp);
    });
  }

  /**
   * @param {any} node
   */
  function fitAllTerminals(node) {
    if (!node) return;
    if (node.type === "leaf") {
      const groupName = node.session;
      const pg = getPaneGroup(deps.state.sessions, groupName, deps.state.activePaneTypes);
      const activeSessionName = pg ? (pg.activeType === "pwsh" ? pg.pwsh : pg.claude) : groupName;
      const entry = deps.state.terminals.get(activeSessionName || groupName);
      if (entry) { try { entry.fitAddon.fit(); } catch {} }
      return;
    }
    fitAllTerminals(node.children[0]);
    fitAllTerminals(node.children[1]);
  }

  return {
    renderActiveWorkspace,
    fitAllTerminals,
    // Exposed for tests; not part of documented contract.
    _renderTileNode: renderTileNode,
    _setupDragHandle: setupDragHandle,
  };
}
