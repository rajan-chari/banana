// @ts-check
//
// Pane drag-to-reorder runtime — extracted from app.js as Phase 4a of
// the modularization campaign. Owns the drag-in-progress state
// (formerly the top-level `paneDrag` object in app.js), all four
// drag helpers, and lifecycle of the document-level mousemove/mouseup/
// keydown listeners installed during a drag.
//
// dispose() removes any active document listeners and ghost/dropzone
// DOM, so the panel is safe to tear down mid-drag in tests.

/**
 * @typedef {"left" | "right" | "top" | "bottom"} DropSide
 */

/**
 * @typedef {Object} PaneDragDeps
 * @property {{ workspaces: Array<{ id: string, layout: any }>, activeWorkspaceId: string | null }} state
 * @property {(layout: any) => any[]} getLeafList
 * @property {(layout: any, name: string) => any} removeSessionFromLayout
 * @property {(layout: any, name: string) => boolean} treeContains
 * @property {(layout: any, anchor: string, name: string, side: DropSide) => any} insertAdjacentToPane
 * @property {() => void} saveWorkspaces
 * @property {(ws: any, tree: any) => void} setWorkspaceLayout
 * @property {() => void} renderActiveWorkspace
 * @property {Document} [doc]
 */

/**
 * Build a pane-drag runtime. Internal state is held in factory closure
 * (no module-level mutables), so multiple instances are independent
 * and tests can construct fresh runtimes per case.
 *
 * @param {PaneDragDeps} deps
 */
