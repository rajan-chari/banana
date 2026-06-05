// @ts-check
// Pinned folders store (Phase 8b — second model-layer slice).
//
// Mirrors createFavoritesStore but for state.pinnedFolders (the Quick Access
// panel's pinned list). Owns mutation + persistence + onChange notification.
// Replaces the addPin/removePin helpers that used to live in context-menu.js
// (deleted as part of Phase 8b — no more parallel mutation helpers).

/**
 * @typedef {{
 *   state: { pinnedFolders: string[] },
 *   storage?: { getItem: (k: string) => string | null, setItem: (k: string, v: string) => void },
 *   key?: string,
 *   onChange?: () => void,
 * }} PinnedFoldersStoreDeps
 */

/**
 * @param {PinnedFoldersStoreDeps} deps
 */
export function createPinnedFoldersStore(deps) {
  const { state, onChange } = deps;
  const storage = deps.storage || localStorage;
  const key = deps.key || "pty-win-pinned";

  function persist() {
    storage.setItem(key, JSON.stringify(state.pinnedFolders));
  }

  function load() {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function init() {
    state.pinnedFolders = load();
  }

  /** @param {string} path */
  function has(path) {
    return state.pinnedFolders.includes(path);
  }

  /**
   * @param {string} path
   * @param {{ notify?: boolean }} [opts]
   * @returns {boolean} true if added, false if already present
   */
  function add(path, opts) {
    if (has(path)) return false;
    state.pinnedFolders.push(path);
    persist();
    if (opts?.notify !== false) onChange?.();
    return true;
  }

  /**
   * @param {string} path
   * @param {{ notify?: boolean }} [opts]
   * @returns {boolean} true if removed, false if not present
   */
  function remove(path, opts) {
    const i = state.pinnedFolders.indexOf(path);
    if (i === -1) return false;
    state.pinnedFolders.splice(i, 1);
    persist();
    if (opts?.notify !== false) onChange?.();
    return true;
  }

  function list() {
    return state.pinnedFolders;
  }

  function count() {
    return state.pinnedFolders.length;
  }

  return { init, has, add, remove, list, count };
}
