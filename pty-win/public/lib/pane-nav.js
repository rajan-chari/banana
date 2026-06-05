// @ts-check
//
// Pane navigation runtime — extracted from app.js as Phase 4e.
// Owns the keyboard-driven pane navigation: Ctrl+Arrow to move focus
// between leaves of the active workspace, Ctrl+Shift+Arrow to grow/
// shrink the parent split of the focused pane.

/**
 * @typedef {Object} PaneNavDeps
 * @property {{
 *   workspaces: Array<{ id: string, layout: any }>,
 *   activeWorkspaceId: string | null,
 *   focusedPane: string | null
 * }} state
 * @property {{
 *   getLeafList: (layout: any) => string[],
 *   findParentSplit: (layout: any, name: string) => { ratio: number } | null
 * }} layout
 * @property {(name: string) => void} focusPane
 * @property {() => void} renderActiveWorkspace
 */

/**
 * @param {PaneNavDeps} deps
 */
export function createPaneNav(deps) {
  const { state, layout, focusPane, renderActiveWorkspace } = deps;

  /**
   * @param {string} arrowKey
   */
  function navigatePanes(arrowKey) {
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    if (!ws?.layout) return;
    const leaves = layout.getLeafList(ws.layout);
    if (!leaves.length) return;
    if (!state.focusedPane) return;
    const idx = leaves.indexOf(state.focusedPane);
    const newIdx = (arrowKey === "ArrowRight" || arrowKey === "ArrowDown")
      ? (idx + 1) % leaves.length
      : (idx - 1 + leaves.length) % leaves.length;
    focusPane(leaves[newIdx]);
  }

  /**
   * @param {string} arrowKey
   */
  function resizeFocused(arrowKey) {
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    if (!ws?.layout || ws.layout.type !== "split") return;
    if (!state.focusedPane) return;
    const splitNode = layout.findParentSplit(ws.layout, state.focusedPane);
    if (!splitNode) return;
    const delta = 0.05;
    splitNode.ratio = (arrowKey === "ArrowRight" || arrowKey === "ArrowDown")
      ? Math.min(0.85, splitNode.ratio + delta)
      : Math.max(0.15, splitNode.ratio - delta);
    renderActiveWorkspace();
  }

  return { navigatePanes, resizeFocused };
}
