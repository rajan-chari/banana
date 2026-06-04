// @ts-check
// Quick Access panel: pinned folders with status dot, action pills, drag, context menu.
// Extracted from app.js Round 19. Pure helpers exported for testing; renderQuickAccess
// is the orchestrating wirer that takes a deps object.

import { normPath } from "./format.js";

/**
 * @typedef {{
 *   name: string,
 *   status: string,
 *   command?: string|null,
 *   workingDir?: string,
 *   emcomIdentity?: string|null,
 *   unreadCount?: number,
 *   pendingPermission?: boolean
 * }} SessionLike
 */

/**
 * @typedef {{
 *   isClaudeReady?: boolean,
 *   hasIdentity?: boolean,
 *   identityName?: string|null
 * }} FolderInfo
 */

/**
 * Split active (non-dead) sessions for a folder into claude vs pwsh.
 * Picks the first match by iteration order for each. Returns nulls when missing.
 *
 * @param {Map<string, SessionLike> | Iterable<SessionLike>} sessions
 * @param {string} normalizedPath
 * @returns {{ claude: SessionLike|null, pwsh: SessionLike|null }}
 */
export function pickActiveFolderSessions(sessions, normalizedPath) {
  const iter = sessions instanceof Map ? sessions.values() : sessions;
  /** @type {SessionLike|null} */ let claude = null;
  /** @type {SessionLike|null} */ let pwsh = null;
  for (const s of iter) {
    if (!s || s.status === "dead") continue;
    if (normPath(s.workingDir) !== normalizedPath) continue;
    if (s.command === "pwsh") {
      if (!pwsh) pwsh = s;
    } else if (!claude) {
      claude = s;
    }
    if (claude && pwsh) break;
  }
  return { claude, pwsh };
}

/**
 * Compute the aggregated status dot for a folder row.
 *
 * @param {SessionLike|null} claude
 * @param {SessionLike|null} pwsh
 * @returns {{ status: "busy"|"starting"|"idle"|"dead", hasPermission: boolean }}
 */
export function computeFolderStatus(claude, pwsh) {
  const hasPermission = !!(claude?.pendingPermission || pwsh?.pendingPermission);
  if (claude?.status === "busy" || pwsh?.status === "busy") {
    return { status: "busy", hasPermission };
  }
  if (claude?.status === "starting" || pwsh?.status === "starting") {
    return { status: "starting", hasPermission };
  }
  if (claude || pwsh) return { status: "idle", hasPermission };
  return { status: "dead", hasPermission };
}

/**
 * Build the opts object for appendRowActions. Includes onKill closure when any
 * session is alive.
 *
 * @param {{
 *   claude: SessionLike|null,
 *   pwsh: SessionLike|null,
 *   cached: FolderInfo|null|undefined,
 *   folderPath: string,
 *   folderName: string,
 *   killSession: (name: string) => void
 * }} args
 */
export function buildRowActionsOptions(args) {
  const { claude, pwsh, cached, folderPath, folderName, killSession } = args;
  return {
    identityName: claude?.emcomIdentity || cached?.identityName || null,
    unreadCount: claude?.unreadCount || 0,
    workingDir: folderPath,
    folderName,
    claudeAlive: !!claude,
    pwshAlive: !!pwsh,
    claudeCommand: claude?.command || null,
    isClaudeReady: cached?.isClaudeReady || false,
    hasIdentity: cached?.hasIdentity || false,
    onKill: (claude || pwsh) ? () => {
      if (claude) killSession(claude.name);
      if (pwsh) killSession(pwsh.name);
    } : null,
  };
}

/**
 * Update the .indicator-slot indicators in `parent` from fetched folder info.
 * Mirrors the inline block that previously lived in three places in app.js.
 *
 * @param {ParentNode} parent
 * @param {FolderInfo} info
 */
