// @ts-check
// Session-group derivation — pure functions extracted from
// renderSessionsPanel() (tracker 8eb3a993 Phase 3).
//
// app.js wraps these and supplies the pane-groups selector result +
// state.sessions at call time. All functions are read-only on their inputs.

/** @typedef {import('./state.js').SessionInfo} SessionInfo */
/** @typedef {import('./state.js').PaneGroup} PaneGroup */

/** @typedef {{
 *   group: string,
 *   pg: PaneGroup,
 *   claudeInfo: SessionInfo | null,
 *   pwshInfo: SessionInfo | null,
 *   claudeAlive: boolean,
 *   pwshAlive: boolean,
 *   workingDir: string | undefined,
 * }} ActiveSessionGroup */

/**
 * Build the list of "active" session groups from paneGroups + sessions.
 * A group is active when at least one of its claude/pwsh sessions exists
 * on the server AND has status !== "dead". The workingDir is taken from
 * whichever live session is present (claude preferred when both alive).
 *
 * @param {Map<string, PaneGroup>} paneGroups
 * @param {Map<string, SessionInfo>} sessions
 * @returns {ActiveSessionGroup[]}
 */
export function buildSessionGroups(paneGroups, sessions) {
  /** @type {ActiveSessionGroup[]} */
  const out = [];
  for (const [group, pg] of paneGroups) {
    const claudeInfo = pg.claude ? sessions.get(pg.claude) ?? null : null;
    const pwshInfo = pg.pwsh ? sessions.get(pg.pwsh) ?? null : null;
    const claudeAlive = !!(claudeInfo && claudeInfo.status !== "dead");
    const pwshAlive = !!(pwshInfo && pwshInfo.status !== "dead");
    if (!claudeAlive && !pwshAlive) continue;
    const primary = claudeAlive ? claudeInfo : pwshInfo;
    out.push({
      group,
      pg,
      claudeInfo,
      pwshInfo,
      claudeAlive,
      pwshAlive,
      workingDir: primary?.workingDir,
    });
  }
  return out;
}

/**
 * Predicate against a live group member. Returns true only when the
 * member is alive, present, and the predicate matches. Centralizes the
 * `alive && info?.X` pattern that drove computeGroupStatus's complexity.
 *
 * @param {boolean} alive
 * @param {SessionInfo | null} info
 * @param {(i: SessionInfo) => boolean} predicate
 * @returns {boolean}
 */
function liveMatch(alive, info, predicate) {
  return !!(alive && info && predicate(info));
}

/**
 * Worst-of-pair status for a group, with pendingPermission overriding
 * everything else. Mirrors the original inline logic in renderSessionsPanel
 * lines 643-648: busy > starting > idle, with "permission" trumping all.
 * Dead sessions are ignored (caller passes `*Alive` flags to express that).
 *
 * @param {SessionInfo | null} claudeInfo
 * @param {SessionInfo | null} pwshInfo
 * @param {boolean} claudeAlive
 * @param {boolean} pwshAlive
 * @returns {"permission" | "busy" | "starting" | "idle"}
 */
export function computeGroupStatus(claudeInfo, pwshInfo, claudeAlive, pwshAlive) {
  /** @param {(i: SessionInfo) => boolean} predicate */
  const anyLive = (predicate) =>
    liveMatch(claudeAlive, claudeInfo, predicate) ||
    liveMatch(pwshAlive, pwshInfo, predicate);
  if (anyLive((i) => !!i.pendingPermission)) return "permission";
  if (anyLive((i) => i.status === "busy")) return "busy";
  if (anyLive((i) => i.status === "starting")) return "starting";
  return "idle";
}

/**
 * Sum of unread counts across the live members of the group. Dead sessions
 * contribute 0. Missing/undefined counts treated as 0.
 *
 * @param {SessionInfo | null} claudeInfo
 * @param {SessionInfo | null} pwshInfo
 * @param {boolean} claudeAlive
 * @param {boolean} pwshAlive
 * @returns {number}
 */
export function computeGroupUnread(claudeInfo, pwshInfo, claudeAlive, pwshAlive) {
  const c = claudeAlive ? claudeInfo?.unreadCount ?? 0 : 0;
  const p = pwshAlive ? pwshInfo?.unreadCount ?? 0 : 0;
  return c + p;
}

/**
 * Pick the session name that a row-click should focus. Honors
 * pg.activeType === "pwsh" when the pwsh session is alive; otherwise
 * prefers the live claude, falling back to pwsh.
 *
 * Returns `null` only when neither member is named on the pane group,
 * which shouldn't happen in normal operation but is possible if both
 * pg.claude and pg.pwsh are missing.
 *
 * @param {PaneGroup} pg
 * @param {boolean} claudeAlive
 * @param {boolean} pwshAlive
 * @returns {string | null}
 */
export function getActiveSessionName(pg, claudeAlive, pwshAlive) {
  if (pg.activeType === "pwsh" && pwshAlive) return pg.pwsh ?? null;
  if (claudeAlive) return pg.claude ?? null;
  return pg.pwsh ?? null;
}
