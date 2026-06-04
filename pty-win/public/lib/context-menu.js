// @ts-check
// Context-menu action dispatcher (Round 22).
//
// The right-click menu in pty-win exposes 9 actions. Previously a single
// arrow function handled them all with a switch statement (complexity 33).
// This module factors each action into a small, dependency-injected
// helper and exposes a dispatcher map so the event listener in app.js
// becomes a one-line lookup.

/**
 * @typedef {{
 *   state: {
 *     sessions: Map<string, { command: string, status: string, workingDir?: string }>,
 *     aiPresets: Array<{ command: string }>,
 *     folderCache: Map<string, unknown>,
 *     expandedPaths: Set<string>,
 *     favorites: string[],
 *     pinnedFolders: string[],
 *   },
 *   openFolder: (path: string, name: string, command?: string, newWorkspace?: boolean) => unknown,
 *   renderTree: () => void,
 *   renderQuickAccess: () => void,
 *   saveFavorites: () => void,
 *   savePinnedFolders: () => void,
 *   normPath: (p: string) => string,
 *   fetchFn?: typeof fetch,
 *   promptFn?: (msg: string, init?: string) => string|null,
 *   alertFn?: (msg: string) => void,
 * }} ContextMenuDeps
 */

const INVALID_FOLDER_CHAR = /[/\\:*?"<>|]/;

/**
 * Send a POST /force-idle for every busy AI session whose workingDir
 * matches the given path. Failures are intentionally swallowed.
 *
 * @param {string} path
 * @param {ContextMenuDeps["state"]} state
 * @param {(input: string, init?: RequestInit) => unknown} fetcher
 * @param {(p: string) => string} normPath
 */
export function forceIdleInFolder(path, state, fetcher, normPath) {
  const fnp = normPath(path);
  const aiCmds = new Set(state.aiPresets.map((p) => p.command));
  for (const [sName, s] of state.sessions) {
    if (aiCmds.has(s.command) && s.status === "busy" && s.workingDir && normPath(s.workingDir) === fnp) {
      fetcher(`/api/sessions/${encodeURIComponent(sName)}/force-idle`, { method: "POST" });
    }
  }
}

/**
 * Validate a sub-folder name. Returns null if valid, otherwise an error
 * message describing what's wrong.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function validateSubfolderName(raw) {
  if (!raw || !raw.trim()) return ""; // empty -> silent skip (special sentinel)
  const trimmed = raw.trim();
  if (INVALID_FOLDER_CHAR.test(trimmed)) {
    return `Invalid folder name. Avoid: / \\ : * ? " < > |`;
  }
  return null;
}

/**
 * @param {string} path
 * @param {string} trimmed
 * @param {ContextMenuDeps["state"]} state
 * @param {{ fetcher: typeof fetch, alertF: (m: string) => void, renderTree: () => void }} deps
 */
export async function createSubfolderAndRefresh(path, trimmed, state, deps) {
  try {
    const res = await deps.fetcher("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentPath: path, name: trimmed }),
    });
    if (!res.ok) {
      const err = await res.json();
      deps.alertF(err.error || "Failed to create folder");
      return;
    }
    state.folderCache.delete(path);
    state.expandedPaths.add(path);
    deps.renderTree();
  } catch (err) {
    deps.alertF("Failed to create folder: " + (err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Add `path` to favorites if not already present; persist + re-render.
 * Returns true when state changed.
 *
 * @param {string} path
 * @param {ContextMenuDeps["state"]} state
 * @param {{ saveFavorites: () => void, renderTree: () => void }} deps
 */
export function addFavorite(path, state, deps) {
  if (state.favorites.includes(path)) return false;
  state.favorites.push(path);
  deps.saveFavorites();
  deps.renderTree();
  return true;
}

/**
 * Remove `path` from favorites; persist + re-render. Returns true when
 * state changed.
 *
 * @param {string} path
 * @param {ContextMenuDeps["state"]} state
 * @param {{ saveFavorites: () => void, renderTree: () => void }} deps
 */
export function removeFavorite(path, state, deps) {
  const idx = state.favorites.indexOf(path);
  if (idx === -1) return false;
  state.favorites.splice(idx, 1);
  deps.saveFavorites();
  deps.renderTree();
  return true;
}

/**
 * @param {string} path
 * @param {ContextMenuDeps["state"]} state
 * @param {{ savePinnedFolders: () => void, renderQuickAccess: () => void }} deps
 */
export function addPin(path, state, deps) {
  if (state.pinnedFolders.includes(path)) return false;
  state.pinnedFolders.push(path);
  deps.savePinnedFolders();
  deps.renderQuickAccess();
  return true;
}

/**
 * @param {string} path
 * @param {ContextMenuDeps["state"]} state
 * @param {{ savePinnedFolders: () => void, renderQuickAccess: () => void }} deps
 */
export function removePin(path, state, deps) {
  const idx = state.pinnedFolders.indexOf(path);
  if (idx === -1) return false;
  state.pinnedFolders.splice(idx, 1);
  deps.savePinnedFolders();
  deps.renderQuickAccess();
  return true;
}

/**
 * Build the action-name -> handler dispatcher table. Each handler
 * receives (path, name) and may return a Promise.
 *
 * @param {ContextMenuDeps} deps
 * @returns {Record<string, (path: string, name: string) => unknown>}
 */
export function buildContextMenuActions(deps) {
  // Bind to window so callers can invoke as `deps.fetcher(...)` without
  // tripping "Illegal invocation" -- bare fetch requires window receiver.
  const fetcher = deps.fetchFn || fetch.bind(window);
  const promptF = deps.promptFn || ((m, i) => prompt(m, i));
  const alertF = deps.alertFn || ((m) => alert(m));
  const favDeps = { saveFavorites: deps.saveFavorites, renderTree: deps.renderTree };
  const pinDeps = { savePinnedFolders: deps.savePinnedFolders, renderQuickAccess: deps.renderQuickAccess };
  return {
    "open": (path, name) => { deps.openFolder(path, name); },
    "open-new-ws": (path, name) => { deps.openFolder(path, name, undefined, true); },
    "open-cmd": (path, name) => {
      const cmd = promptF("Command to run:", "cmd.exe");
      if (cmd) deps.openFolder(path, name, cmd);
    },
    "force-idle": (path) => forceIdleInFolder(path, deps.state, fetcher, deps.normPath),
    "new-folder": async (path) => {
      const raw = promptF("New folder name:");
      const err = validateSubfolderName(raw);
      if (err === "") return;          // empty/whitespace - silent skip
      if (err !== null) { alertF(err); return; }
      const trimmed = (raw || "").trim();
      await createSubfolderAndRefresh(path, trimmed, deps.state, {
        fetcher, alertF, renderTree: deps.renderTree,
      });
    },
    "fav-add": (path) => { addFavorite(path, deps.state, favDeps); },
    "fav-remove": (path) => { removeFavorite(path, deps.state, favDeps); },
    "pin-add": (path) => { addPin(path, deps.state, pinDeps); },
    "pin-remove": (path) => { removePin(path, deps.state, pinDeps); },
  };
}

/**
 * Parse the click target into the (action, target-path, name) tuple
 * that the dispatcher needs. Returns null if the click should be
 * ignored (no action attribute, disabled item, no ctxTarget).
 *
 * @param {EventTarget|null} clickTarget
 * @param {string|null|undefined} ctxTarget
 * @returns {{ action: string, path: string, name: string }|null}
 */
export function resolveContextAction(clickTarget, ctxTarget) {
  const item = clickTarget instanceof Element
    ? /** @type {HTMLElement | null} */ (clickTarget.closest(".ctx-item"))
    : null;
  const action = item?.dataset["action"];
  if (!action || !ctxTarget || item?.classList.contains("ctx-disabled")) return null;
  const path = ctxTarget;
  const name = path.split(/[/\\]/).filter(Boolean).pop() || path;
  return { action, path, name };
}