export function applyFolderInfoToIndicators(parent, info) {
  const slot = parent.querySelector(".indicator-slot");
  if (!slot) return;
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

/**
 * Find the first non-dead session for a folder (any command).
 * Used by the row's click-to-focus handler.
 *
 * @param {Map<string, SessionLike> | Iterable<SessionLike>} sessions
 * @param {string} normalizedPath
 * @returns {SessionLike|null}
 */
export function findActiveSessionForFolder(sessions, normalizedPath) {
  const iter = sessions instanceof Map ? sessions.values() : sessions;
  for (const s of iter) {
    if (!s || s.status === "dead") continue;
    if (normPath(s.workingDir) === normalizedPath) return s;
  }
  return null;
}

/**
 * Build a single quick-access row element.
 *
 * @param {string} folderPath
 * @param {{
 *   state: { sessions: Map<string, SessionLike>, folderInfoCache: Map<string, FolderInfo> },
 *   focusExistingSession: (name: string) => void,
 *   openFolder: (path: string, name: string) => void,
 *   appendRowActions: (container: HTMLElement, opts: ReturnType<typeof buildRowActionsOptions>) => void,
 *   killSession: (name: string) => void,
 *   showContextMenu: (e: MouseEvent, path: string) => void,
 *   fetchFn?: typeof fetch
 * }} deps
 * @returns {HTMLDivElement}
 */
export function buildQuickAccessRow(folderPath, deps) {
  const { state, focusExistingSession, openFolder, appendRowActions, killSession, showContextMenu } = deps;
  const fetcher = deps.fetchFn || fetch;
  const name = folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;
  const np = normPath(folderPath);
  const { claude, pwsh } = pickActiveFolderSessions(state.sessions, np);
  const { status, hasPermission } = computeFolderStatus(claude, pwsh);
  const cached = state.folderInfoCache.get(np);

  const row = document.createElement("div");
  row.className = "quick-access-row";

  const dot = document.createElement("span");
  dot.className = `status-dot ${hasPermission ? "permission" : status}`;
  row.appendChild(dot);

  const label = document.createElement("span");
  label.className = "quick-access-name";
  label.textContent = name;
  label.onclick = () => {
    const existing = findActiveSessionForFolder(state.sessions, np);
    if (existing) focusExistingSession(existing.name);
    else openFolder(folderPath, name);
  };
  row.appendChild(label);

  appendRowActions(row, buildRowActionsOptions({
    claude, pwsh, cached, folderPath, folderName: name, killSession,
  }));

  if (!cached) {
    fetcher(`/api/folder-info?path=${encodeURIComponent(folderPath)}`)
      .then((r) => r.json())
      .then((info) => {
        state.folderInfoCache.set(np, info);
        applyFolderInfoToIndicators(row, info);
      })
      .catch(() => {});
  }

  row.addEventListener("contextmenu", (e) => showContextMenu(e, folderPath));
  row.draggable = true;
  row.addEventListener("dragstart", (e) => {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("pty-win/folder", JSON.stringify({ workingDir: folderPath, folderName: name }));
    e.dataTransfer.effectAllowed = "copy";
  });

  return row;
}

/**
 * Render the entire Quick Access panel from `state.pinnedFolders`.
 *
 * @param {{
 *   byId: (id: string) => HTMLElement|null,
 *   state: {
 *     pinnedFolders: string[],
 *     sessions: Map<string, SessionLike>,
 *     folderInfoCache: Map<string, FolderInfo>
 *   },
 *   focusExistingSession: (name: string) => void,
 *   openFolder: (path: string, name: string) => void,
 *   appendRowActions: (container: HTMLElement, opts: ReturnType<typeof buildRowActionsOptions>) => void,
 *   killSession: (name: string) => void,
 *   showContextMenu: (e: MouseEvent, path: string) => void,
 *   fetchFn?: typeof fetch
 * }} deps
 */
export function renderQuickAccess(deps) {
  const panel = deps.byId("quick-access-panel");
  if (!panel) return;
  panel.innerHTML = "";
  if (deps.state.pinnedFolders.length === 0) return;
  for (const folderPath of deps.state.pinnedFolders) {
    panel.appendChild(buildQuickAccessRow(folderPath, deps));
  }
}
