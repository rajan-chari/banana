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
 * Normalize activeType against actual sessions in a pane group: if the
 * recorded active sibling is missing, return the surviving one. Pure
 * function — does NOT write back to any store. Used by both the
 * selector (per-read normalization) and `reconcilePaneActiveTypes` (so
 * the persisted activePaneTypes catches up to reality).
 *
 * @param {"claude"|"pwsh"} active
 * @param {{ claude?: string, pwsh?: string }} pg
 * @returns {"claude"|"pwsh"}
 */
function normalizeActiveType(active, pg) {
  if (active === "pwsh" && !pg.pwsh && pg.claude) return "claude";
  if (active === "claude" && !pg.claude && pg.pwsh) return "pwsh";
  return active;
}

/**
 * Build the per-group `{claude?, pwsh?}` membership map from a sessions
 * map. Shared by both `reconcilePaneActiveTypes` (reconciler) and
 * `getPaneGroups` (pure selector). The returned groups have NO
 * `activeType` yet — callers layer it on per their needs.
 *
 * @param {Map<string, SessionInfo>} sessions
 * @returns {Map<string, { claude?: string, pwsh?: string }>}
 */
function buildGroupMembership(sessions) {
  /** @type {Map<string, { claude?: string, pwsh?: string }>} */
  const groups = new Map();
  for (const [name, info] of sessions) {
    const group = info.group || name;
    let pg = groups.get(group);
    if (!pg) { pg = {}; groups.set(group, pg); }
    if (name.endsWith("~pwsh")) pg.pwsh = name;
    else pg.claude = name;
  }
  return groups;
}

/**
 * Reconcile the `activePaneTypes` store against a fresh sessions map.
 * Side-effect only — production reads go through `getPaneGroup`/
 * `getPaneGroups` (pure selectors) instead.
 *
 * Two reconciliation rules:
 *   - **flip-to-other**: when the active sibling is missing, set
 *     `activePaneTypes.set(group, surviving)` so the persisted store
 *     catches up to reality.
 *   - **stale prune**: DELETE entries for groups not present in the
 *     fresh sessions, so a group that disappears and later returns
 *     defaults to "claude". This preserves pre-9d behavior where
 *     activeType lived on cached PaneGroup objects discarded on rebuild.
 *
 * @param {Map<string, SessionInfo>} sessions
 * @param {PaneActiveTypeStore} activePaneTypes
 * @returns {void}
 */
export function reconcilePaneActiveTypes(sessions, activePaneTypes) {
  const membership = buildGroupMembership(sessions);
  for (const [group, pg] of membership) {
    const seed = /** @type {"claude"|"pwsh"} */ (activePaneTypes.get(group) || "claude");
    const normalized = normalizeActiveType(seed, pg);
    if (normalized !== seed) activePaneTypes.set(group, normalized);
  }
  // Stale-entry cleanup: groups no longer present release their store
  // entry so a reappearance defaults back to "claude".
  for (const group of [...activePaneTypes.raw().keys()]) {
    if (!membership.has(group)) activePaneTypes.delete(group);
  }
}

/**
 * Pure selector — derives the per-group `{claude?, pwsh?, activeType}`
 * shape from `state.sessions` + `state.activePaneTypes` with no side
 * effects. Applies the dead-sibling flip per read so callers never
 * see an `activeType` pointing at a missing session.
 *
 * Accepts the raw `Map<string, "claude"|"pwsh">` for activePaneTypes
 * (i.e. `state.activePaneTypes`), not the store. This keeps the selector
 * dependency-free and lets callers compose it without threading a store
 * port through every deps shape.
 *
 * @param {Map<string, SessionInfo>} sessions
 * @param {Map<string, "claude"|"pwsh">} activePaneTypes
 * @returns {Map<string, PaneGroup>}
 */
export function getPaneGroups(sessions, activePaneTypes) {
  /** @type {Map<string, PaneGroup>} */
  const groups = new Map();
  for (const [group, pg] of buildGroupMembership(sessions)) {
    const seed = activePaneTypes.get(group) || "claude";
    groups.set(group, { ...pg, activeType: normalizeActiveType(seed, pg) });
  }
  return groups;
}

/**
 * Convenience: select a single pane group by name. Returns undefined when
 * the group has no live sessions.
 *
 * @param {Map<string, SessionInfo>} sessions
 * @param {string} name
 * @param {Map<string, "claude"|"pwsh">} activePaneTypes
 * @returns {PaneGroup | undefined}
 */
export function getPaneGroup(sessions, name, activePaneTypes) {
  return getPaneGroups(sessions, activePaneTypes).get(name);
}
