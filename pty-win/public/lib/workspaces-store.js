// @ts-check
// Workspaces store (Phase 9b-A — fourth model-layer slice).
//
// Owns the three persisted fields that always travel together:
//   - state.workspaces        (array of { id, name, customName?, layout, ... })
//   - state.activeWorkspaceId (string | null)
//   - state.nextWorkspaceId   (monotonic counter for new ws ids)
//
// Plus the transitional isDashboard flag (kept in the persisted blob
// until Phase 9b-E so old code reading the same localStorage key still
// works during the rolling migration).
//
// Why one store, not three: the three fields are saved as one
// localStorage blob ("pty-win-workspaces") and mutated together
// in every workspace operation. Splitting them would re-introduce
// the "remember to call saveAll()" coordination problem that Phase 8
// eliminated for favorites/pinned/expanded.
//
// Transaction primitive: cross-workspace mutations (e.g. moving a
// pane between two workspaces in pane-context-menu) and multi-field
// mutations (create + setActive) call `transaction(fn)` to do many
// mutations under one persist + one notify. Inside fn, every store
// method still works normally — persist/notify just defer until
// transaction unwinds. Nested transactions are supported; only the
// outermost commits.

import { loadWorkspaces, saveWorkspaces } from "./persistence.js";
import { reorderWorkspaces } from "./workspace-tabs.js";

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   customName?: boolean,
 *   layout: any,
 *   lastFocusedPane?: string | null,
 * }} Workspace
 *
 * @typedef {{
 *   workspaces: Workspace[],
 *   activeWorkspaceId: string | null,
 *   nextWorkspaceId: number,
 *   isDashboard?: boolean,
 * }} WorkspacesState
 *
 * @typedef {{
 *   state: WorkspacesState,
 *   onChange?: () => void,
 *   loadFn?: () => any,
 *   saveFn?: () => void,
 * }} WorkspacesStoreDeps
 */

/**
 * @param {WorkspacesStoreDeps} deps
 */
