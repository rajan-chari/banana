// @ts-check
// Focus store (Phase 9c — fifth model-layer slice).
//
// Owns state.focusedPane — the group name of the currently focused pane
// (or null when nothing is focused, e.g. dashboard mode or empty
// workspace). Single writer: every previous raw `state.focusedPane = X`
// write moves through this store.
//
// API:
//   get()                  current focused pane or null
//   set(name)              unvalidated set. Returns true if it changed.
//                          Used by click-driven focus paths where the
//                          caller already validated the pane exists.
//   setOrFirst(name)       try setting `name`; if `name` is missing,
//                          falsy, or not in the active workspace's
//                          layout, fall back to the first leaf. Returns
//                          the pane that ended up focused (or null when
//                          the active workspace is empty / missing).
//   clear()                set to null. Returns true if it changed.
//   refocusToFirstLeaf()   set to the first leaf of the active workspace
//                          (or null). Returns the new value.
//
// The store keeps state.focusedPane as the authoritative backing field so
// readers across the codebase don't have to switch to the store all at
// once — they continue to read state.focusedPane directly. Writers MUST
// go through this store.
//
// `onChange` is called after each successful state change. Not all
// callers want a render, so the store calls it for every change; the
// app.js composition root decides what (if anything) to wire there.

/**
 * @typedef {{
 *   focusedPane: string | null,
 * }} FocusState
 *
 * @typedef {{
 *   state: FocusState,
 *   getActiveLayout: () => any,
 *   getLeafList: (layout: any) => string[],
 *   treeContains?: (layout: any, name: string) => boolean,
 *   onChange?: () => void,
 * }} FocusStoreDeps
 */

/**
 * @param {FocusStoreDeps} deps
 */
export function createFocusStore(deps) {
  const { state, getActiveLayout, getLeafList, onChange } = deps;
  const treeContains = deps.treeContains || defaultTreeContains;

  /** @returns {string | null} */
  function get() {
    return state.focusedPane;
  }

  /**
   * @param {string | null} name
   * @returns {boolean}
   */
  function set(name) {
    if (state.focusedPane === name) return false;
    state.focusedPane = name;
    onChange?.();
    return true;
  }

  /**
   * @returns {boolean}
   */
  function clear() {
    return set(null);
  }

  /**
   * Try to focus `name`; on failure (missing, falsy, not in layout) fall
   * back to the first leaf of the active workspace.
   *
   * @param {string | null | undefined} name
   * @returns {string | null}
   */
  function setOrFirst(name) {
    const layout = getActiveLayout();
    if (name && layout && treeContains(layout, name)) {
      set(name);
      return name;
    }
    return refocusToFirstLeaf();
  }

  /** @returns {string | null} */
  function refocusToFirstLeaf() {
    const layout = getActiveLayout();
    const leaves = layout ? getLeafList(layout) : [];
    const next = leaves.length > 0 ? leaves[0] : null;
    set(next);
    return next;
  }

  return { get, set, setOrFirst, clear, refocusToFirstLeaf };
}

/**
 * @param {any} node
 * @param {string} name
 * @returns {boolean}
 */
function defaultTreeContains(node, name) {
  if (!node) return false;
  if (node.type === "leaf") return (node.session || node.name) === name;
  if (!node.children) return false;
  return defaultTreeContains(node.children[0], name) || defaultTreeContains(node.children[1], name);
}
