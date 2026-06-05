// @ts-check
// Folder-tree pure helpers — extracted from renderTree(),
// loadAndRenderChildren() and refreshTreeRunningState() (tracker 8eb3a993
// Phase 3). DOM building stays in app.js; only data-derivation moves here.

/** @typedef {import('./state.js').SessionInfo} SessionInfo */

/** @typedef {(path: string | undefined | null) => string} NormPathFn */

/**
 * True iff any *live* session has a workingDir that normalizes to the
 * same path as `folderPath`. Dead sessions are ignored.
 *
 * Matches the inline for-of-break pattern in renderTree (root rows) and
 * loadAndRenderChildren (child rows).
 *
 * @param {Iterable<[unknown, SessionInfo]> | Map<string, SessionInfo>} sessions
 * @param {string} folderPath
 * @param {NormPathFn} normPathFn
 * @returns {boolean}
 */
export function isFolderRunning(sessions, folderPath, normPathFn) {
  const target = normPathFn(folderPath);
  for (const [, s] of sessions) {
    if (s.status !== "dead" && s.workingDir && normPathFn(s.workingDir) === target) {
      return true;
    }
  }
  return false;
}

/**
 * Walk all sessions once and build two sets of normalized working-dir
 * paths: those with at least one live session, and those with any
 * unread > 0. Sessions missing a workingDir are skipped.
 *
 * Pure half of refreshTreeRunningState(); caller toggles DOM classes.
 *
 * @param {Iterable<[unknown, SessionInfo]> | Map<string, SessionInfo>} sessions
 * @param {NormPathFn} normPathFn
 * @returns {{ running: Set<string>, unread: Set<string> }}
 */
export function buildRunningUnreadSets(sessions, normPathFn) {
  /** @type {Set<string>} */
  const running = new Set();
  /** @type {Set<string>} */
  const unread = new Set();
  for (const [, s] of sessions) {
    if (!s.workingDir) continue;
    const np = normPathFn(s.workingDir);
    if (s.status !== "dead") running.add(np);
    if ((s.unreadCount ?? 0) > 0) unread.add(np);
  }
  return { running, unread };
}

/** @typedef {{
 *   sessionInfo: SessionInfo | null,
 *   sessionMatchesPath: boolean,
 *   pwshInfo: SessionInfo | null,
 *   pwshMatchesPath: boolean,
 * }} FolderSessionResolution */

/**
 * Resolve the claude+pwsh sessions whose name matches `folderName` AND
 * whose workingDir matches `folderPath`. The path check is essential:
 * a session may share a basename with this folder but actually be rooted
 * in a different directory; in that case it must NOT be reported here.
 *
 * Returns `null`-shaped info when a name has no session, with the
 * matching `*MatchesPath` flag false. When the named session exists but
 * is rooted elsewhere, the *Info is still returned but the flag is false
 * — this mirrors the inline code which sometimes reads ".status !== 'dead'"
 * on the info regardless of path match.
 *
 * @param {Map<string, SessionInfo>} sessions
 * @param {string} folderName
 * @param {string} folderPath
 * @param {NormPathFn} normPathFn
 * @returns {FolderSessionResolution}
 */
export function resolveFolderSessions(sessions, folderName, folderPath, normPathFn) {
  const target = normPathFn(folderPath);
  const sessionInfo = sessions.get(folderName) ?? null;
  const sessionMatchesPath =
    !!sessionInfo && !!sessionInfo.workingDir && normPathFn(sessionInfo.workingDir) === target;
  const pwshInfo = sessions.get(folderName + "~pwsh") ?? null;
  const pwshMatchesPath =
    !!pwshInfo && !!pwshInfo.workingDir && normPathFn(pwshInfo.workingDir) === target;
  return { sessionInfo, sessionMatchesPath, pwshInfo, pwshMatchesPath };
}

// ===== Round 23 renderTree helpers ==============================

/**
 * Compute the folder-count badge text. Empty string when no favorites.
 *
 * @param {string[]} favorites
 * @returns {string}
 */
