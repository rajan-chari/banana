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
