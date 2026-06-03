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
