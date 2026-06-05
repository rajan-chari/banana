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
 *   entries: () => Array<[string, { command: string, status: string, workingDir?: string }]>,
 *   list: () => Array<{ command: string, status: string, workingDir?: string }>,
 * }} ContextMenuSessionsPort
 */

/**
 * @typedef {{
 *   state: {
 *     aiPresets: Array<{ command: string }>,
 *     folderCache: Map<string, unknown>,
 *     favorites: string[],
 *     pinnedFolders: string[],
 *   },
 *   openFolder: (path: string, name: string, command?: string, newWorkspace?: boolean) => unknown,
 *   renderTree: () => void,
 *   renderQuickAccess: () => void,
 *   favorites: { add: (p: string) => boolean, remove: (p: string) => boolean, has: (p: string) => boolean },
 *   pinned: { add: (p: string) => boolean, remove: (p: string) => boolean, has: (p: string) => boolean },
 *   expanded: { add: (p: string, opts?: { notify?: boolean }) => boolean },
 *   sessions: ContextMenuSessionsPort,
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
 * @param {{ aiPresets: Array<{ command: string }> }} state
 * @param {ContextMenuSessionsPort} sessions
 * @param {(input: string, init?: RequestInit) => unknown} fetcher
 * @param {(p: string) => string} normPath
 */
export function forceIdleInFolder(path, state, sessions, fetcher, normPath) {
  const fnp = normPath(path);
  const aiCmds = new Set(state.aiPresets.map((p) => p.command));
  for (const [sName, s] of sessions.entries()) {
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
 * @param {{ fetcher: typeof fetch, alertF: (m: string) => void, renderTree: () => void, expanded: { add: (p: string, opts?: { notify?: boolean }) => boolean } }} deps
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
    deps.expanded.add(path, { notify: false });
    deps.renderTree();
  } catch (err) {
    deps.alertF("Failed to create folder: " + (err instanceof Error ? err.message : String(err)));
  }
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
  const favorites = deps.favorites;
  const pinned = deps.pinned;
  return {
    "open": (path, name) => { deps.openFolder(path, name); },
    "open-new-ws": (path, name) => { deps.openFolder(path, name, undefined, true); },
    "open-cmd": (path, name) => {
      const cmd = promptF("Command to run:", "cmd.exe");
      if (cmd) deps.openFolder(path, name, cmd);
    },
    "force-idle": (path) => forceIdleInFolder(path, deps.state, deps.sessions, fetcher, deps.normPath),
    "new-folder": async (path) => {
      const raw = promptF("New folder name:");
      const err = validateSubfolderName(raw);
      if (err === "") return;          // empty/whitespace - silent skip
      if (err !== null) { alertF(err); return; }
      const trimmed = (raw || "").trim();
      await createSubfolderAndRefresh(path, trimmed, deps.state, {
        fetcher, alertF, renderTree: deps.renderTree, expanded: deps.expanded,
      });
    },
    "fav-add": (path) => { favorites.add(path); },
    "fav-remove": (path) => { favorites.remove(path); },
    "pin-add": (path) => { pinned.add(path); },
    "pin-remove": (path) => { pinned.remove(path); },
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

/**
 * @typedef {{
 *   doc: Document,
 *   byId: (id: string) => HTMLElement | null,
 *   state: {
 *     ctxTarget?: string | null,
 *     aiPresets: Array<{ command: string }>,
 *   },
 *   favorites: { has: (p: string) => boolean },
 *   pinned: { has: (p: string) => boolean },
 *   sessions: ContextMenuSessionsPort,
 *   helpers: { normPath: (p: string) => string },
 *   actions: Record<string, (path: string, name: string) => unknown>,
 * }} CreateContextMenuDeps
 */

/**
 * Factory for the folder context-menu view (Phase 7c). Owns the per-show
 * DOM mutations (toggle disabled classes, position, reveal) and the two
 * dismissers (global doc click hides; menu click resolves+dispatches+
 * hides via doc bubble-up).
 *
 * Parity-first extraction: behavior matches the original inline code in
 * app.js exactly, including:
 *  - hide-on-any-document-click (menu click ALSO hides via bubble-up;
 *    we deliberately do NOT add stopPropagation),
 *  - .ctx-sep-pin display always reset to "" on show (legacy reset),
 *  - "Force idle" item visibility derived from busy AI sessions whose
 *    workingDir matches the target path.
 *
 * @param {CreateContextMenuDeps} deps
 */
export function createContextMenu(deps) {
  const { doc, byId, state, helpers, actions, favorites, pinned, sessions } = deps;
  const { normPath } = helpers;

  /**
   * @param {MouseEvent} e
   * @param {string} path
   */
  function show(e, path) {
    e.preventDefault();
    e.stopPropagation();
    // eslint-disable-next-line no-restricted-syntax -- single-writer UI ephemeral (which path the context menu is acting on); consumed only by handlers wired in this file.
    state.ctxTarget = path;

    const menu = byId("context-menu");
    if (!menu) return;
    const isFav = favorites.has(path);
    menu.querySelector('[data-action="fav-add"]')?.classList.toggle("ctx-disabled", isFav);
    menu.querySelector('[data-action="fav-remove"]')?.classList.toggle("ctx-disabled", !isFav);

    const isPinned = pinned.has(path);
    menu.querySelector('[data-action="pin-add"]')?.classList.toggle("ctx-disabled", isPinned);
    menu.querySelector('[data-action="pin-remove"]')?.classList.toggle("ctx-disabled", !isPinned);

    const pinSep = /** @type {HTMLElement | null} */ (menu.querySelector(".ctx-sep-pin"));
    if (pinSep) pinSep.style.display = "";

    const np = normPath(path);
    const aiCommands = new Set(state.aiPresets.map((p) => p.command));
    const hasBusyAI = sessions.list().some(
      (s) => aiCommands.has(s.command) && s.status === "busy" && !!s.workingDir && normPath(s.workingDir) === np
    );
    const forceIdleItem = /** @type {HTMLElement | null} */ (menu.querySelector('[data-action="force-idle"]'));
    if (forceIdleItem) forceIdleItem.style.display = hasBusyAI ? "" : "none";

    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.classList.remove("hidden");
  }

  function attachDismissers() {
    doc.addEventListener("click", () => {
      byId("context-menu")?.classList.add("hidden");
    });

    const menu = byId("context-menu");
    if (!menu) return;
    menu.addEventListener("click", /** @param {Event} ev */ async (ev) => {
      const resolved = resolveContextAction(ev.target, state.ctxTarget);
      if (!resolved) return;
      const handler = actions[resolved.action];
      if (handler) await handler(resolved.path, resolved.name);
      byId("context-menu")?.classList.add("hidden");
    });
  }

  return { show, attachDismissers };
}