// eslint-disable-next-line max-lines-per-function -- factory closure groups drag state + handlers + listener cleanup; splitting would require leaking the active onMove/onUp/onKey references between modules
export function createPaneDrag(deps) {
  const doc = deps.doc || (typeof document !== "undefined" ? document : null);

  /** @type {{
   *   active: boolean,
   *   session: string | null,
   *   ghostEl: HTMLElement | null,
   *   dropZoneEls: HTMLElement[],
   *   currentTarget: { session: string, side: DropSide } | null,
   *   onMove: ((ev: MouseEvent) => void) | null,
   *   onUp: (() => void) | null,
   *   onKey: ((ev: KeyboardEvent) => void) | null,
   * }} */
  const paneDrag = {
    active: false,
    session: null,
    ghostEl: null,
    dropZoneEls: [],
    currentTarget: null,
    onMove: null,
    onUp: null,
    onKey: null,
  };

  /**
   * @param {string} excludeSession
   */
  function showDropZones(excludeSession) {
    if (!doc) return;
    clearDropZones();
    doc.querySelectorAll(".pane[data-session]").forEach((paneEl) => {
      if (!(paneEl instanceof HTMLElement)) return;
      const session = paneEl.dataset["session"];
      if (!session || session === excludeSession) return;
      const r = paneEl.getBoundingClientRect();
      [
        { side: /** @type {DropSide} */ ("top"),    x: r.left,                  y: r.top,                       w: r.width,        h: r.height * 0.25 },
        { side: /** @type {DropSide} */ ("bottom"), x: r.left,                  y: r.top + r.height * 0.75,     w: r.width,        h: r.height * 0.25 },
        { side: /** @type {DropSide} */ ("left"),   x: r.left,                  y: r.top + r.height * 0.25,     w: r.width * 0.25, h: r.height * 0.5 },
        { side: /** @type {DropSide} */ ("right"),  x: r.left + r.width * 0.75, y: r.top + r.height * 0.25,     w: r.width * 0.25, h: r.height * 0.5 },
      ].forEach(({ side, x, y, w, h }) => {
        const el = doc.createElement("div");
        el.className = "pane-drop-zone";
        el.dataset["session"] = session;
        el.dataset["side"] = side;
        el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
        doc.body.appendChild(el);
        paneDrag.dropZoneEls.push(el);
      });
    });
  }

  function clearDropZones() {
    paneDrag.dropZoneEls.forEach((el) => el.remove());
    paneDrag.dropZoneEls = [];
    paneDrag.currentTarget = null;
  }

  /**
   * @param {number} mx
   * @param {number} my
   */
  function updateDropZoneHighlight(mx, my) {
    let best = null;
    for (const el of paneDrag.dropZoneEls) {
      const r = el.getBoundingClientRect();
      if (mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom) { best = el; break; }
    }
    paneDrag.dropZoneEls.forEach((el) => el.classList.remove("active"));
    if (best) {
      best.classList.add("active");
      const session = best.dataset["session"] || "";
      const side = /** @type {DropSide} */ (best.dataset["side"] || "right");
      paneDrag.currentTarget = { session, side };
    } else {
      paneDrag.currentTarget = null;
    }
  }

  function commitPaneDrop() {
    const { session: dragSession, currentTarget, ghostEl } = paneDrag;
    ghostEl?.remove();
    clearDropZones();
    paneDrag.active = false;
    paneDrag.session = null;
    paneDrag.ghostEl = null;
    if (doc) doc.body.classList.remove("pane-dragging");
    if (!currentTarget || !dragSession || currentTarget.session === dragSession) return;
    const ws = deps.state.workspaces.find((w) => w.id === deps.state.activeWorkspaceId);
    if (!ws?.layout) return;
    const pruned = deps.removeSessionFromLayout(ws.layout, dragSession);
    if (!pruned || !deps.treeContains(pruned, currentTarget.session)) return;
    deps.setWorkspaceLayout(ws, deps.insertAdjacentToPane(pruned, currentTarget.session, dragSession, currentTarget.side));
    deps.renderActiveWorkspace();
  }

  function removeListeners() {
    if (!doc) return;
    if (paneDrag.onMove) doc.removeEventListener("mousemove", paneDrag.onMove);
    if (paneDrag.onUp) doc.removeEventListener("mouseup", paneDrag.onUp);
    if (paneDrag.onKey) doc.removeEventListener("keydown", paneDrag.onKey);
    paneDrag.onMove = null;
    paneDrag.onUp = null;
    paneDrag.onKey = null;
  }

  /**
   * @param {MouseEvent} e
   * @param {string} groupName
   */
  function startPaneDrag(e, groupName) {
    if (!doc) return;
    const ws = deps.state.workspaces.find((w) => w.id === deps.state.activeWorkspaceId);
    if (!ws?.layout || deps.getLeafList(ws.layout).length < 2) return;
    e.preventDefault();
    paneDrag.active = true;
    paneDrag.session = groupName;
    doc.body.classList.add("pane-dragging");
    const ghost = doc.createElement("div");
    ghost.className = "pane-drag-ghost";
    ghost.textContent = groupName;
    ghost.style.left = `${e.clientX + 12}px`;
    ghost.style.top = `${e.clientY + 8}px`;
    doc.body.appendChild(ghost);
    paneDrag.ghostEl = ghost;
    showDropZones(groupName);
    paneDrag.onMove = /** @param {MouseEvent} ev */ (ev) => {
      ghost.style.left = `${ev.clientX + 12}px`;
      ghost.style.top = `${ev.clientY + 8}px`;
      updateDropZoneHighlight(ev.clientX, ev.clientY);
    };
    paneDrag.onUp = () => {
      removeListeners();
      commitPaneDrop();
    };
    paneDrag.onKey = /** @param {KeyboardEvent} ev */ (ev) => {
      if (ev.key !== "Escape") return;
      removeListeners();
      ghost.remove();
      clearDropZones();
      paneDrag.active = false;
      paneDrag.session = null;
      paneDrag.ghostEl = null;
      if (doc) doc.body.classList.remove("pane-dragging");
    };
    doc.addEventListener("mousemove", paneDrag.onMove);
    doc.addEventListener("mouseup", paneDrag.onUp);
    doc.addEventListener("keydown", paneDrag.onKey);
  }

  function dispose() {
    removeListeners();
    paneDrag.ghostEl?.remove();
    paneDrag.ghostEl = null;
    clearDropZones();
    paneDrag.active = false;
    paneDrag.session = null;
    if (doc) doc.body.classList.remove("pane-dragging");
  }

  return {
    startPaneDrag,
    showDropZones,
    clearDropZones,
    updateDropZoneHighlight,
    commitPaneDrop,
    dispose,
    // Exposed for tests; not part of the documented contract.
    _state: paneDrag,
  };
}
