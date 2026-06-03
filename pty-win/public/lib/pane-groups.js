// @ts-check
// Pane groups — consolidates Claude + PowerShell sessions per folder into groups.
// Canonical home for this logic; app.js imports from here.
//
// Previously duplicated as src/pane-groups.ts (test-only); consolidated as part
// of tracker e0ca3757 after happy-dom test runner landed.

/** @typedef {import('./state.js').SessionInfo} SessionInfo */
/** @typedef {import('./state.js').PaneGroup} PaneGroup */

/**
 * Rebuild pane groups from a sessions map.
 * Groups Claude and PowerShell sessions by folder basename.
 * Preserves activeType from previous groups where possible.
 * Pure: returns a new Map without mutating inputs.
 *
 * @param {Map<string, SessionInfo>} sessions
 * @param {Map<string, PaneGroup>} prevGroups
 * @returns {Map<string, PaneGroup>}
 */
export function rebuildPaneGroups(sessions, prevGroups) {
  // Preserve activeType selections across rebuilds.
  /** @type {Map<string, "claude" | "pwsh">} */
  const prevActive = new Map();
  for (const [g, pg] of prevGroups) prevActive.set(g, pg.activeType);

  /** @type {Map<string, PaneGroup>} */
  const groups = new Map();
  for (const [name, info] of sessions) {
    const group = info.group || name;
    if (!groups.has(group)) {
      groups.set(group, { activeType: prevActive.get(group) || "claude" });
    }
    const pg = /** @type {PaneGroup} */ (groups.get(group));
    if (name.endsWith("~pwsh")) {
      pg.pwsh = name;
    } else {
      pg.claude = name;
    }
  }

  // If activeType points to a dead/missing session, flip to the other.
  for (const [, pg] of groups) {
    if (pg.activeType === "pwsh" && !pg.pwsh) pg.activeType = "claude";
    if (pg.activeType === "claude" && !pg.claude) pg.activeType = "pwsh";
  }

  return groups;
}
