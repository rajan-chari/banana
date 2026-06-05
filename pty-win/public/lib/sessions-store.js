// @ts-check
// Sessions store (Phase 9e-A — sixth model-layer slice).
//
// Owns mutation of `state.sessions` (Map<string, SessionInfo>). The
// canonical writer is `replaceAll(serverList)` (called by ws-dispatcher
// when the server pushes a full snapshot). Future sub-phases add
// `updateStatus(name, patch)` (9e-B) and `remove(name)` (9e-C).
//
// The store keeps `state.sessions` as its backing Map so existing
// readers that pass the Map to helper functions (e.g. folder-tree's
// helpers.isFolderRunning, quick-access.pickActiveFolderSessions)
// continue to work without API changes. Direct reader call sites
// migrate to the typed API below.
//
// API:
//   replaceAll(list)   replace ALL sessions with the server snapshot.
//                      Calls onChange({ kind: "replace", prevNames }).
//   byName(name)       Map.get equivalent; returns SessionInfo | undefined.
//   has(name)          Map.has equivalent.
//   size()             count of sessions.
//   names()            array of session names.
//   list()             array of SessionInfo values.
//   entries()          array of [name, info] pairs.
//   raw()              returns the backing Map (for helpers that need
//                      the Map type signature; reader-only contract).
//
// Internal-only operations (not yet exposed):
//   - in-place mutation of status/unread/pendingPermission (added 9e-B
//     as updateStatus).
//   - per-name deletion (added 9e-C as remove).

/**
 * @typedef {import('./state.js').SessionInfo} SessionInfo
 */

/**
 * @typedef {{
 *   state: { sessions: Map<string, SessionInfo> },
 *   onChange?: (e: { kind: "replace", prevNames: Set<string> }) => void,
 * }} SessionsStoreDeps
 */

/**
 * @param {SessionsStoreDeps} deps
 */
export function createSessionsStore(deps) {
  const { state } = deps;
  const onChange = deps.onChange || (() => {});

  /**
   * Replace ALL sessions with the server snapshot. Returns the set of
   * names that were present BEFORE the replacement so the caller can do
   * orphan pruning (sessions that disappeared from the server).
   *
   * @param {Iterable<SessionInfo>} list
   * @returns {Set<string>} prevNames
   */
  function replaceAll(list) {
    const prevNames = new Set(state.sessions.keys());
    state.sessions.clear();
    for (const s of list) state.sessions.set(s.name, s);
    onChange({ kind: "replace", prevNames });
    return prevNames;
  }

  /** @param {string} name */
  function byName(name) { return state.sessions.get(name); }

  /** @param {string} name */
  function has(name) { return state.sessions.has(name); }

  function size() { return state.sessions.size; }
  function names() { return [...state.sessions.keys()]; }
  function list() { return [...state.sessions.values()]; }
  function entries() { return [...state.sessions.entries()]; }
  function raw() { return state.sessions; }

  return { replaceAll, byName, has, size, names, list, entries, raw };
}
