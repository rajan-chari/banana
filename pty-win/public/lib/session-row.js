// @ts-check
//
// Sessions-panel row helpers — pure-ish DOM constructors and a data shaper
// for the per-row opts that renderSessionsPanel feeds into appendRowActions.
// Also hosts the createRowActions factory (Phase 6a) which owns the
// side-effecting tag builders shared by the sessions panel, folder tree, and
// quick-access list.
//
// Originally extracted from app.js renderSessionsPanel (Cx 19). Async
// handlers + global state access were kept in app.js until Phase 6a moved
// the tag builders here behind a narrow-port factory.

import { computeGroupStatus, computeGroupUnread, getActiveSessionName } from "./session-groups.js";

/** @typedef {import('./state.js').FolderInfo} FolderInfo */
/** @typedef {import('./session-groups.js').ActiveSessionGroup} ActiveSessionGroup */

/**
 * Create the empty-state element shown when no sessions exist.
 * @returns {HTMLDivElement}
 */
export function createEmptyRow() {
  const empty = document.createElement("div");
  empty.className = "sessions-empty";
  empty.textContent = "No sessions";
  return empty;
}

/**
 * Create the base row element (without actions) for an active session group.
 * Includes the status-dot + session-name and `data-group` attribute. Caller
 * is expected to append the right-side actions via appendRowActions.
 *
 * @param {ActiveSessionGroup} g
 * @param {string | null} focusedPane  current state.focusedPane
 * @returns {HTMLDivElement}
 */
export function createSessionRow(g, focusedPane) {
  const row = document.createElement("div");
  row.className = `session-row ${g.group === focusedPane ? "active" : ""}`;
  row.dataset["group"] = g.group;

  const dotClass = computeGroupStatus(g.claudeInfo, g.pwshInfo, g.claudeAlive, g.pwshAlive);
  const dot = document.createElement("span");
  dot.className = `status-dot ${dotClass}`;
  row.appendChild(dot);

  const name = document.createElement("span");
  name.className = "session-name";
  name.textContent = g.group;
  row.appendChild(name);

  return row;
}

/**
 * Build the opts object passed to appendRowActions. Pure data shaping;
 * caller supplies the onKill callback so the helper stays state-free.
 *
 * @param {ActiveSessionGroup} g
 * @param {FolderInfo | undefined} cached  result of state.folderInfoCache.get(...)
 * @param {() => void} onKill
 * @returns {{
 *   identityName: string | null,
 *   unreadCount: number,
 *   workingDir: string | undefined,
 *   folderName: string,
 *   claudeAlive: boolean,
 *   pwshAlive: boolean,
 *   claudeCommand: string | null,
 *   isClaudeReady: boolean,
 *   hasIdentity: boolean,
 *   onKill: () => void,
 * }}
 */
export function buildSessionRowActionsOpts(g, cached, onKill) {
  return {
    identityName: (g.claudeInfo || g.pwshInfo)?.emcomIdentity || null,
    unreadCount: computeGroupUnread(g.claudeInfo, g.pwshInfo, g.claudeAlive, g.pwshAlive),
    workingDir: g.workingDir,
    folderName: g.group,
    claudeAlive: g.claudeAlive,
    pwshAlive: g.pwshAlive,
    claudeCommand: g.claudeAlive ? g.claudeInfo?.command ?? null : null,
    isClaudeReady: cached?.isClaudeReady || false,
    hasIdentity: cached?.hasIdentity || false,
    onKill,
  };
}

/**
 * Patch the CLAUDE.md + identity indicator dots inside a session row after
 * an async folder-info fetch resolves. No-op if the slot is gone (row was
 * removed mid-fetch).
 *
 * @param {HTMLElement} row
 * @param {FolderInfo} info
 */
