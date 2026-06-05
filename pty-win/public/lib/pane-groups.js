// @ts-check
// Pane groups — consolidates Claude + PowerShell sessions per folder into groups.
// Canonical home for this logic; app.js imports from here.
//
// Previously duplicated as src/pane-groups.ts (test-only); consolidated as part
// of tracker e0ca3757 after happy-dom test runner landed.

/** @typedef {import('./state.js').SessionInfo} SessionInfo */
/** @typedef {import('./state.js').PaneGroup} PaneGroup */
/** @typedef {import('./pane-active-type-store.js').PaneActiveTypeStore} PaneActiveTypeStore */

/**
 * Rebuild pane groups from a sessions map.
 * Groups Claude and PowerShell sessions by folder basename.
 * Seeds each new group's activeType from `activePaneTypes` (the persistent
 * "currently visible tab" store introduced in 9d-0).
 *
 * Side effects on `activePaneTypes` (intentional, see plan 9d-0):
 *   - flip-to-other when active sibling is missing (keeps store in sync
 *     so the bridge dual-write stays consistent).
 *   - DELETE stale entries for groups not present in the rebuilt map,
 *     so a group that disappears and later returns defaults to "claude"
 *     — preserving pre-9d-0 behavior.
 *
 * @param {Map<string, SessionInfo>} sessions
 * @param {PaneActiveTypeStore} activePaneTypes
 * @returns {Map<string, PaneGroup>}
 */
export function rebuildPaneGroups(sessions, activePaneTypes) {
  /** @type {Map<string, PaneGroup>} */
  const groups = new Map();
  for (const [name, info] of sessions) {
    const group = info.group || name;
    if (!groups.has(group)) {
      groups.set(group, { activeType: activePaneTypes.get(group) || "claude" });
    }
    const pg = /** @type {PaneGroup} */ (groups.get(group));
    if (name.endsWith("~pwsh")) {
      pg.pwsh = name;
    } else {
      pg.claude = name;
    }
  }

  // If activeType points to a dead/missing session, flip to the other.
  for (const [group, pg] of groups) {
    if (pg.activeType === "pwsh" && !pg.pwsh) {
      pg.activeType = "claude";
      activePaneTypes.set(group, "claude");
    }
    if (pg.activeType === "claude" && !pg.claude) {
      pg.activeType = "pwsh";
      activePaneTypes.set(group, "pwsh");
    }
  }

  // Clean up stale store entries for groups no longer present, so a group
  // that disappears and later returns defaults back to "claude". Preserves
  // pre-9d-0 behavior (active type used to live on cached PaneGroup objects
  // which were thrown away on rebuild).
  for (const group of [...activePaneTypes.raw().keys()]) {
    if (!groups.has(group)) activePaneTypes.delete(group);
  }

  return groups;
}
