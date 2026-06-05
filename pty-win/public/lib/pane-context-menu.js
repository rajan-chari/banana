// @ts-check
// Pure helpers for showPaneContextMenu (tracker cx-10). The orchestrating
// function stays in app.js because it threads app state and singletons;
// these helpers split out the resume-eligibility logic and the small
// menu-item factories so each piece is testable in isolation.

import { getPaneGroup } from "./pane-groups.js";

/** @typedef {{ status?: string, command?: string, workingDir?: string|null }} ClaudeSessionInfo */

/**
 * Decide whether the "Resume Claude session" item should appear in the
 * pane context menu and whether it should be enabled.
 *
 * The original three-flag logic:
 *   - isDeadAi: a Claude session exists, it's dead, and its command is
 *               one of the known AI presets.
 *   - isNoAi:   either no Claude session exists at all, or it's dead.
 *   - canResume: isDeadAi AND a workingDir is recorded (needed to relaunch).
 *
 * The menu shows the item whenever isDeadAi || isNoAi (i.e. there is no
 * live Claude session running). The item is enabled only when canResume.
 *
 * @param {ClaudeSessionInfo | null | undefined} claudeSession
 * @param {Iterable<string>} aiCommands
 * @returns {{ show: boolean, canResume: boolean, workingDir: string | null }}
 */
export function resolveResumeMenuState(claudeSession, aiCommands) {
  const cmds = aiCommands instanceof Set ? aiCommands : new Set(aiCommands);
  const isDeadAi = !!claudeSession
    && claudeSession.status === "dead"
    && !!claudeSession.command
    && cmds.has(claudeSession.command);
  const isNoAi = !claudeSession || claudeSession.status === "dead";
  const workingDir = isDeadAi ? (claudeSession?.workingDir ?? null) : null;
  return {
    show: isDeadAi || isNoAi,
    canResume: isDeadAi && !!workingDir,
    workingDir,
  };
}

/**
 * Build a single ctx-menu item. The onClick (if provided) is wired and
 * the disabled class is omitted; the caller decides disabled state.
 *
 * @param {string} text
 * @param {(() => void) | null} onClick
 * @param {string} [extraClass]
 * @returns {HTMLDivElement}
 */
export function makeCtxItem(text, onClick, extraClass = "") {
  const item = document.createElement("div");
  item.className = `ctx-item${extraClass ? " " + extraClass : ""}`;
  item.textContent = text;
  if (onClick) item.onclick = onClick;
  return item;
}

/** Build a thin separator <div> for ctx menus. */
export function makeCtxSeparator() {
  const sep = document.createElement("div");
  sep.className = "ctx-sep";
  return sep;
}

/** Build a (non-interactive) header label for a ctx-menu section.
 * @param {string} text
 */
export function makeCtxHeader(text) {
  const header = document.createElement("div");
  header.className = "ctx-header";
  header.textContent = text;
  return header;
}

// ===== Pane context menu orchestrator (Phase 4f) =====
//
// The orchestrator (formerly inline in app.js) — Move to <workspace>,
// + New workspace, Resume Claude session. Internally calls the pure
// helpers above. AI tag menu and AI picker stay in app.js.

/**
 * @typedef {Object} PaneCtxState
 * @property {Map<string, any>} sessions
 * @property {Map<string, "claude"|"pwsh">} activePaneTypes
 * @property {Array<{ id: string, name?: string, layout: any }>} workspaces
 * @property {Array<{ command: string }>} aiPresets
 *
 * @typedef {Object} PaneCtxDeps
 * @property {PaneCtxState} state
 * @property {{ byName: (name: string) => any }} sessions
 * @property {(id: string) => HTMLElement} byId
 * @property {Document} [doc]
 * @property {{
 *   removeSessionFromLayout: (layout: any, name: string) => any,
 *   getLeafList: (layout: any) => string[],
 *   buildBalancedTree: (leaves: string[]) => any
 * }} layout
 * @property {{
 *   updateWorkspaceTabName: (ws: any) => void,
 *   saveWorkspaces: () => void,
 *   setWorkspaceLayout: (ws: any, tree: any) => void,
 *   transactionFn: (fn: () => void) => void,
 * }} helpers
 * @property {{
 *   findWorkspaceContaining: (name: string) => any,
 *   createWorkspace: (name: string) => any,
 *   switchToWorkspace: (id: string) => void,
 *   openFolder: (path: string, group: string, type: string, focus: boolean, args?: string[]) => void,
 *   renderActiveWorkspace: () => void,
 *   renderTabs: () => void
 * }} actions
 */

