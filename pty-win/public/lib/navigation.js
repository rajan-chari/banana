// @ts-check
// Navigation selectors.
//
// `isDashboardMode(state)` is a tiny but important selector: every consumer
// that asks "are we in dashboard mode?" goes through this single derivation
// instead of reading a backing field directly. After Phase 9b-E, the
// authoritative source is `state.activeWorkspaceId` alone — dashboard mode
// is exactly the absence of an active workspace.
//
// (Phase 9a-B introduced a transitional `state.isDashboard` boolean to make
// the migration safe; Phase 9b-E dropped that field once workspacesStore
// owned the persisted blob.)

/**
 * @typedef {{
 *   activeWorkspaceId?: string | null,
 * }} NavState
 */

/**
 * True when the UI is showing the dashboard (no active workspace).
 *
 * @param {NavState} state
 */
export function isDashboardMode(state) {
  return !state.activeWorkspaceId;
}