// eslint-disable-next-line max-lines-per-function
export function createWorkspacesStore(deps) {
  const { state, onChange } = deps;
  const load = deps.loadFn || loadWorkspaces;
  const save = deps.saveFn || saveWorkspaces;

  let txDepth = 0;
  let pendingPersist = false;
  let pendingNotify = false;

  function persist() {
    if (txDepth > 0) { pendingPersist = true; return; }
    save();
  }

  function notify() {
    if (txDepth > 0) { pendingNotify = true; return; }
    onChange?.();
  }

  function init() {
    const saved = load();
    if (saved) {
      state.workspaces = saved.workspaces || [];
      state.activeWorkspaceId = saved.activeWorkspaceId || null;
      state.isDashboard = saved.isDashboard !== false;
      state.nextWorkspaceId = saved.nextId || 1;
    } else {
      state.workspaces = state.workspaces || [];
      state.activeWorkspaceId = state.activeWorkspaceId ?? null;
      state.isDashboard = state.isDashboard !== false;
      state.nextWorkspaceId = state.nextWorkspaceId || 1;
    }
    // Defensive: if activeWorkspaceId references a workspace that no
    // longer exists (e.g. localStorage partially cleared, downgrade from
    // a future schema), clear it. Otherwise selectors that derive
    // dashboard-mode from "no active workspace" would say "workspace
    // mode" while there's nothing to render.
    if (state.activeWorkspaceId && !state.workspaces.find((w) => w.id === state.activeWorkspaceId)) {
      state.activeWorkspaceId = null;
      state.isDashboard = true;
      // Don't notify on init — caller decides when to first render.
      save();
    }
  }

  function list() {
    return state.workspaces;
  }

  /** @param {string} id */
  function byId(id) {
    return state.workspaces.find((w) => w.id === id);
  }

  function active() {
    if (!state.activeWorkspaceId) return null;
    return byId(state.activeWorkspaceId) || null;
  }

  /**
   * Create a new workspace. Increments nextWorkspaceId then uses the
   * pre-increment value for the default name ("Workspace N" where N is
   * the same number that appears in the id). Preserves the exact
   * pre-9b-A semantic from app.js createWorkspace.
   *
   * @param {string | null} [name]
   * @returns {Workspace}
   */
  function create(name) {
    const id = `ws-${state.nextWorkspaceId++}`;
    /** @type {Workspace} */
    const ws = {
      id,
      name: name || `Workspace ${state.nextWorkspaceId - 1}`,
      layout: null,
    };
    state.workspaces.push(ws);
    persist();
    notify();
    return ws;
  }

  /**
   * Set the active workspace by id, or null for dashboard mode.
   * DATA-ONLY: does not touch focus, terminals, dashboard polling, or
   * the DOM. Callers (app.js's switchToWorkspace orchestrator) handle
   * those concerns. The isDashboard backing field is kept in sync
   * here until Phase 9b-E drops it.
   *
   * No-op (with no persist/notify) when:
   *  - id refers to a workspace that doesn't exist
   *  - the requested state matches current state
   *
   * @param {string | null} id
   * @returns {boolean} true if state actually changed
   */
  function setActive(id) {
    if (id !== null && !byId(id)) return false;
    const nextDashboard = id === null;
    if (state.activeWorkspaceId === id && state.isDashboard === nextDashboard) return false;
    state.activeWorkspaceId = id;
    state.isDashboard = nextDashboard;
    persist();
    notify();
    return true;
  }

  /**
   * Run a function with persist/notify deferred until it returns.
   * Nested transactions are supported — only the outermost commits.
   * If fn throws, current mutations are still persisted and notified
   * (matches the raw-mutation behavior the store replaces).
   *
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  function transaction(fn) {
    txDepth++;
    try {
      return fn();
    } finally {
      txDepth--;
      if (txDepth === 0) {
        if (pendingPersist) { pendingPersist = false; save(); }
        if (pendingNotify) { pendingNotify = false; onChange?.(); }
      }
    }
  }

  /**
   * Remove a workspace by id. No-op if the id doesn't exist. Does NOT
   * clear activeWorkspaceId — callers (app.js's removeWorkspace
   * orchestrator) decide whether to switch to dashboard / another ws.
   *
   * @param {string} id
   * @returns {boolean} true if a workspace was removed
   */
  function remove(id) {
    const idx = state.workspaces.findIndex((w) => w.id === id);
    if (idx === -1) return false;
    state.workspaces.splice(idx, 1);
    persist();
    notify();
    return true;
  }

  /**
   * Rename a workspace and mark it custom-named so future auto-rename
   * logic (e.g. derive-from-first-leaf) skips it. No-op if the id is
   * missing or both name and customName already match.
   *
   * @param {string} id
   * @param {string} name
   * @returns {boolean} true if state actually changed
   */
  function rename(id, name) {
    const ws = byId(id);
    if (!ws) return false;
    if (ws.name === name && ws.customName === true) return false;
    ws.name = name;
    ws.customName = true;
    persist();
    notify();
    return true;
  }

  /**
   * Reorder a workspace tab via drag-drop. `side` is "left" or "right"
   * relative to the target tab. No-op when ids are missing or the
   * order would not change.
   *
   * @param {string} srcId
   * @param {string} tgtId
   * @param {"left" | "right"} side
   * @returns {boolean}
   */
  function reorder(srcId, tgtId, side) {
    const before = state.workspaces.map((w) => w.id).join(",");
    const next = reorderWorkspaces(state.workspaces, srcId, tgtId, side);
    const after = next.map((/** @type {Workspace} */ w) => w.id).join(",");
    if (before === after) return false;
    state.workspaces = next;
    persist();
    notify();
    return true;
  }

  return { init, list, byId, active, create, setActive, remove, rename, reorder, transaction };
}