/**
 * @param {PaneCtxDeps} deps
 */
export function createPaneContextMenu(deps) {
  const { state, byId, layout, helpers, actions, sessions } = deps;
  const doc = deps.doc || document;

  /**
   * @param {string} groupName
   * @param {any} fromWs
   * @param {any} toWs
   */
  function movePaneToWorkspace(groupName, fromWs, toWs) {
    helpers.transactionFn(() => {
      if (fromWs) {
        helpers.setWorkspaceLayout(fromWs, layout.removeSessionFromLayout(fromWs.layout, groupName));
      }
      const existing = toWs.layout ? layout.getLeafList(toWs.layout) : [];
      existing.push(groupName);
      helpers.setWorkspaceLayout(toWs, layout.buildBalancedTree(existing));
    });
    actions.renderTabs();
    actions.renderActiveWorkspace();
  }

  /** @param {HTMLElement} menu @param {string} groupName */
  function appendResumeSection(menu, groupName) {
    const pg = getPaneGroup(state.sessions, groupName, state.activePaneTypes);
    const claudeSession = pg?.claude ? sessions.byName(pg.claude) : null;
    const aiCommands = state.aiPresets.map((p) => p.command);
    const { show, canResume, workingDir } = resolveResumeMenuState(claudeSession, aiCommands);
    if (!show) return;

    const onResume = canResume && workingDir
      ? () => {
          menu.classList.add("hidden");
          actions.openFolder(workingDir, groupName, "claude", false, ["--resume"]);
        }
      : null;
    menu.appendChild(makeCtxItem("\u25b6 Resume Claude session", onResume, canResume ? "" : "ctx-disabled"));
    menu.appendChild(makeCtxSeparator());
  }

  /** @param {HTMLElement} menu @param {string} groupName @param {any} currentWs */
  function appendMoveToSection(menu, groupName, currentWs) {
    menu.appendChild(makeCtxHeader("Move to"));
    for (const ws of state.workspaces) {
      if (ws === currentWs) continue;
      menu.appendChild(makeCtxItem(ws.name || "(unnamed)", () => {
        movePaneToWorkspace(groupName, currentWs, ws);
        menu.classList.add("hidden");
      }));
    }
  }

  /** @param {HTMLElement} menu @param {string} groupName @param {any} currentWs */
  function appendNewWorkspaceItem(menu, groupName, currentWs) {
    menu.appendChild(makeCtxSeparator());
    menu.appendChild(makeCtxItem("+ New workspace", () => {
      const newWs = actions.createWorkspace(groupName);
      movePaneToWorkspace(groupName, currentWs, newWs);
      actions.switchToWorkspace(newWs.id);
      menu.classList.add("hidden");
    }));
  }

  /** @param {HTMLElement} menu */
  function attachCloseOnClickOutside(menu) {
    const close = (/** @type {MouseEvent} */ ev) => {
      const t = ev.target instanceof Node ? ev.target : null;
      if (!menu.contains(t)) {
        menu.classList.add("hidden");
        doc.removeEventListener("mousedown", close);
      }
    };
    setTimeout(() => doc.addEventListener("mousedown", close), 0);
  }

  /**
   * @param {MouseEvent} e
   * @param {string} groupName
   */
  function showPaneContextMenu(e, groupName) {
    const menu = byId("pane-context-menu");
    menu.innerHTML = "";
    menu.classList.remove("hidden");
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    const currentWs = actions.findWorkspaceContaining(groupName);
    appendResumeSection(menu, groupName);
    appendMoveToSection(menu, groupName, currentWs);
    appendNewWorkspaceItem(menu, groupName, currentWs);
    attachCloseOnClickOutside(menu);
  }

  return {
    showPaneContextMenu,
    movePaneToWorkspace,
    _appendResumeSection: appendResumeSection,
    _appendMoveToSection: appendMoveToSection,
    _appendNewWorkspaceItem: appendNewWorkspaceItem,
    _attachCloseOnClickOutside: attachCloseOnClickOutside,
  };
}
