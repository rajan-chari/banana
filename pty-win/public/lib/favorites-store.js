// @ts-check
// Favorites store (Phase 8a — model-layer demo slice).
//
// First proper "model layer" wrapper in pty-win: a single mutation API
// for the favorites list with built-in persistence + change notification.
// Prior to this, favorites mutations were duplicated in 4 sites:
//   - app.js inline (openFolder star + quick-action add)
//   - context-menu.js addFavorite / removeFavorite helpers
// Each site re-did the includes-then-push/splice dance and remembered to
// call saveFavorites(); the renderTree() call happened in some sites and
// not others.
//
// The store owns the mutation + persistence + change-notification.
// state.favorites stays as the backing array so existing readers
// (folder-tree.js, context-menu.js show()) keep working without change.
// A later step can replace those reads with store.list()/store.has().

/**
 * @typedef {{
 *   state: { favorites: string[] },
 *   storage?: { getItem: (k: string) => string | null, setItem: (k: string, v: string) => void },
 *   key?: string,
 *   defaultEntry?: string,
 *   onChange?: () => void,
 * }} FavoritesStoreDeps
 */

/**
 * @param {FavoritesStoreDeps} deps
 */
export function createFavoritesStore(deps) {
  const { state, onChange } = deps;
  const storage = deps.storage || localStorage;
  const key = deps.key || "pty-win-favorites";
  const defaultEntry = deps.defaultEntry === undefined ? "C:\\" : deps.defaultEntry;

  function persist() {
    storage.setItem(key, JSON.stringify(state.favorites));
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
    state.favorites = load();
    if (state.favorites.length === 0 && defaultEntry !== null) {
      state.favorites.push(defaultEntry);
      persist();
    }
  }

  /** @param {string} path */
  function has(path) {
    return state.favorites.includes(path);
  }

  /** @param {string} path */
  function add(path) {
    if (has(path)) return false;
    state.favorites.push(path);
    persist();
    onChange?.();
    return true;
  }

  /** @param {string} path */
  function remove(path) {
    const i = state.favorites.indexOf(path);
    if (i === -1) return false;
    state.favorites.splice(i, 1);
    persist();
    onChange?.();
    return true;
  }

  function list() {
    return state.favorites;
  }

  function count() {
    return state.favorites.length;
  }

  return { init, has, add, remove, list, count };
}
