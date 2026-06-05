// @ts-check
// Layout presets for workspaces (Phase 5c).
//
// Owns the LAYOUT_PRESETS table, applyLayoutPreset (which rebuilds the
// active workspace's tile tree from one of the presets), and
// showLayoutPresetsMenu (the dropdown rendered next to a workspace tab).
//
// Imported into app.js as createLayoutPresets({...}) and exposed via a thin
// showLayoutPresetsMenu wrapper to keep the workspace-tabs factory working
// unchanged.

import { buildBalancedTree } from "./tiling.js";

/**
 * @typedef {{
 *   name: string,
 *   min: number,
 *   build: (sessions: string[]) => any
 * }} LayoutPreset
 */

/** @type {LayoutPreset[]} */
export const LAYOUT_PRESETS = [
  { name: "Auto (balanced)",    min: 1, build: (s) => buildBalancedTree(s) },
  { name: "2 Columns",          min: 2, build: ([a,b]) => ({ type:"split", direction:"h", ratio:0.5, children:[{type:"leaf",session:a},{type:"leaf",session:b}] }) },
  { name: "3 Columns",          min: 3, build: ([a,b,c]) => ({ type:"split", direction:"h", ratio:0.333, children:[{type:"leaf",session:a},{type:"split",direction:"h",ratio:0.5,children:[{type:"leaf",session:b},{type:"leaf",session:c}]}] }) },
  { name: "2 Top + 1 Bottom",   min: 3, build: ([a,b,c]) => ({ type:"split", direction:"v", ratio:0.5, children:[{type:"split",direction:"h",ratio:0.5,children:[{type:"leaf",session:a},{type:"leaf",session:b}]},{type:"leaf",session:c}] }) },
  { name: "1 Top + 2 Bottom",   min: 3, build: ([a,b,c]) => ({ type:"split", direction:"v", ratio:0.5, children:[{type:"leaf",session:a},{type:"split",direction:"h",ratio:0.5,children:[{type:"leaf",session:b},{type:"leaf",session:c}]}] }) },
  { name: "Large Left + Stack", min: 3, build: ([a,b,c]) => ({ type:"split", direction:"h", ratio:0.6, children:[{type:"leaf",session:a},{type:"split",direction:"v",ratio:0.5,children:[{type:"leaf",session:b},{type:"leaf",session:c}]}] }) },
];

/**
 * @typedef {{
 *   byId: (id: string) => HTMLElement | null,
 *   doc: Document,
 *   env: {
 *     setTimeout: (cb: () => void, ms: number) => unknown,
 *   },
 *   helpers: {
 *     getLeafList: (node: any) => string[],
 *     saveWorkspaces: () => void,
 *     setWorkspaceLayout: (ws: any, tree: any) => void,
 *   },
 *   actions: {
 *     renderActiveWorkspace: () => void,
 *   }
 * }} LayoutPresetsDeps
 */

/**
 * @param {LayoutPresetsDeps} deps
 */
export function createLayoutPresets(deps) {
  const { byId, doc, env, helpers, actions } = deps;

  /**
   * @param {any} ws
   * @param {number} idx
   */
  function applyLayoutPreset(ws, idx) {
    const preset = LAYOUT_PRESETS[idx];
    const sessions = helpers.getLeafList(ws.layout);
    if (!preset || sessions.length < preset.min) return;
    helpers.setWorkspaceLayout(ws, preset.build(sessions));
    actions.renderActiveWorkspace();
  }

  /**
   * @param {MouseEvent} e
   * @param {any} ws
   */
  function showLayoutPresetsMenu(e, ws) {
    e.stopPropagation();
    const menu = byId("pane-context-menu");
    if (!menu) return;
    menu.innerHTML = "";
    menu.classList.remove("hidden");
    const target = e.target instanceof HTMLElement ? e.target : null;
    const rect = target ? target.getBoundingClientRect() : { left: 0, bottom: 0 };
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 2}px`;
    const sessions = ws.layout ? helpers.getLeafList(ws.layout) : [];
    LAYOUT_PRESETS.forEach((p, i) => {
      const item = doc.createElement("div");
      item.className = `ctx-item${sessions.length < p.min ? " ctx-disabled" : ""}`;
      item.textContent = p.name;
      if (sessions.length >= p.min) {
        item.onclick = () => {
          applyLayoutPreset(ws, i);
          menu.classList.add("hidden");
        };
      }
      menu.appendChild(item);
    });
    /** @param {MouseEvent} ev */
    const close = (ev) => {
      const t = ev.target instanceof Node ? ev.target : null;
      if (!menu.contains(t)) {
        menu.classList.add("hidden");
        doc.removeEventListener("mousedown", /** @type {EventListener} */ (close));
      }
    };
    env.setTimeout(
      () => doc.addEventListener("mousedown", /** @type {EventListener} */ (close)),
      0,
    );
  }

  return {
    applyLayoutPreset,
    showLayoutPresetsMenu,
  };
}