export function folderCountText(favorites) {
  return favorites.length > 0 ? `(${favorites.length})` : "";
}

/**
 * Build the opts object for appendRowActions on a tree-root label,
 * collapsing the alive/identity/unread compute chain into a single
 * call site.
 *
 * @param {{
 *   workingDir: string,
 *   folderName: string,
 *   cached: { isClaudeReady?: boolean, hasIdentity?: boolean, identityName?: string|null } | null | undefined,
 *   sessionInfo: SessionInfo | null | undefined,
 *   sessionMatchesPath: boolean,
 *   pwshInfo: SessionInfo | null | undefined,
 *   pwshMatchesPath: boolean
 * }} args
 */
export function buildTreeRowActionsOpts(args) {
  const { workingDir, folderName, cached, sessionInfo, sessionMatchesPath, pwshInfo, pwshMatchesPath } = args;
  const matched = sessionMatchesPath ? sessionInfo : null;
  const pwshMatched = pwshMatchesPath ? pwshInfo : null;
  const cachedIdentity = cached ? cached.identityName : null;
  const sessionIdentity = matched ? matched.emcomIdentity : null;
  return {
    identityName: cachedIdentity || sessionIdentity || null,
    unreadCount: matched ? (matched.unreadCount || 0) : 0,
    workingDir,
    folderName,
    claudeAlive: !!(matched && matched.status !== "dead"),
    pwshAlive: !!(pwshMatched && pwshMatched.status !== "dead"),
    claudeCommand: matched ? (matched.command ?? null) : null,
    isClaudeReady: !!(cached && cached.isClaudeReady),
    hasIdentity: !!(cached && cached.hasIdentity),
  };
}

/**
 * Build opts for appendRowActions on a child entry (loadAndRenderChildren).
 * The child path uses entry-side identity/claude-ready flags directly
 * (no separate cache lookup) and is otherwise identical in shape to the
 * tree-root variant. Splitting the ternary/!! chain out of the inline
 * call site cuts ~10 from loadAndRenderChildren's cyclomatic count.
 *
 * @param {{ name: string, path: string, hasIdentity?: boolean,
 *           identityName?: string|null, isClaudeReady?: boolean }} entry
 * @param {FolderSessionResolution} resolution
 */
export function buildChildRowActionsOpts(entry, resolution) {
  const { sessionInfo, sessionMatchesPath, pwshInfo, pwshMatchesPath } = resolution;
  const matched = sessionMatchesPath ? sessionInfo : null;
  const pwshMatched = pwshMatchesPath ? pwshInfo : null;
  return {
    identityName: entry.hasIdentity ? (entry.identityName || null) : null,
    unreadCount: matched ? (matched.unreadCount || 0) : 0,
    workingDir: entry.path,
    folderName: entry.name,
    claudeAlive: !!(matched && matched.status !== "dead"),
    pwshAlive: !!(pwshMatched && pwshMatched.status !== "dead"),
    claudeCommand: matched ? (matched.command ?? null) : null,
    isClaudeReady: !!entry.isClaudeReady,
    hasIdentity: !!entry.hasIdentity,
  };
}

/**
 * Build the indent + arrow + folder-name row for a child tree entry.
 * Returns the row element with dataset.path set and the "running"
 * class applied. The caller appends actions, wires interactions, and
 * places the node in the tree.
 *
 * @param {{ name: string, path: string }} entry
 * @param {number} depth
 * @param {boolean} isExpanded
 * @param {boolean} isRunning
 * @param {(p: string|undefined|null) => string} normPathFn
 * @returns {HTMLDivElement}
 */
export function buildChildTreeRow(entry, depth, isExpanded, isRunning, normPathFn) {
  const row = document.createElement("div");
  row.className = "tree-node";
  row.dataset["path"] = normPathFn(entry.path);
  if (isRunning) row.classList.add("running");

  const indent = document.createElement("span");
  indent.className = "indent";
  indent.style.width = `${depth * 8}px`;
  row.appendChild(indent);

  const arrow = document.createElement("span");
  arrow.className = `arrow ${isExpanded ? "expanded" : ""}`;
  row.appendChild(arrow);

  const name = document.createElement("span");
  name.className = "folder-name";
  name.textContent = entry.name;
  row.appendChild(name);

  return row;
}

