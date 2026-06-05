// @ts-check
// Pure helpers for workspace-tab interactions. Extracted from app.js
// renderTabs so the drop-target geometry and reorder logic can be
// unit-tested without DOM event simulation.

/**
 * @typedef {{ id: string, [k: string]: unknown }} WorkspaceLike
 */

/**
 * Decide whether a drop falls on the LEFT or RIGHT half of a tab rect,
 * based on the cursor's clientX. Returns "left" when clientX is strictly
 * less than the rect midpoint; "right" otherwise (including exact mid,
 * matching the historical `e.clientX < midpoint` check).
 *
 * @param {{ left: number, width: number }} rect
 * @param {number} clientX
 * @returns {"left" | "right"}
 */
export function tabDropSide(rect, clientX) {
  const mid = rect.left + rect.width / 2;
  return clientX < mid ? "left" : "right";
}

/**
 * Compute a new workspaces array with the source workspace moved adjacent
 * to the target. `side === "left"` inserts BEFORE the target; "right"
 * AFTER. Returns the original array unchanged when:
 *  - src or tgt id is missing from the list
 *  - srcId === tgtId (self-drop)
 *
 * Pure: input array is not mutated.
 *
 * @template {WorkspaceLike} T
 * @param {ReadonlyArray<T>} workspaces
 * @param {string} srcId
 * @param {string} tgtId
 * @param {"left" | "right"} side
 * @returns {T[]}
 */
export function reorderWorkspaces(workspaces, srcId, tgtId, side) {
  if (srcId === tgtId) return [...workspaces];
  const next = [...workspaces];
  const srcIdx = next.findIndex((w) => w.id === srcId);
  if (srcIdx < 0) return next;
  if (!next.some((w) => w.id === tgtId)) return next;
  const removed = next.splice(srcIdx, 1)[0];
  if (!removed) return next;
  const tgtIdx = next.findIndex((w) => w.id === tgtId);
  if (tgtIdx < 0) {
    // Target was the removed item itself (shouldn't reach here given the
    // srcId === tgtId early-out, but defensive); re-insert at original.
    next.splice(srcIdx, 0, removed);
    return next;
  }
  next.splice(side === "left" ? tgtIdx : tgtIdx + 1, 0, removed);
  return next;
}

// ===== Workspace tabs orchestrator (Phase 5a) =====
//
// The orchestrator extracted from app.js: renderTabs (one tab per
// workspace, plus Dashboard tab and "+ new workspace" button), the
// drag-reorder/drop wiring, the single-click vs double-click handler
// (click switches workspace, double-click renames), and the Add
// button (which also accepts session/folder drops to create a new
// workspace).
//
// Tab drag state (formerly module-level `dragSrcWsId` in app.js)
// lives in the factory closure, so multiple instances are independent.

import { isDashboardMode } from "./navigation.js";

/**
 * @typedef {Object} WorkspaceTabsState
 * @property {Array<{ id: string, name: string, customName?: boolean, layout: any }>} workspaces
 * @property {string | null} activeWorkspaceId
 * @property {boolean} [isDashboard]
 *
 * @typedef {Object} WorkspaceTabsDeps
 * @property {WorkspaceTabsState} state
 * @property {(id: string) => HTMLElement} byId
 * @property {Document} [doc]
 * @property {{ setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout }} [env]
 * @property {{
 *   saveWorkspaces: () => void,
 *   getLeafList: (layout: any) => string[]
 * }} helpers
 * @property {{
 *   switchToDashboard: () => void,
 *   switchToWorkspace: (id: string) => void,
 *   removeWorkspace: (id: string) => void,
 *   showLayoutPresetsMenu: (e: MouseEvent, ws: any) => void,
 *   handleSessionDrop: (e: DragEvent, wsId: string | null) => void,
 *   createWorkspace: (name: string | null) => any
 * }} actions
 */

/**
 * @param {WorkspaceTabsDeps} deps
 */
