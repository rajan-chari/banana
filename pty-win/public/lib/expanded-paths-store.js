// @ts-check
// Expanded-paths store (Phase 8b — third model-layer slice).
//
// Backing collection is a Set<string> (not an array like favorites/pinned),
// because expanded-state mutations are high-frequency and we need O(1)
// has/add/delete. Persistence serializes via [...set] for compatibility
// with the existing "pty-win-expanded" storage format.
//
// API differences vs. array stores:
//   - add/delete return booleans for "did this actually change the set?",
//     so callers can skip persist+notify on no-op mutations (matches
//     native Set.add/delete semantics).
//   - toggle() is provided since it's a common pattern in folder-tree.
//   - replace(iter) re-seeds the set without going through add() one at
//     a time (used for autoexpand-on-favorite-init).

/**
 * @typedef {{
 *   state: { expandedPaths: Set<string> },
 *   storage?: { getItem: (k: string) => string | null, setItem: (k: string, v: string) => void },
 *   key?: string,
 *   onChange?: () => void,
 * }} ExpandedPathsStoreDeps
 */

/**
 * @param {ExpandedPathsStoreDeps} deps
 */
export function createExpandedPathsStore(deps) {
  const { state, onChange } = deps;
  const storage = deps.storage || localStorage;
  const key = deps.key || "pty-win-expanded";

  function persist() {
    storage.setItem(key, JSON.stringify([...state.expandedPaths]));
  }

  /** @returns {Set<string>} */
  function load() {
    try {
      const raw = storage.getItem(key);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  function init() {
    state.expandedPaths = load();
  }

  /** @param {string} path */
  function has(path) {
    return state.expandedPaths.has(path);
  }

  /**
   * @param {string} path
   * @param {{ notify?: boolean }} [opts]
   * @returns {boolean} true if newly added, false if already present (no-op)
   */
  function add(path, opts) {
    if (state.expandedPaths.has(path)) return false;
    state.expandedPaths.add(path);
    persist();
    if (opts?.notify !== false) onChange?.();
    return true;
  }

  /**
   * @param {string} path
   * @param {{ notify?: boolean }} [opts]
   * @returns {boolean} true if removed, false if not present (no-op)
   */
  function remove(path, opts) {
    if (!state.expandedPaths.delete(path)) return false;
    persist();
    if (opts?.notify !== false) onChange?.();
    return true;
  }

  /**
   * @param {string} path
   * @param {{ notify?: boolean }} [opts]
   * @returns {boolean} new presence state after toggle
   */
  function toggle(path, opts) {
    const nowPresent = !state.expandedPaths.has(path);
    if (nowPresent) state.expandedPaths.add(path);
    else state.expandedPaths.delete(path);
    persist();
    if (opts?.notify !== false) onChange?.();
    return nowPresent;
  }

  /**
   * @param {{ notify?: boolean }} [opts]
   * @returns {boolean} true if anything was removed
   */
  function clear(opts) {
    if (state.expandedPaths.size === 0) return false;
    state.expandedPaths.clear();
    persist();
    if (opts?.notify !== false) onChange?.();
    return true;
  }

  /**
   * Re-seed the entire set from an iterable. Used by init-time auto-expand
   * (favorites are expanded on first run). No diff is computed — always
   * persists and notifies (unless suppressed).
   *
   * @param {Iterable<string>} iter
   * @param {{ notify?: boolean }} [opts]
   */
  function replace(iter, opts) {
    state.expandedPaths = new Set(iter);
    persist();
    if (opts?.notify !== false) onChange?.();
  }

  function size() {
    return state.expandedPaths.size;
  }

  function raw() {
    return state.expandedPaths;
  }

  return { init, has, add, remove: remove, toggle, clear, replace, size, raw };
}
