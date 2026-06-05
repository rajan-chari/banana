// @ts-check
// Pane "active type" store (Phase 9d-0).
//
// Each PaneGroup represents a folder with possibly two sessions: a "claude"
// agent and a "pwsh" shell. The user can toggle which tab is shown at the
// top of the pane. That "currently visible" selection used to live on the
// cached PaneGroup object as `pg.activeType`, mutated in 6+ places.
//
// This store owns the writes. Backing field: `state.activePaneTypes`
// Map<string, "claude"|"pwsh">, keyed by group name (== folder basename).
//
// Lifecycle:
//   - Not persisted (resets on page reload, matching prior behavior).
//   - Stale entries (for groups no longer in `sessions`) are cleaned up
//     by `rebuildPaneGroups` so a group that disappears and later returns
//     defaults back to "claude" — matching pre-9d-0 behavior.
//
// Semantics:
//   - "active tab" / "currently visible", NOT "user preference". When the
//     active sibling dies, callers flip to the surviving sibling.

/**
 * @typedef {Object} PaneActiveTypeStore
 * @property {(name: string) => ("claude" | "pwsh" | undefined)} get
 * @property {(name: string, type: "claude" | "pwsh") => void} set
 * @property {(name: string) => boolean} delete
 * @property {() => void} clear
 * @property {(name: string) => boolean} has
 * @property {() => Map<string, "claude" | "pwsh">} raw
 */

/**
 * @param {{ state: { activePaneTypes?: Map<string, "claude" | "pwsh"> } }} deps
 * @returns {PaneActiveTypeStore}
 */
export function createPaneActiveTypeStore(deps) {
  if (!deps.state.activePaneTypes) deps.state.activePaneTypes = new Map();
  const map = /** @type {Map<string, "claude" | "pwsh">} */ (deps.state.activePaneTypes);

  return {
    get: (name) => map.get(name),
    set: (name, type) => { map.set(name, type); },
    delete: (name) => map.delete(name),
    clear: () => { map.clear(); },
    has: (name) => map.has(name),
    raw: () => map,
  };
}