/**
 * Refresh the indicators + identity tag on a tree label once folder
 * info arrives from the server.
 *
 * @param {ParentNode} label
 * @param {{ isClaudeReady?: boolean, hasIdentity?: boolean, identityName?: string|null }} info
 */
export function applyFolderInfoToTreeLabel(label, info) {
  const slot = label.querySelector(".indicator-slot");
  if (slot) {
    const indC = /** @type {HTMLElement | null} */ (slot.querySelector(".indicator.claude-ready"));
    const indI = /** @type {HTMLElement | null} */ (slot.querySelector(".indicator.identity"));
    if (indC) {
      indC.classList.toggle("hidden-placeholder", !info.isClaudeReady);
      if (info.isClaudeReady) indC.title = "Has CLAUDE.md";
    }
    if (indI) {
      indI.classList.toggle("hidden-placeholder", !info.hasIdentity);
      if (info.hasIdentity) indI.title = `Identity: ${info.identityName || "yes"}`;
    }
  }
  const idTag = label.querySelector(".identity-tag");
  if (idTag && info.identityName) {
    idTag.textContent = info.identityName;
    idTag.classList.remove("hidden-placeholder");
  }
}

// ===== Folder-tree orchestrator factory (Phase 7a) =====

/**
 * Build and append a single root-folder element to the tree container.
 * Pulled out of renderTree() to keep the factory body under the
 * max-lines-per-function lint threshold.
 *
 * @param {string} rootPath
 * @param {HTMLElement} tree
 * @param {FolderTreeDeps} deps
 * @param {(path: string) => void} onToggle
 * @param {(parentPath: string, container: HTMLElement, depth: number) => void} onLoadChildren
 * @param {typeof fetch} fetcher
 */
function appendRootFolder(rootPath, tree, deps, onToggle, onLoadChildren, fetcher) {
  const { state, doc, helpers, actions } = deps;
  const rootName = rootPath.split(/[/\\]/).filter(Boolean).pop() || rootPath;
  const rootEl = doc.createElement("div");
  rootEl.className = "tree-root";

  const label = doc.createElement("div");
  label.className = "tree-root-label";
  label.dataset["path"] = helpers.normPath(rootPath);
  const expanded = state.expandedPaths.has(rootPath);

  const arrow = doc.createElement("span");
  arrow.className = `arrow ${expanded ? "expanded" : ""}`;
  label.appendChild(arrow);

  const nameSpan = doc.createElement("span");
  nameSpan.className = "root-name";
  nameSpan.textContent = rootName;
  label.appendChild(nameSpan);

  if (helpers.isFolderRunning(state.sessions, rootPath, helpers.normPath)) {
    nameSpan.classList.add("running");
  }

  const rootResolved = helpers.resolveFolderSessions(state.sessions, rootName, rootPath, helpers.normPath);
  const rootCacheKey = helpers.normPath(rootPath);
  const rootCached = state.folderInfoCache.get(rootCacheKey);
  actions.appendRowActions(label, helpers.buildTreeRowActionsOpts({
    workingDir: rootPath,
    folderName: rootName,
    cached: rootCached,
    sessionInfo: rootResolved.sessionInfo,
    sessionMatchesPath: rootResolved.sessionMatchesPath,
    pwshInfo: rootResolved.pwshInfo,
    pwshMatchesPath: rootResolved.pwshMatchesPath,
  }));
  if (!rootCached) {
    fetcher(`/api/folder-info?path=${encodeURIComponent(rootPath)}`)
      .then((r) => r.json())
      .then((info) => {
        state.folderInfoCache.set(rootCacheKey, info);
        if (!label.isConnected) return;
        helpers.applyFolderInfoToTreeLabel(label, info);
      })
      .catch(() => {});
  }

  /** @type {any} */ (label).onclick = () => onToggle(rootPath);
  label.addEventListener("contextmenu", /** @param {Event} ev */ (ev) => {
    actions.showContextMenu(/** @type {MouseEvent} */ (ev), rootPath);
  });
  rootEl.appendChild(label);

  const childContainer = doc.createElement("div");
  childContainer.className = `tree-children ${expanded ? "expanded" : ""}`;
  childContainer.id = `children-${helpers.cssId(rootPath)}`;
  rootEl.appendChild(childContainer);

  tree.appendChild(rootEl);

  if (expanded) onLoadChildren(rootPath, childContainer, 1);
}