// eslint-disable-next-line max-lines-per-function
export function createWorkspaceTabs(deps) {
  const { state, byId, helpers, actions } = deps;
  const doc = deps.doc || document;
  const env = {
    setTimeout: deps.env?.setTimeout || setTimeout.bind(globalThis),
    clearTimeout: deps.env?.clearTimeout || clearTimeout.bind(globalThis),
  };

  /** @type {string | null} */
  let dragSrcWsId = null;

  function renderTabs() {
    helpers.saveWorkspaces();
    const tabsEl = byId("tabs");
    tabsEl.innerHTML = "";

    const dashTab = doc.createElement("div");
    dashTab.className = `tab ${isDashboardMode(state) ? "active" : ""}`;
    dashTab.textContent = "Dashboard";
    dashTab.onclick = () => actions.switchToDashboard();
    tabsEl.appendChild(dashTab);

    for (const ws of state.workspaces) {
      tabsEl.appendChild(buildWorkspaceTab(ws));
    }

    tabsEl.appendChild(buildAddWorkspaceButton());
  }

  /** @param {any} ws */
  function buildWorkspaceTab(ws) {
    const tab = doc.createElement("div");
    tab.className = `tab ${ws.id === state.activeWorkspaceId ? "active" : ""}`;

    const label = doc.createElement("span");
    label.className = "tab-label";
    label.textContent = ws.name;
    tab.appendChild(label);

    const close = doc.createElement("span");
    close.className = "tab-close";
    close.textContent = "\u00d7";
    close.onclick = (e) => { e.stopPropagation(); actions.removeWorkspace(ws.id); };
    tab.appendChild(close);

    if (ws.id === state.activeWorkspaceId && ws.layout && helpers.getLeafList(ws.layout).length >= 2) {
      const layoutBtn = doc.createElement("span");
      layoutBtn.className = "tab-layout-btn";
      layoutBtn.title = "Layout presets";
      layoutBtn.textContent = "\u229e";
      layoutBtn.onclick = (e) => actions.showLayoutPresetsMenu(e, ws);
      tab.appendChild(layoutBtn);
    }

    wireTabDragReorder(tab, ws);
    wireTabClickAndRename(tab, label, ws);
    return tab;
  }

  /** @param {HTMLElement} tab @param {any} ws */
  function wireTabDragReorder(tab, ws) {
    tab.draggable = true;
    tab.addEventListener("dragstart", /** @param {DragEvent} e */ (e) => {
      if (!e.dataTransfer) return;
      dragSrcWsId = ws.id;
      tab.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    tab.addEventListener("dragend", () => {
      dragSrcWsId = null;
      doc.querySelectorAll(".tab").forEach((t) => t.classList.remove("drag-over-left", "drag-over-right", "dragging"));
    });
    tab.addEventListener("dragover", /** @param {DragEvent} e */ (e) => {
      if (!e.dataTransfer) return;
      if (e.dataTransfer.types.includes("pty-win/session") || e.dataTransfer.types.includes("pty-win/folder")) {
        e.preventDefault(); e.dataTransfer.dropEffect = "copy"; tab.classList.add("drop-target"); return;
      }
      if (!dragSrcWsId || dragSrcWsId === ws.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const side = tabDropSide(tab.getBoundingClientRect(), e.clientX);
      tab.classList.toggle("drag-over-left", side === "left");
      tab.classList.toggle("drag-over-right", side === "right");
    });
    tab.addEventListener("dragleave", () => {
      tab.classList.remove("drag-over-left", "drag-over-right", "drop-target");
    });
    tab.addEventListener("drop", /** @param {DragEvent} e */ (e) => {
      if (!e.dataTransfer) return;
      tab.classList.remove("drop-target");
      if (e.dataTransfer.types.includes("pty-win/session") || e.dataTransfer.types.includes("pty-win/folder")) {
        e.preventDefault(); actions.handleSessionDrop(e, ws.id); return;
      }
      if (!dragSrcWsId || dragSrcWsId === ws.id) return;
      e.preventDefault();
      const side = tabDropSide(tab.getBoundingClientRect(), e.clientX);
      state.workspaces = reorderWorkspaces(state.workspaces, dragSrcWsId, ws.id, side);
      dragSrcWsId = null;
      renderTabs();
    });
  }

  /** @param {HTMLElement} tab @param {HTMLElement} label @param {any} ws */
  function wireTabClickAndRename(tab, label, ws) {
    /** @type {ReturnType<typeof setTimeout> | null} */
    let clickTimer = null;
    tab.onclick = () => {
      if (clickTimer) return;
      clickTimer = env.setTimeout(() => {
        clickTimer = null;
        actions.switchToWorkspace(ws.id);
      }, 250);
    };

    label.ondblclick = /** @param {MouseEvent} e */ (e) => {
      e.stopPropagation();
      if (clickTimer) { env.clearTimeout(clickTimer); clickTimer = null; }

      const input = doc.createElement("input");
      input.className = "tab-rename";
      input.value = ws.name;
      input.style.width = `${Math.max(60, ws.name.length * 8)}px`;
      label.replaceWith(input);
      input.focus();
      input.select();

      const finish = () => {
        const newName = input.value.trim() || ws.name;
        ws.name = newName;
        ws.customName = true;
        renderTabs();
      };
      input.onblur = finish;
      input.onkeydown = /** @param {KeyboardEvent} ev */ (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
        if (ev.key === "Escape") { input.value = ws.name; input.blur(); }
      };
    };
  }

  function buildAddWorkspaceButton() {
    const addBtn = doc.createElement("button");
    addBtn.id = "btn-new-workspace";
    addBtn.title = "New workspace";
    addBtn.textContent = "+";
    addBtn.onclick = () => { const ws = actions.createWorkspace(null); actions.switchToWorkspace(ws.id); };
    addBtn.addEventListener("dragover", /** @param {DragEvent} e */ (e) => {
      if (!e.dataTransfer) return;
      if (e.dataTransfer.types.includes("pty-win/session") || e.dataTransfer.types.includes("pty-win/folder")) {
        e.preventDefault(); e.dataTransfer.dropEffect = "copy"; addBtn.classList.add("drop-target");
      }
    });
    addBtn.addEventListener("dragleave", () => addBtn.classList.remove("drop-target"));
    addBtn.addEventListener("drop", /** @param {DragEvent} e */ (e) => {
      addBtn.classList.remove("drop-target");
      actions.handleSessionDrop(e, null);
    });
    return addBtn;
  }

  return {
    renderTabs,
    _buildWorkspaceTab: buildWorkspaceTab,
    _buildAddWorkspaceButton: buildAddWorkspaceButton,
    _getDragSrcWsId: () => dragSrcWsId,
  };
}