export function patchSessionRowIndicators(row, info) {
  const slot = row.querySelector(".indicator-slot");
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
 * Resolve the active session name for click-to-focus. Thin re-export of
 * getActiveSessionName so renderSessionsPanel can import everything it
 * needs from this module.
 *
 * @param {ActiveSessionGroup} g
 * @returns {string | null}
 */
export function activeNameForRow(g) {
  return getActiveSessionName(g.pg, g.claudeAlive, g.pwshAlive);
}

// =====================================================================
// Pure row-action element builders. Used inside appendRowActions
// (which still owns the three AI/pwsh/VS-Code tags that touch
// app-level state). These mirror the original inline DOM in app.js
// but are extracted so they can be unit-tested.
// =====================================================================

/**
 * Identity chip ("@name" or hidden placeholder). Always rendered to keep
 * column alignment across rows.
 * @param {string | null | undefined} identityName
 * @returns {HTMLSpanElement}
 */
export function buildIdentityTag(identityName) {
  const el = document.createElement("span");
  el.className = `identity-tag ${identityName ? "" : "hidden-placeholder"}`;
  el.textContent = identityName ? identityName : "@";
  return el;
}

/**
 * Unread-message badge ("(N)" or hidden placeholder).
 * @param {number} unreadCount
 * @returns {HTMLSpanElement}
 */
export function buildUnreadBadge(unreadCount) {
  const el = document.createElement("span");
  el.className = `unread-badge ${unreadCount > 0 ? "" : "hidden-placeholder"}`;
  el.textContent = unreadCount > 0 ? `(${unreadCount})` : "(0)";
  return el;
}

/**
 * Indicator-slot span containing the CLAUDE.md ◆ and identity ● dots.
 * Both dots are always present; visibility is via .hidden-placeholder.
 * @param {{ isClaudeReady: boolean, hasIdentity: boolean, identityName?: string | null }} opts
 * @returns {HTMLSpanElement}
 */
export function buildIndicatorSlot({ isClaudeReady, hasIdentity, identityName }) {
  const slot = document.createElement("span");
  slot.className = "indicator-slot";

  const indClaude = document.createElement("span");
  indClaude.className = `indicator claude-ready ${isClaudeReady ? "" : "hidden-placeholder"}`;
  indClaude.textContent = "\u25c6";
  if (isClaudeReady) indClaude.title = "Has CLAUDE.md";
  slot.appendChild(indClaude);

  const indIdentity = document.createElement("span");
  indIdentity.className = `indicator identity ${hasIdentity ? "" : "hidden-placeholder"}`;
  indIdentity.textContent = "\u25cf";
  if (hasIdentity) indIdentity.title = `Identity: ${identityName || "yes"}`;
  slot.appendChild(indIdentity);

  return slot;
}

/**
 * Kill button. When onKill is provided, wires the click handler with
 * stopPropagation. When omitted, the button still renders (column
 * alignment) but is non-interactive.
 * @param {(() => void) | null | undefined} onKill
 * @returns {HTMLButtonElement}
 */
export function buildKillButton(onKill) {
  const btn = document.createElement("button");
  btn.className = "kill-btn";
  btn.textContent = "\u00d7";
  if (onKill) {
    btn.title = "Kill session";
    btn.onclick = (e) => { e.stopPropagation(); onKill(); };
  } else {
    btn.style.pointerEvents = "none";
  }
  return btn;
}

// ===== createRowActions factory (Phase 6a) =====
//
// Owns the four side-effecting row tag builders (AI, PowerShell, VS Code,
// composer appendRowActions) shared by sessions panel, folder tree, and
// quick-access list. The pure builders above (identity, unread, indicator,
// kill) are referenced by the factory through closure.

/**
 * @typedef {{
 *   state: { aiPresets: any[], aiDefaultIndex: number },
 *   doc: Document,
 *   env: { fetchFn: typeof fetch },
 *   helpers: {
 *     getAiPresetForCommand: (cmd: string) => any,
 *     getDefaultAiCommand: () => string,
 *   },
 *   actions: {
 *     openFolder: (path: string, name: string, command?: string, newWorkspace?: boolean, args?: string[]) => Promise<unknown> | unknown,
 *     showQuickMessageInput: (folderName: string, anchor: HTMLElement) => void,
 *     showAiTagContextMenu: (e: MouseEvent, folderPath: string, folderName: string) => void,
 *   }
 * }} RowActionsDeps
 */

/**
 * @param {RowActionsDeps} deps
 */
export function createRowActions(deps) {
  const { state, doc, env, helpers, actions } = deps;
  const fetcher = env.fetchFn || fetch.bind(window);

  /**
   * @param {any} opts
   */
  function buildAiTag(opts) {
    const aiPreset = opts.claudeAlive && opts.claudeCommand
      ? helpers.getAiPresetForCommand(opts.claudeCommand)
      : state.aiPresets[state.aiDefaultIndex];
    const tag = doc.createElement("span");
    tag.className = `cmd-tag ${opts.claudeAlive ? "alive" : "absent"}`;
    tag.textContent = aiPreset.icon;
    if (opts.claudeAlive) {
      tag.title = `${aiPreset.name}: running — click to send message`;
      tag.onclick = (e) => { e.stopPropagation(); actions.showQuickMessageInput(opts.folderName, tag); };
    } else {
      tag.title = `Start ${aiPreset.name} (right-click for options)`;
      tag.onclick = (e) => { e.stopPropagation(); actions.openFolder(opts.workingDir, opts.folderName, helpers.getDefaultAiCommand()); };
      tag.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); actions.showAiTagContextMenu(e, opts.workingDir, opts.folderName); };
    }
    return tag;
  }

  /**
   * @param {any} opts
   */
  function buildPwshTag(opts) {
    const tag = doc.createElement("span");
    tag.className = `cmd-tag pwsh ${opts.pwshAlive ? "alive" : "absent"}`;
    tag.textContent = ">_";
    tag.title = opts.pwshAlive ? "PowerShell: running" : "Start PowerShell";
    if (!opts.pwshAlive) {
      tag.onclick = (e) => { e.stopPropagation(); actions.openFolder(opts.workingDir, opts.folderName, "pwsh"); };
    }
    return tag;
  }

  /**
   * @param {string} workingDir
   */
  function buildVsCodeTag(workingDir) {
    const tag = doc.createElement("span");
    tag.className = "cmd-tag code";
    tag.textContent = "\u003c/\u003e";
    tag.title = "Open in VS Code (click to launch)";
    tag.onclick = (e) => {
      e.stopPropagation();
      if (doc.fullscreenElement) doc.exitFullscreen().catch(() => {});
      fetcher("/api/open-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: workingDir }),
      });
    };
    return tag;
  }

  /**
   * @param {HTMLElement} container
   * @param {any} opts
   */
  function appendRowActions(container, opts) {
    container.appendChild(buildIdentityTag(opts.identityName));
    container.appendChild(buildUnreadBadge(opts.unreadCount));
    container.appendChild(buildAiTag(opts));
    container.appendChild(buildPwshTag(opts));
    container.appendChild(buildVsCodeTag(opts.workingDir));
    container.appendChild(buildIndicatorSlot(opts));
    container.appendChild(buildKillButton(opts.onKill));
  }

  return {
    appendRowActions,
    _buildAiTag: buildAiTag,
    _buildPwshTag: buildPwshTag,
    _buildVsCodeTag: buildVsCodeTag,
  };
}
