// @ts-check
// Navigation selectors (Phase 9a-B — first selector module).
//
// Reads are derived from authoritative state fields. The point of this
// module is to give the rest of the codebase a single concept ("are we
// in dashboard mode?") that decouples consumers from how it's backed.
//
// Background: `state.isDashboard` and `state.activeWorkspaceId === null`
// have always been equivalent (set together in app.js's switchToWorkspace
// and switchToDashboard). They're never independently consistent or
// inconsistent — they're two encodings of the same fact. Phase 9a-B
// introduces the selector so consumers stop reading the backing boolean.
// Phase 9b-E will drop the `isDashboard` field entirely once the
// workspaces store owns the persisted blob.
//
// Until 9b-E, the selector prefers the boolean (if explicitly set) and
// falls back to the activeWorkspaceId check. This makes the selector
// safe to introduce now without changing any persisted-load behavior.

/**
 * @typedef {{
 *   isDashboard?: boolean,
 *   activeWorkspaceId?: string | null,
 * }} NavState
 */

/**
 * True when the UI is showing the dashboard (no active workspace).
 *
 * @param {NavState} state
 */
export function isDashboardMode(state) {
  if (typeof state.isDashboard === "boolean") return state.isDashboard;
  return !state.activeWorkspaceId;
}