/**
 * Build and append a single child-folder node. Pulled out of
 * loadAndRenderChildren() for the same lint-size reason.
 *
 * @param {any} entry
 * @param {number} depth
 * @param {HTMLElement} container
 * @param {FolderTreeDeps} deps
 * @param {(path: string) => void} onToggle
 * @param {(parentPath: string, container: HTMLElement, depth: number) => void} onLoadChildren
 */
function appendChildFolder(entry, depth, container, deps, onToggle, onLoadChildren) {
  const { state, doc, helpers, actions } = deps;
  const node = doc.createElement("div");
  const isExpanded = state.expandedPaths.has(entry.path);
  const isRunning = helpers.isFolderRunning(state.sessions, entry.path, helpers.normPath);
  const row = helpers.buildChildTreeRow(entry, depth, isExpanded, isRunning, helpers.normPath);
  const resolution = helpers.resolveFolderSessions(state.sessions, entry.name, entry.path, helpers.normPath);
  actions.appendRowActions(row, helpers.buildChildRowActionsOpts(entry, resolution));
  /** @type {any} */ (row).onclick = () => onToggle(entry.path);
  row.addEventListener("contextmenu", /** @param {Event} ev */ (ev) => {
    actions.showContextMenu(/** @type {MouseEvent} */ (ev), entry.path);
  });
  /** @type {any} */ (row).draggable = true;
  row.addEventListener("dragstart", /** @param {Event} ev */ (ev) => {
    const e = /** @type {DragEvent} */ (ev);
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("pty-win/folder", JSON.stringify({ workingDir: entry.path, folderName: entry.name }));
    e.dataTransfer.effectAllowed = "copy";
  });
  node.appendChild(row);
  const childContainer = doc.createElement("div");
  childContainer.className = `tree-children ${isExpanded ? "expanded" : ""}`;
  node.appendChild(childContainer);
  container.appendChild(node);
  if (isExpanded) onLoadChildren(entry.path, childContainer, depth + 1);
}

/**
 * @typedef {{
 *   state: {
 *     folderCache: Map<string, any[]>,
 *     visitedFolders: any[],
 *     favorites: string[],
 *     expandedPaths: Set<string>,
 *     folderInfoCache: Map<string, any>,
 *     sessions: Map<string, any>,
 *   },
 *   byId: (id: string) => HTMLElement | null,
 *   doc: Document,
 *   env: { fetchFn: typeof fetch },
 *   helpers: {
 *     normPath: (p: string | null | undefined) => string,
 *     folderCountText: (favs: string[]) => string,
 *     isFolderRunning: (sessions: any, path: string, normPathFn: any) => boolean,
 *     resolveFolderSessions: (sessions: any, name: string, path: string, normPathFn: any) => any,
 *     buildTreeRowActionsOpts: (args: any) => any,
 *     applyFolderInfoToTreeLabel: (label: HTMLElement, info: any) => void,
 *     cssId: (s: string) => string,
 *     buildChildTreeRow: (entry: any, depth: number, isExpanded: boolean, isRunning: boolean, normPathFn: any) => HTMLElement,
 *     buildChildRowActionsOpts: (entry: any, resolution: any) => any,
 *     buildRunningUnreadSets: (sessions: any, normPathFn: any) => { running: Set<string>, unread: Set<string> },
 *     saveExpandedPaths: () => void,
 *   },
 *   actions: {
 *     appendRowActions: (container: HTMLElement, opts: any) => void,
 *     showContextMenu: (e: MouseEvent, path: string) => void,
 *   }
 * }} FolderTreeDeps
 */

/**
 * Folder-tree orchestrator. Owns renderTree, refreshTreeRunningState, and
 * fetchChildren (the latter is exposed for completeness; in-tree mutation
 * helpers toggleExpand / loadAndRenderChildren are closure-private).
 *
 * Rubber-duck notes carried into this implementation:
 *  - folderCache is keyed by RAW path (parity with context-menu.js
 *    invalidator that calls state.folderCache.delete(path)).
 *  - folderInfoCache continues to use normPath(rootPath) as the key.
 *  - Async work is guarded by isConnected on both container (children
 *    fetch) and label (folder-info fetch) — covers rapid toggle and
 *    re-render races; matches Phase 6b sessions-panel hardening.
 *  - All fetches go through env.fetchFn so tests can shim them.
 *  - Per-row build is delegated to appendRootFolder / appendChildFolder
 *    module helpers to keep this factory under the size lint threshold.
 *
 * @param {FolderTreeDeps} deps
 */
export function createFolderTree(deps) {
  const { state, byId, doc, env, helpers } = deps;
  const fetcher = env.fetchFn || fetch.bind(window);

  /** @param {string} path */
  async function fetchChildren(path) {
    if (state.folderCache.has(path)) return state.folderCache.get(path);
    try {
      const res = await fetcher(`/api/folders?path=${encodeURIComponent(path)}`);
      const entries = await res.json();
      state.folderCache.set(path, entries);
      for (const e of entries) {
        if (e.isDir && !state.visitedFolders.find((v) => v.path === e.path)) {
          state.visitedFolders.push(e);
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  /** @param {string} path */
  async function toggleExpand(path) {
    if (state.expandedPaths.has(path)) state.expandedPaths.delete(path);
    else state.expandedPaths.add(path);
    helpers.saveExpandedPaths();
    renderTree();
  }

  /**
   * @param {string} parentPath
   * @param {HTMLElement} container
   * @param {number} depth
   */
  async function loadAndRenderChildren(parentPath, container, depth) {
    const entries = await fetchChildren(parentPath);
    if (!container.isConnected) return;
    container.innerHTML = "";
    for (const entry of entries) {
      if (!entry.isDir) continue;
      appendChildFolder(entry, depth, container, deps, toggleExpand, loadAndRenderChildren);
    }
  }

  function renderTree() {
    const tree = byId("folder-tree");
    if (!tree) return;
    tree.innerHTML = "";
    const folderCountEl = doc.querySelector(".folder-count");
    if (folderCountEl) folderCountEl.textContent = helpers.folderCountText(state.favorites);
    for (const rootPath of state.favorites) {
      appendRootFolder(rootPath, tree, deps, toggleExpand, loadAndRenderChildren, fetcher);
    }
  }

  function refreshTreeRunningState() {
    const { running, unread } = helpers.buildRunningUnreadSets(state.sessions, helpers.normPath);
    doc.querySelectorAll(".tree-node[data-path]").forEach(/** @param {Element} n */ (n) => {
      if (!(n instanceof HTMLElement)) return;
      const path = n.dataset["path"] ?? "";
      n.classList.toggle("running", running.has(path));
      const dot = n.querySelector(".unread-dot");
      if (dot) dot.classList.toggle("show", unread.has(path));
    });
    doc.querySelectorAll(".tree-root-label[data-path]").forEach(/** @param {Element} n */ (n) => {
      if (!(n instanceof HTMLElement)) return;
      const path = n.dataset["path"] ?? "";
      const nameSpan = n.querySelector(".root-name");
      if (nameSpan) nameSpan.classList.toggle("running", running.has(path));
      const dot = n.querySelector(".unread-dot");
      if (dot) dot.classList.toggle("show", unread.has(path));
    });
  }

  return { renderTree, refreshTreeRunningState, fetchChildren };
}
