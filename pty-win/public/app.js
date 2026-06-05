// @ts-check
// pty-win — Folder-centric terminal multiplexer
//
// Loaded as an ES module. State, theme, and AI helpers live in lib/state.js
// (modularization tracker 8eb3a993, first cut). Further extractions happen
// incrementally so each commit stays bisectable.

// xterm.js globals — loaded via <script> tags in index.html, so they live on window
// instead of being importable. Declare for ts-check.
/** @typedef {any} XtermNS */
/** @type {XtermNS} */
const xtermTerminal = /** @type {any} */ (window).Terminal;
/** @type {XtermNS} */
const xtermFitAddon = /** @type {any} */ (window).FitAddon;
/** @type {XtermNS} */
const xtermWebLinksAddon = /** @type {any} */ (window).WebLinksAddon;

import {
  state,
  TERM_THEME,
  getDefaultAiCommand,
  getAiPresetForCommand,
  setAiDefault,
  syncAiDefaultFromServer,
} from "./lib/state.js";
import {
  loadSidebarWidth,
  saveSidebarWidth,
  saveWorkspaces,
  loadSessionMeta,
  saveSessionMeta,
} from "./lib/persistence.js";
import { createFavoritesStore } from "./lib/favorites-store.js";
import { createPinnedFoldersStore } from "./lib/pinned-folders-store.js";
import { createExpandedPathsStore } from "./lib/expanded-paths-store.js";
import { createWorkspacesStore } from "./lib/workspaces-store.js";
import { createFocusStore } from "./lib/focus-store.js";
import { createSessionsStore } from "./lib/sessions-store.js";
import { createPaneActiveTypeStore } from "./lib/pane-active-type-store.js";
import {
  buildBalancedTree,
  removeSessionFromLayout,
  insertAdjacentToPane,
  getLeafList,
  treeContains,
  findParentSplit,
} from "./lib/tiling.js";
import { rebuildPaneGroups as _rebuildPaneGroups } from "./lib/pane-groups.js";
import { isDashboardMode } from "./lib/navigation.js";
import { createWorkspaceTabs } from "./lib/workspace-tabs.js";
import { createSessionDrop } from "./lib/session-drop.js";
import { createLayoutPresets } from "./lib/layout-presets.js";
import { initFeedPanel } from "./lib/feed-panel.js";
import { initSettingsModal } from "./lib/settings-modal.js";
import { renderQuickAccess as _renderQuickAccess } from "./lib/quick-access.js";
import {
  computeSessionNames,
  estimatePtyDims,
  buildCreateSessionRequest,
  cleanupDeadSession,
  attachToSiblingWorkspace,
  tileNewSessionIntoWorkspace,
  optimisticallyAddNewSession,
} from "./lib/open-folder.js";
import {
  buildContextMenuActions,
  createContextMenu,
} from "./lib/context-menu.js";
import { createAgentsPanel } from "./lib/agents-panel.js";
import { createTrackerPanel } from "./lib/tracker-panel.js";
import { initRightPanel } from "./lib/right-panel.js";
import { createDashboardPanel } from "./lib/dashboard-panel.js";
import { createPaneDrag } from "./lib/pane-drag.js";
import { createTileRenderer } from "./lib/tile-renderer.js";
import { createPaneRuntime } from "./lib/pane-runtime.js";
import { createPaneLifecycle } from "./lib/pane-lifecycle.js";
import { createPaneNav } from "./lib/pane-nav.js";
import {
  normPath,
  cssId,
  fmtAgo,
  escapeHtml,
} from "./lib/format.js";
import {
  buildSessionGroups,
} from "./lib/session-groups.js";
import {
  findOrphanedLeaves,
  classifyOrphanGroups,
  rebalanceLayoutsWithoutLeaves,
} from "./lib/ws-handlers.js";
import { createWsDispatcher } from "./lib/ws-dispatcher.js";
import {
  isFolderRunning,
  buildRunningUnreadSets,
  resolveFolderSessions,
  folderCountText,
  buildTreeRowActionsOpts,
  buildChildRowActionsOpts,
  buildChildTreeRow,
  applyFolderInfoToTreeLabel,
  createFolderTree,
} from "./lib/folder-tree.js";
import {
  createEmptyRow,
  createSessionRow,
  buildSessionRowActionsOpts,
  patchSessionRowIndicators,
  activeNameForRow,
  createRowActions,
} from "./lib/session-row.js";
import {
  createPaneContextMenu,
} from "./lib/pane-context-menu.js";
import { createSessionsPanel } from "./lib/sessions-panel.js";
import { createQuickMessage } from "./lib/quick-message.js";

// ===== DOM helpers =====
// `byId` asserts non-null and returns HTMLElement, so callers can chain
// .style/.classList/.dataset without TS18047/2339 noise. It throws if the
// element is missing, which matches the existing implicit-crash behavior
// when `document.getElementById("x").foo` hit null at runtime.

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function byId(id) {
  const el = document.getElementById(id);
  if (!el) {
    console.error(`byId: #${id} missing`);
    throw new Error(`Element #${id} not found`);
  }
  return el;
}

/**
 * Get an element by id, asserting it is an HTMLInputElement at runtime.
 * Prefer over compile-time type-casts of byId(...): the cast only asserts
 * existence, not tag type — a future markup change (input -> textarea) would
 * silently break .value access. This throws on mismatch.
 * @param {string} id
 * @returns {HTMLInputElement}
 */
function inputById(id) {
  const el = byId(id);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Element #${id} is not an HTMLInputElement (got ${el.tagName})`);
  }
  return el;
}

/**
 * @param {string} id
 * @returns {HTMLSelectElement}
 */
function selectById(id) {
  const el = byId(id);
  if (!(el instanceof HTMLSelectElement)) {
    throw new Error(`Element #${id} is not an HTMLSelectElement (got ${el.tagName})`);
  }
  return el;
}

/**
 * @param {string} id
 * @returns {HTMLButtonElement}
 */
function buttonById(id) {
  const el = byId(id);
  if (!(el instanceof HTMLButtonElement)) {
    throw new Error(`Element #${id} is not an HTMLButtonElement (got ${el.tagName})`);
  }
  return el;
}

function rebuildPaneGroups() {
  state.paneGroups = _rebuildPaneGroups(state.sessions, activePaneTypes);
}

// ===== Folder-tree port (narrow surface for forward-ref callers) =====
//
// The architecture critique flagged the prior `let folderTree;` + optional-
// chain thunks as a hidden cycle: factories above need stable refs to
// renderTree/refreshTreeRunningState, but folderTree itself depends on
// the context-menu actions that run AFTER rowActions composes. The fix is
// a narrow "port" object: methods are explicit, slots start as noops, and
// the folder-tree implementation is bound in after createFolderTree() runs.
//
// Benefits over the prior pattern:
//  - folderTree can now be a `const` (no eslint-disable for prefer-const)
//  - No `?.` defensive optional-chain leaks: treePort.render is always a
//    function, just possibly a noop until binding
//  - The contract (what early callers can do to the tree) is documented
//    in one place — the port literal — not scattered across thunk vars
//
// All call sites that previously captured `renderTree` / `refreshTree-
// RunningState` arrows still work unchanged because those arrows now
// dispatch through treePort.

const treePort = {
  /** @type {() => void} */
  render: () => {},
  /** @type {() => void} */
  refreshRunningState: () => {},
};
const renderTree = () => treePort.render();
const refreshTreeRunningState = () => treePort.refreshRunningState();

const favorites = createFavoritesStore({
  state,
  onChange: () => renderTree(),
});

const pinned = createPinnedFoldersStore({
  state,
  onChange: () => renderQuickAccess(),
});

// Expanded-paths store: no onChange wired — call sites own renderTree()
// because mutations happen during high-frequency folder navigation and
// we want predictable, co-located renders (no surprise re-renders).
const expanded = createExpandedPathsStore({ state });

// Workspaces store (Phase 9b). Owns workspaces/activeWorkspaceId/
// nextWorkspaceId. No onChange wired here — switchToWorkspace and
// related orchestrators still own rendering side-effects so they can
// sequence renders + focus + RAF terminal-focus deliberately. The
// store handles the persistence side (saveWorkspaces blob) so callers
// don't have to.
const workspaces = createWorkspacesStore({ state, getLeafList });

/** @type {(ws: any, tree: any) => void} */
const setWorkspaceLayout = (ws, tree) => { workspaces.setLayout(ws.id, tree); };
/** @type {(fn: () => void) => void} */
const transactionFn = (fn) => { workspaces.transaction(fn); };

// Focus store (Phase 9c). Owns state.focusedPane. All previous raw
// `state.focusedPane =` writes go through one of: set / setOrFirst /
// clear / refocusToFirstLeaf. No onChange wired here — every caller
// orchestrates its own renderActiveWorkspace / focusPane / RAF dance.
const focus = createFocusStore({
  state,
  getActiveLayout: () => workspaces.active()?.layout || null,
  getLeafList,
  treeContains,
});

// Sessions store (Phase 9e). Owns state.sessions (Map<string,
// SessionInfo>). Backing field stays on `state` so helpers that take a
// Map argument keep working without API churn. ws-dispatcher is the
// canonical caller of replaceAll; later sub-phases add updateStatus
// (9e-B) and remove (9e-C).
const sessions = createSessionsStore({ state });

// Pane "active type" store (Phase 9d-0). Owns the writes; rebuildPaneGroups
// seeds pg.activeType from this store (9d-0-B). Not persisted.
const activePaneTypes = createPaneActiveTypeStore({ state });


// ===== Dashboard (extracted to lib/dashboard-panel.js) =====

const dashboardPanel = createDashboardPanel({
  state,
  sessions,
  byId,
  fmtAgo,
  onFocusSession: focusExistingSession,
});

// ===== Pane drag (extracted to lib/pane-drag.js) =====

const paneDragRuntime = createPaneDrag({
  state,
  getLeafList,
  removeSessionFromLayout,
  treeContains,
  insertAdjacentToPane,
  saveWorkspaces,
  setWorkspaceLayout,
  renderActiveWorkspace: () => renderActiveWorkspace(),
});

// ===== Tile renderer (extracted to lib/tile-renderer.js) =====

const tileRenderer = createTileRenderer({
  state,
  byId,
  createPane: (name) => createPane(name),
});

// ===== Pane runtime (extracted to lib/pane-runtime.js) =====

const paneRuntime = createPaneRuntime({
  state,
  sessions,
  activePaneTypes,
  byId,
  xterm: {
    Terminal: xtermTerminal,
    FitAddon: xtermFitAddon.FitAddon,
    WebLinksAddon: xtermWebLinksAddon.WebLinksAddon,
    theme: TERM_THEME,
  },
  actions: {
    openQuickOpen: () => openQuickOpen(),
    switchToDashboard: () => switchToDashboard(),
    switchToWorkspace: (id) => switchToWorkspace(id),
    toggleSidebar: () => toggleSidebar(),
    closeFocusedPane: () => closeFocusedPane(),
    navigatePanes: (k) => navigatePanes(k),
    resizeFocused: (k) => resizeFocused(k),
    killSession: (name) => killSession(name),
    showPaneContextMenu: (e, g) => showPaneContextMenu(e, g),
    startPaneDrag: (e, g) => paneDragRuntime.startPaneDrag(e, g),
    getAiPresetForCommand,
    renderActiveWorkspace: () => renderActiveWorkspace(),
  },
  helpers: { focus },
});

// ===== WebSocket (extracted to lib/ws-dispatcher.js) =====

const paneLifecycle = createPaneLifecycle({
  state,
  sessions,
  activePaneTypes,
  layout: { removeSessionFromLayout, getLeafList, buildBalancedTree, treeContains },
  helpers: {
    saveSessionMeta,
    escapeHtml,
    rebuildPaneGroups,
    refreshTreeRunningState,
    updateWorkspaceTabName,
    setWorkspaceLayout,
    transactionFn,
    focus,
  },
  views: {
    renderActiveWorkspace: () => renderActiveWorkspace(),
    renderTabs: () => renderTabs(),
    renderDashboard: () => dashboardPanel.render(),
  },
});
const killSession = paneLifecycle.killSession;
const closeFocusedPane = paneLifecycle.closeFocusedPane;
const showDirtyWarning = paneLifecycle.showDirtyWarning;
const autoRemoveDeadSession = paneLifecycle.autoRemoveDeadSession;

const paneNav = createPaneNav({
  state,
  layout: { getLeafList, findParentSplit },
  focusPane: (name) => focusPane(name),
  renderActiveWorkspace: () => renderActiveWorkspace(),
});
const navigatePanes = paneNav.navigatePanes;
const resizeFocused = paneNav.resizeFocused;

const paneCtxMenu = createPaneContextMenu({
  state,
  sessions,
  byId,
  layout: { removeSessionFromLayout, getLeafList, buildBalancedTree },
  helpers: { updateWorkspaceTabName, saveWorkspaces, setWorkspaceLayout, transactionFn },
  actions: {
    findWorkspaceContaining: (n) => findWorkspaceContaining(n),
    createWorkspace: (n) => createWorkspace(n),
    switchToWorkspace: (id) => switchToWorkspace(id),
    openFolder: (p, g, t, f, args) => openFolder(p, g, t, f, args),
    renderActiveWorkspace: () => renderActiveWorkspace(),
    renderTabs: () => renderTabs(),
  },
});
const showPaneContextMenu = paneCtxMenu.showPaneContextMenu;

const workspaceTabs = createWorkspaceTabs({
  state,
  byId,
  helpers: { saveWorkspaces, getLeafList },
  actions: {
    switchToDashboard: () => switchToDashboard(),
    switchToWorkspace: (id) => switchToWorkspace(id),
    removeWorkspace: (id) => removeWorkspace(id),
    renameWorkspace: (id, name) => workspaces.rename(id, name),
    reorderWorkspaces: (srcId, tgtId, side) => workspaces.reorder(srcId, tgtId, side),
    showLayoutPresetsMenu: (e, ws) => showLayoutPresetsMenu(e, ws),
    handleSessionDrop: (e, wsId) => handleSessionDrop(e, wsId),
    createWorkspace: (n) => createWorkspace(n),
  },
});
const renderTabs = workspaceTabs.renderTabs;

const sessionDrop = createSessionDrop({
  state,
  sessions,
  byId,
  helpers: { getLeafList, getDefaultAiCommand, setWorkspaceLayout },
  actions: {
    createWorkspace: (n) => createWorkspace(n),
    switchToWorkspace: (id) => switchToWorkspace(id),
    renderActiveWorkspace: () => renderActiveWorkspace(),
    openFolder: (p, n, c, nw, a) => openFolder(p, n, c, nw, a),
  },
});
const handleSessionDrop = sessionDrop.handleSessionDrop;
const addSessionToWorkspace = sessionDrop.addSessionToWorkspace;
sessionDrop.attachWorkspaceAreaListeners();

const layoutPresets = createLayoutPresets({
  byId,
  doc: document,
  env: { setTimeout: (cb, ms) => setTimeout(cb, ms) },
  helpers: { getLeafList, saveWorkspaces, setWorkspaceLayout },
  actions: { renderActiveWorkspace: () => renderActiveWorkspace() },
});
const showLayoutPresetsMenu = layoutPresets.showLayoutPresetsMenu;

const quickMessage = createQuickMessage({
  doc: document,
  byId,
  env: {
    fetchFn: fetch.bind(window),
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    windowRef: window,
  },
});
const showQuickMessageInput = quickMessage.show;

const rowActions = createRowActions({
  state,
  doc: document,
  env: { fetchFn: fetch.bind(window) },
  helpers: { getAiPresetForCommand, getDefaultAiCommand },
  actions: {
    openFolder: (p, n, c, nw, a) => openFolder(p, n, c, nw, a),
    showQuickMessageInput,
    showAiTagContextMenu: (e, fp, fn) => showAiTagContextMenu(e, fp, fn),
  },
});
const appendRowActions = rowActions.appendRowActions;

const contextMenuActions = buildContextMenuActions({
  state,
  openFolder: (p, n, c, nw) => openFolder(p, n, c, nw),
  renderTree,
  renderQuickAccess: () => renderQuickAccess(),
  favorites,
  pinned,
  expanded,
  sessions,
  normPath,
});
const ctxMenu = createContextMenu({
  doc: document,
  byId,
  state,
  favorites,
  pinned,
  sessions,
  helpers: { normPath },
  actions: contextMenuActions,
});
const showContextMenu = ctxMenu.show;
ctxMenu.attachDismissers();

const folderTree = createFolderTree({
  state,
  byId,
  doc: document,
  env: { fetchFn: fetch.bind(window) },
  helpers: {
    normPath,
    folderCountText,
    isFolderRunning,
    resolveFolderSessions,
    buildTreeRowActionsOpts,
    applyFolderInfoToTreeLabel,
    cssId,
    buildChildTreeRow,
    buildChildRowActionsOpts,
    buildRunningUnreadSets,
    expanded,
  },
  actions: {
    appendRowActions,
    showContextMenu: (e, p) => showContextMenu(e, p),
  },
});
// Bind the port slots to the real implementation. Calls made through
// renderTree() / refreshTreeRunningState() prior to this point hit the
// noop slots (matches prior optional-chain semantics).
treePort.render = folderTree.renderTree;
treePort.refreshRunningState = folderTree.refreshTreeRunningState;

const sessionsPanel = createSessionsPanel({
  state,
  byId,
  doc: document,
  env: { fetchFn: fetch.bind(window) },
  helpers: {
    normPath,
    buildSessionGroups,
    createSessionRow,
    createEmptyRow,
    buildSessionRowActionsOpts,
    patchSessionRowIndicators,
    activeNameForRow,
  },
  actions: {
    appendRowActions,
    killSession: (n) => killSession(n),
    focusExistingSession: (n) => focusExistingSession(n),
    showContextMenu: (e, p) => showContextMenu(e, p),
  },
});
const renderSessionsPanel = sessionsPanel.renderSessionsPanel;

const wsDispatcher = createWsDispatcher({
  state,
  panes: { rebuildPaneGroups, updatePaneStatus },
  views: { renderSessionsPanel, renderQuickAccess, renderDashboard: dashboardPanel.render, renderActiveWorkspace, showDirtyWarning },
  tree: { refreshTreeRunningState },
  layouts: {
    findOrphanedLeaves,
    classifyOrphanGroups,
    rebalanceLayoutsWithoutLeaves,
    getLeafList,
    buildBalancedTree,
    updateWorkspaceTabName,
    setWorkspaceLayout,
    transactionFn,
  },
  sessions: { recreateOrphanedSessions, autoRemoveDeadSession, saveSessionMeta },
  sessionsStore: sessions,
  appChrome: { applyInstanceName },
});

function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  state.ws = new WebSocket(`${proto}//${location.host}`);
  state.ws.onopen = () => initApp();
  state.ws.onclose = () => setTimeout(connect, 2000);
  state.ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    wsDispatcher.dispatch(msg);
    wsDispatcher.restoreTerminalFocusAfterRebuild();
  };
}


/**
 * @param {string} name
 */
function applyInstanceName(name) {
  const r = document.documentElement.style;
  if (name) {
    document.title = `pty-win \u2014 ${name}`;
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    const hue = ((hash % 360) + 360) % 360;
    r.setProperty("--instance-accent", `hsl(${hue}, 60%, 50%)`);
    r.setProperty("--instance-accent-dim", `hsl(${hue}, 40%, 25%)`);
    r.setProperty("--bg-primary", `hsl(${hue}, 8%, 12%)`);
    r.setProperty("--bg-secondary", `hsl(${hue}, 8%, 14%)`);
    r.setProperty("--bg-tertiary", `hsl(${hue}, 7%, 17%)`);
    r.setProperty("--bg-pane", `hsl(${hue}, 8%, 12%)`);
  } else {
    document.title = "pty-win";
    r.removeProperty("--instance-accent");
    r.removeProperty("--instance-accent-dim");
    r.removeProperty("--bg-primary");
    r.removeProperty("--bg-secondary");
    r.removeProperty("--bg-tertiary");
    r.removeProperty("--bg-pane");
  }
  // Update name badge in sidebar header
  const badge = byId("instance-name-badge");
  if (badge) badge.textContent = name || "";
}

/**
 * Display the server's build info (version + commit + startedAt) in the
 * version badge. Click opens the Settings modal scrolled to the About
 * section so the user can see fuller info and a Reload button. Shift+
 * Click bypasses the modal and copies the version line to clipboard
 * (handy when the gear button isn't on screen).
 *
 * @param {{ version?: string, commit?: string, startedAt?: string } | undefined} build
 */
function applyBuildInfo(build) {
  const el = byId("version-badge");
  if (!el || !build || !build.version) return;
  const shortSha = (build.commit || "").slice(0, 7);
  el.textContent = shortSha ? `v${build.version}@${shortSha}` : `v${build.version}`;
  const fullText = `pty-win v${build.version}\ncommit ${build.commit || "unknown"}\nstarted ${build.startedAt || "unknown"}`;
  el.title = fullText + "\n\nClick: open About in Settings\nShift+Click: copy to clipboard";
  el.onclick = async (e) => {
    if (e.shiftKey) {
      try {
        await navigator.clipboard.writeText(fullText);
        el.classList.add("copied");
        const orig = el.textContent;
        el.textContent = "copied!";
        setTimeout(() => { el.classList.remove("copied"); el.textContent = orig; }, 1200);
      } catch {
        alert(fullText);
      }
      return;
    }
    // Default click: open Settings modal -- About section is at the bottom.
    const btn = /** @type {HTMLButtonElement | null} */ (byId("settings-btn"));
    if (btn) btn.click();
  };
}

async function initApp() {
  // Load server config for initial roots
  try {
    const res = await fetch("/api/config");
    const config = await res.json();
    for (const root of config.rootDirs || []) {
      favorites.add(root);
    }

    if (config.name) applyInstanceName(config.name);
    applyBuildInfo(config.build);
  } catch {}

  // Instance name badge — click to change
  const nameBadge = byId("instance-name-badge");
  if (nameBadge) {
    nameBadge.onclick = async () => {
      const current = nameBadge.textContent || "";
      const newName = prompt("Instance name:", current);
      if (newName === null) return; // cancelled
      try {
        await fetch("/api/name", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) });
      } catch {}
    };
  }

  renderTree();
  renderQuickAccess();
  renderTabs();
  if (isDashboardMode(state)) dashboardPanel.render();
  else renderActiveWorkspace();
}


// ===== Quick Access Panel =====

function renderQuickAccess() {
  _renderQuickAccess({
    byId,
    state,
    pinned,
    focusExistingSession,
    openFolder,
    appendRowActions,
    killSession,
    showContextMenu,
  });
}

// ===== Sessions Panel (extracted to lib/sessions-panel.js) =====

// Tag builders + appendRowActions extracted to lib/session-row.js (Phase 6a)

// Sessions panel collapse toggle
(() => {
  const header = byId("sessions-panel-header");
  const body = byId("sessions-list");
  const arrow = header?.querySelector(".arrow");
  const stored = localStorage.getItem("pty-win-sessions-expanded");
  if (stored === "false") {
    body?.classList.remove("expanded");
    arrow?.classList.remove("expanded");
  }
  header?.addEventListener("click", () => {
    const isExpanded = body.classList.toggle("expanded");
    arrow?.classList.toggle("expanded", isExpanded);
    localStorage.setItem("pty-win-sessions-expanded", String(isExpanded));
  });
})();

// Folders panel collapse toggle
(() => {
  const header = byId("folders-panel-header");
  const body = byId("folder-tree");
  const arrow = header?.querySelector(".arrow");
  const stored = localStorage.getItem("pty-win-folders-expanded");
  if (stored === "false") {
    body?.classList.remove("expanded");
    arrow?.classList.remove("expanded");
  }
  header?.addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest(".panel-actions")) return; // don't toggle when clicking buttons
    const isExpanded = body.classList.toggle("expanded");
    arrow?.classList.toggle("expanded", isExpanded);
    localStorage.setItem("pty-win-folders-expanded", String(isExpanded));
  });
})();

// ===== Session Recreation =====

let recreationInProgress = false;

/**
 * @param {string[]} names
 */
async function recreateOrphanedSessions(names) {
  if (recreationInProgress) return;
  recreationInProgress = true;

  const STARTUP_STAGGER_MS = 7000;

  const mainEl = byId("main");
  const charW = 7.6, charH = 18;
  const availW = (mainEl?.clientWidth || 800) - 4;
  const availH = (mainEl?.clientHeight || 600) - 35 - 26 - 22 - 4;
  const cols = Math.max(80, Math.floor(availW / charW));
  const rows = Math.max(24, Math.floor(availH / charH));

  // Fetch repo root for each session, group by repo
  const repoGroups = new Map(); // repoRoot -> [name, ...]
  await Promise.all(names.map(/** @param {string} name */ async (name) => {
    const meta = state.sessionMeta.get(name);
    if (!meta || !meta.workingDir) return;
    let repoRoot = null;
    try {
      const r = await fetch(`/api/repo-root?path=${encodeURIComponent(meta.workingDir)}`);
      if (r.ok) repoRoot = (await r.json()).repoRoot;
    } catch {}
    const key = repoRoot || meta.workingDir;
    if (!repoGroups.has(key)) repoGroups.set(key, []);
    repoGroups.get(key).push(name);
  }));

  const groups = [...repoGroups.values()];

  /**
   * @param {string[]} group
   */
  async function launchGroup(group) {
    for (const name of group) {
      const meta = state.sessionMeta.get(name);
      if (!meta) continue;
      try {
        const isClaude = !meta.command || meta.command === "claude";
        /** @type {{workingDir: string | undefined, cols: number, rows: number, command?: string, args?: string[]}} */
        const body = { workingDir: meta.workingDir, cols, rows };
        if (meta.command && meta.command !== "claude") body.command = meta.command;
        if (isClaude) body.args = ["--continue"];
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { console.warn(`Failed to recreate session "${name}":`, await res.text()); pruneFailedSession(name); }
      } catch (err) {
        console.warn(`Error recreating session "${name}":`, err);
        pruneFailedSession(name);
      }
    }
  }

  // Launch groups staggered by STARTUP_STAGGER_MS
  for (let i = 0; i < groups.length; i++) {
    if (i === 0) {
      await launchGroup(groups[i]);
    } else {
      setTimeout(() => launchGroup(groups[i]), i * STARTUP_STAGGER_MS);
    }
  }

  recreationInProgress = false;
}

/**
 * @param {string} name
 */
function pruneFailedSession(name) {
  state.sessionMeta.delete(name);
  saveSessionMeta();
  workspaces.transaction(() => {
    for (const ws of state.workspaces) {
      if (ws.layout && treeContains(ws.layout, name)) {
        const leaves = getLeafList(ws.layout).filter((n) => n !== name);
        workspaces.setLayout(ws.id, buildBalancedTree(leaves));
      }
    }
  });
  renderTabs();
  if (isDashboardMode(state)) dashboardPanel.render();
  else renderActiveWorkspace();
}

// ===== Open Folder =====

/** Get the active workspace, or the most recent one, or create a new one */
function getOrCreateActiveWorkspace() {
  // If we're on a workspace tab already, use it
  const active = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (active) return active;

  // If on dashboard but workspaces exist, use the last one
  if (state.workspaces.length > 0) return state.workspaces[state.workspaces.length - 1];

  // No workspaces at all — create one
  return createWorkspace("Workspace 1");
}

/**
 * Open a folder as a session, optionally forcing a new workspace
 * @param {string} folderPath
 * @param {string} folderName
 * @param {string} [command]
 * @param {boolean} [newWorkspace]
 * @param {string[]} [args]
 */
async function openFolder(folderPath, folderName, command, newWorkspace = false, args = []) {
  const { baseName, sessionName, isPwsh } = computeSessionNames(folderPath, folderName, command);

  const existing = sessions.byName(sessionName);
  if (existing && existing.status !== "dead") {
    focusAliveSession(baseName, isPwsh);
    return;
  }
  if (existing && existing.status === "dead") {
    await cleanupDeadSession(sessionName, { state, sessions });
  }

  try {
    const body = buildOpenFolderBody({ folderPath, command, args });
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to create session");
      return;
    }
    await res.json();
    placeNewSession({
      baseName, sessionName, isPwsh,
      command: body.command || getDefaultAiCommand(),
      folderPath,
      newWorkspace,
    });
  } catch {
    alert("Failed to create session");
  }
}

/** Already-alive session: just switch the pane toggle and focus.
 * @param {string} baseName
 * @param {boolean} isPwsh
 */
function focusAliveSession(baseName, isPwsh) {
  const pg = state.paneGroups.get(baseName);
  const type = isPwsh ? "pwsh" : "claude";
  activePaneTypes.set(baseName, type);
  if (pg) pg.activeType = type;
  focusExistingSession(baseName);
  renderActiveWorkspace();
}

/** Compose the POST /api/sessions body from estimated dims + caller args.
 * @param {{ folderPath: string, command?: string, args?: string[] }} args
 */
function buildOpenFolderBody({ folderPath, command, args }) {
  const mainEl = byId("main");
  const { cols, rows } = estimatePtyDims(mainEl?.clientWidth || 800, mainEl?.clientHeight || 600);
  return buildCreateSessionRequest({ folderPath, cols, rows, command, args, getDefaultAiCommand });
}

/** Attach to sibling workspace if one exists, else tile into a workspace.
 *  Optimistically inserts the new session into `state.sessions` first so
 *  the render branch finds it before the WS `sessions` snapshot arrives.
 * @param {{ baseName: string, sessionName: string, isPwsh: boolean, command: string, folderPath: string, newWorkspace: boolean }} args
 */
function placeNewSession({ baseName, sessionName, isPwsh, command, folderPath, newWorkspace }) {
  optimisticallyAddNewSession({
    baseName, sessionName, isPwsh, command, folderPath,
    sessions, activePaneTypes, rebuildPaneGroups,
  });
  const siblingWs = findWorkspaceContaining(baseName);
  if (siblingWs) {
    attachToSiblingWorkspace({
      siblingWs, baseName, switchToWorkspace, renderActiveWorkspace, focusPane,
    });
    return;
  }
  tileNewSessionIntoWorkspace({
    newWorkspace, baseName,
    createWorkspace, getOrCreateActiveWorkspace,
    addSessionToWorkspace, switchToWorkspace, renderActiveWorkspace, focusPane,
    updateWorkspaceTabName,
  });
}

/**
 * @param {string} name
 */
function focusExistingSession(name) {
  // Map session name to group name (pane leaf name)
  const groupName = name.replace(/~pwsh$/, "");
  // If focusing a pwsh session, switch the pane toggle
  if (name.endsWith("~pwsh")) {
    const pg = state.paneGroups.get(groupName);
    activePaneTypes.set(groupName, "pwsh");
    if (pg) pg.activeType = "pwsh";
  }
  // Find workspace containing this group's pane
  const ws = findWorkspaceContaining(groupName);
  if (ws) {
    // Set focusedPane directly so switchToWorkspace picks it up
    focus.set(groupName);
    focus.captureForWorkspace(ws);
    if (ws.id === state.activeWorkspaceId) {
      // Already on this workspace — just focus the pane, no full switch needed
      renderActiveWorkspace();
      focusPane(groupName);
      requestAnimationFrame(() => {
        const pg = state.paneGroups.get(groupName);
        const sName = pg ? (pg.activeType === "pwsh" ? pg.pwsh : pg.claude) : groupName;
        const entry = state.terminals.get(sName || groupName);
        if (entry) entry.term.focus();
      });
    } else {
      switchToWorkspace(ws.id);
    }
  } else {
    // Not in any workspace — tile into active workspace
    const activeWs = getOrCreateActiveWorkspace();
    addSessionToWorkspace(activeWs.id, groupName);
    focus.set(groupName);
    focus.captureForWorkspace(activeWs);
    switchToWorkspace(activeWs.id);
    updateWorkspaceTabName(activeWs);
  }
}

/**
 * Update workspace tab name based on its sessions
 * @param {import('./lib/state.js').Workspace} ws
 */
function updateWorkspaceTabName(ws) {
  if (ws.customName) return; // user renamed — don't override
  const leaves = ws.layout ? getLeafList(ws.layout) : [];
  if (leaves.length === 0) return;
  if (leaves.length === 1) {
    ws.name = leaves[0];
  } else if (leaves.length <= 3) {
    ws.name = leaves.join(" + ");
  } else {
    ws.name = leaves.slice(0, 2).join(" + ") + ` +${leaves.length - 2}`;
  }
  renderTabs();
}
// ===== Quick-Open (Ctrl+P) =====

function openQuickOpen() {
  const overlay = byId("quick-open");
  const input = inputById("quick-open-input");
  overlay.classList.remove("hidden");
  input.value = "";
  input.focus();
  renderQuickOpenResults("");
}

function closeQuickOpen() {
  byId("quick-open").classList.add("hidden");
}

/**
 * @param {string} query
 */
function renderQuickOpenResults(query) {
  const container = byId("quick-open-results");
  container.innerHTML = "";

  const q = query.toLowerCase();
  /** @type {any[]} */
  const matches = state.visitedFolders
    .filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
    .slice(0, 20);

  for (let i = 0; i < matches.length; i++) {
    const f = matches[i];
    const row = document.createElement("div");
    row.className = `qo-result ${i === 0 ? "selected" : ""}`;
    row.dataset["idx"] = String(i);

    const isRunning = sessions.has(f.name);

    row.innerHTML = `
      <span class="qo-name">${f.name}</span>
      <span class="qo-path">${f.path}</span>
      ${f.identityName ? `<span class="qo-indicator identity">\u25cf ${f.identityName}</span>` : ""}
      ${f.isClaudeReady ? `<span class="qo-indicator" style="color: var(--claude-ready)">\u25c6</span>` : ""}
      ${isRunning ? `<span class="qo-indicator running">running</span>` : ""}
    `;

    row.onclick = () => {
      closeQuickOpen();
      openFolder(f.path, f.name);
    };

    container.appendChild(row);
  }
}

byId("quick-open-input").addEventListener("input", /** @param {Event} e */ (e) => {
  const t = e.target;
  if (t instanceof HTMLInputElement) renderQuickOpenResults(t.value);
});

byId("quick-open-input").addEventListener("keydown", /** @param {KeyboardEvent} e */ (e) => {
  if (e.key === "Escape") { closeQuickOpen(); return; }
  if (e.key === "Enter") {
    const selected = /** @type {HTMLElement | null} */ (document.querySelector(".qo-result.selected"));
    if (selected) selected.click();
    return;
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const results = [...document.querySelectorAll(".qo-result")];
    const idx = results.findIndex((r) => r.classList.contains("selected"));
    results.forEach((r) => r.classList.remove("selected"));
    const newIdx = e.key === "ArrowDown"
      ? Math.min(idx + 1, results.length - 1)
      : Math.max(idx - 1, 0);
    if (results[newIdx]) results[newIdx].classList.add("selected");
  }
});

byId("quick-open").addEventListener("click", /** @param {MouseEvent} e */ (e) => {
  if (e.target === byId("quick-open")) closeQuickOpen();
});

// ===== Sidebar Toggle =====

function toggleSidebar() {
  state.sidebarVisible = !state.sidebarVisible;
  byId("sidebar").classList.toggle("hidden", !state.sidebarVisible);
  byId("sidebar-strip").classList.toggle("hidden", state.sidebarVisible);
  // Refit terminals
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (ws?.layout) requestAnimationFrame(() => fitAllTerminals(ws.layout));
}

byId("btn-collapse").onclick = toggleSidebar;
byId("btn-expand").onclick = toggleSidebar;

function refreshTree() { state.folderCache.clear(); renderTree(); }
byId("btn-refresh").onclick = refreshTree;

byId("btn-collapse-all").onclick = () => {
  if (expanded.clear({ notify: false })) renderTree();
};

// Sidebar resize handle
(() => {
  const handle = byId("sidebar-resize-handle");
  const sidebar = byId("sidebar");
  if (!handle || !sidebar) return;

  handle.addEventListener("mousedown", /** @param {MouseEvent} e */ (e) => {
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = /** @param {MouseEvent} e */ (e) => {
      const newWidth = Math.max(100, Math.min(500, e.clientX));
      sidebar.style.width = `${newWidth}px`;
    };

    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      saveSidebarWidth(parseInt(sidebar.style.width, 10));
      // Refit terminals after sidebar resize
      const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
      if (ws?.layout) requestAnimationFrame(() => fitAllTerminals(ws.layout));
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();

// ===== Add root =====

byId("btn-add-root").onclick = () => {
  const path = prompt("Enter folder path to add as root:");
  if (!path) return;
  // Batched: suppress favorites onChange so we don't render the tree
  // BEFORE expanded.add() — otherwise the new root paints collapsed.
  if (favorites.add(path, { notify: false })) {
    expanded.add(path, { notify: false });
    renderTree();
  }
};

// ===== Workspaces =====

/**
 * @param {string | null} name
 * @returns {import("./lib/state.js").Workspace}
 */
function createWorkspace(name) {
  const ws = workspaces.create(name);
  renderTabs();
  return ws;
}

/**
 * @param {string} id
 */
function switchToWorkspace(id) {
  // Save focused pane for current workspace
  if (state.activeWorkspaceId) {
    focus.captureForWorkspace(workspaces.byId(state.activeWorkspaceId));
  }

  dashboardPanel.stopPolling();
  workspaces.setActive(id);

  // Restore focused pane for target workspace (falls back to first leaf
  // when lastFocusedPane is stale, missing, or not in the layout).
  focus.restoreForWorkspace(workspaces.byId(id));

  renderTabs();
  renderActiveWorkspace();
  if (state.focusedPane) {
    const focused = state.focusedPane;
    focusPane(focused);
    // Terminal DOM needs a frame to be ready for keyboard focus
    requestAnimationFrame(() => {
      const pg = state.paneGroups.get(focused);
      const name = pg ? (pg.activeType === "pwsh" ? pg.pwsh : pg.claude) : focused;
      const entry = state.terminals.get(name || focused);
      if (entry) entry.term.focus();
    });
  }
}

function switchToDashboard() {
  dashboardPanel.stopPolling();
  workspaces.setActive(null);
  renderTabs();
  dashboardPanel.render();
  dashboardPanel.startPolling();
}

/**
 * @param {string} sessionName
 */
function findWorkspaceContaining(sessionName) {
  for (const ws of state.workspaces) {
    if (ws.layout && treeContains(ws.layout, sessionName)) return ws;
  }
  return null;
}

/**
 * @param {string} id
 */
function removeWorkspace(id) {
  workspaces.transaction(() => {
    if (!workspaces.remove(id)) return;
    if (state.activeWorkspaceId === id) switchToDashboard();
  });
  renderTabs();
}


// ===== Tabs (extracted to lib/workspace-tabs.js) =====


// ===== Session/Folder Drop Handler (extracted to lib/session-drop.js) =====

// ===== Tiling =====

// ===== Pane drag-to-reorder (extracted to lib/pane-drag.js) =====

// ===== Layout presets (extracted to lib/layout-presets.js) =====

function renderActiveWorkspace() {
  tileRenderer.renderActiveWorkspace();
}

/**
 * @param {any} node
 */
function fitAllTerminals(node) {
  tileRenderer.fitAllTerminals(node);
}

// ===== Panes (extracted to lib/pane-runtime.js) =====

/**
 * @param {string} groupName
 * @returns {HTMLElement}
 */
function createPane(groupName) {
  return paneRuntime.createPane(groupName);
}


/**
 * @param {MouseEvent} e
 * @param {string} folderPath
 * @param {string} folderName
 */
function showAiTagContextMenu(e, folderPath, folderName) {
  const menu = byId("pane-context-menu");
  menu.classList.remove("hidden");
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  const render = () => {
    menu.innerHTML = "";

    const resumeItem = document.createElement("div");
    resumeItem.className = "ctx-item";
    resumeItem.textContent = "\u25b6 Resume session";
    resumeItem.onclick = () => {
      menu.classList.add("hidden");
      openFolder(folderPath, folderName, "claude", false, ["--resume"]);
    };
    menu.appendChild(resumeItem);

    const sep1 = document.createElement("div");
    sep1.className = "ctx-sep";
    menu.appendChild(sep1);

    for (let i = 0; i < state.aiPresets.length; i++) {
      const preset = state.aiPresets[i];
      const isDefault = i === state.aiDefaultIndex;
      const item = document.createElement("div");
      item.className = "ctx-item ai-picker-item";
      item.innerHTML = `<span class="default-star">${isDefault ? "\u2605" : ""}</span> ${escapeHtml(preset.name)} <span class="ai-icon">${escapeHtml(preset.icon)}</span>`;
      item.onclick = () => {
        menu.classList.add("hidden");
        openFolder(folderPath, folderName, preset.command);
      };
      item.oncontextmenu = /** @param {MouseEvent} ev */ (ev) => {
        ev.preventDefault();
        setAiDefault(i);
        render(); // re-render to move the star
      };
      item.title = isDefault ? `${preset.name} (default) \u2014 right-click to change` : `Launch ${preset.name} \u2014 right-click to set as default`;
      menu.appendChild(item);
    }

    const sep2 = document.createElement("div");
    sep2.className = "ctx-sep";
    menu.appendChild(sep2);

    const customItem = document.createElement("div");
    customItem.className = "ctx-item";
    customItem.textContent = "Custom command\u2026";
    customItem.onclick = () => {
      menu.classList.add("hidden");
      const cmd = prompt("Command to run:", "claude");
      if (cmd) openFolder(folderPath, folderName, cmd);
    };
    menu.appendChild(customItem);
  };

  render();

  const close = (/** @type {MouseEvent} */ ev) => {
    const t = ev.target instanceof Node ? ev.target : null;
    if (!menu.contains(t)) {
      menu.classList.add("hidden");
      document.removeEventListener("mousedown", close);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}

/**
 * Pop the AI preset picker context menu. Currently unused — kept for
 * a future re-wire (right-click an AI tag to launch with a non-default
 * preset). Prefix with `_` so eslint's no-unused-vars accepts the
 * intentional-unused state without us having to delete the helper.
 *
 * @param {MouseEvent} e
 * @param {string} folderPath
 * @param {string} folderName
 */
function _showAiPicker(e, folderPath, folderName) {
  const menu = byId("pane-context-menu");
  menu.innerHTML = "";
  menu.classList.remove("hidden");
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  for (let i = 0; i < state.aiPresets.length; i++) {
    const preset = state.aiPresets[i];
    const isDefault = i === state.aiDefaultIndex;
    const item = document.createElement("div");
    item.className = "ctx-item ai-picker-item";
    item.innerHTML = `<span class="default-star">${isDefault ? "\u2605" : ""}</span> ${escapeHtml(preset.name)} <span class="ai-icon">${escapeHtml(preset.icon)}</span>`;
    item.onclick = () => {
      menu.classList.add("hidden");
      openFolder(folderPath, folderName, preset.command);
    };
    item.oncontextmenu = /** @param {MouseEvent} ev */ (ev) => {
      ev.preventDefault();
      setAiDefault(i);
      _showAiPicker(e, folderPath, folderName); // re-render to update star
    };
    item.title = isDefault ? `${preset.name} (default) — right-click to change` : `Launch ${preset.name} — right-click to set as default`;
    menu.appendChild(item);
  }

  const sep = document.createElement("div");
  sep.className = "ctx-sep";
  menu.appendChild(sep);

  const customItem = document.createElement("div");
  customItem.className = "ctx-item";
  customItem.textContent = "Custom command...";
  customItem.onclick = () => {
    menu.classList.add("hidden");
    const cmd = prompt("Command to run:", "claude");
    if (cmd) openFolder(folderPath, folderName, cmd);
  };
  menu.appendChild(customItem);

  const close = (/** @type {MouseEvent} */ ev) => {
    const t = ev.target instanceof Node ? ev.target : null;
    if (!menu.contains(t)) {
      menu.classList.add("hidden");
      document.removeEventListener("mousedown", close);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}


// ===== Pane context menu (extracted to lib/pane-context-menu.js) =====

/**
 * @param {string} sessionName
 */
function updatePaneStatus(sessionName) {
  paneRuntime.updatePaneStatus(sessionName);
}

/**
 * @param {string} groupName
 */
function focusPane(groupName) {
  paneRuntime.focusPane(groupName);
}

// ===== Navigation (extracted to lib/pane-nav.js) =====


// ===== Pane lifecycle (extracted to lib/pane-lifecycle.js) =====


// ===== Dashboard (extracted to lib/dashboard-panel.js) =====


// ===== Tracker Panel (extracted to lib/tracker-panel.js) =====
// Created after agents-panel so renderTracker() is wired below where
// the right-panel tabs IIFE expects it.

// ===== Modal =====

function closeModal() {
  byId("modal-overlay").classList.add("hidden");
}

byId("m-cancel").onclick = closeModal;
byId("m-create").onclick = () => {
  const path = inputById("m-path").value.trim();
  const cmd = inputById("m-cmd").value.trim() || undefined;
  if (!path) { alert("Path is required."); return; }
  closeModal();
  openFolder(path, "", cmd);
};
byId("modal-overlay").onclick = /** @param {MouseEvent} e */ (e) => {
  if (e.target === byId("modal-overlay")) closeModal();
};
byId("m-path").addEventListener("keydown", /** @param {KeyboardEvent} e */ (e) => {
  if (e.key === "Enter") byId("m-create").click();
  if (e.key === "Escape") closeModal();
});

// ===== Global keyboard shortcuts =====

document.addEventListener("keydown", /** @param {KeyboardEvent} e */ (e) => {
  if (e.ctrlKey && !e.shiftKey && e.key === "p") {
    e.preventDefault();
    openQuickOpen();
  }
  if (e.ctrlKey && e.shiftKey) {
    switch (e.key) {
      case "D": case "d": e.preventDefault(); switchToDashboard(); break;
      case "B": case "b": e.preventDefault(); toggleSidebar(); break;
    }
    if (e.key >= "1" && e.key <= "9") {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      if (state.workspaces[idx]) switchToWorkspace(state.workspaces[idx].id);
    }
  }
});

// ===== Window resize =====

window.addEventListener("resize", () => {
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (ws?.layout) requestAnimationFrame(() => fitAllTerminals(ws.layout));
});

// ===== Workspace button =====

// btn-new-workspace is now rendered inline in renderTabs()

// ===== Init =====

favorites.init();
pinned.init();
expanded.init();
// Auto-expand all favorites on first run (when nothing has been
// explicitly collapsed yet). Earlier code re-evaluated `expanded.size()`
// inside the loop, so only the FIRST favorite ever auto-expanded;
// snapshot the empty-state guard once before iterating to fix that.
const noneExpandedYet = expanded.size() === 0;
if (noneExpandedYet) {
  for (const f of favorites.list()) {
    if (!expanded.has(f)) expanded.add(f, { notify: false });
  }
}

// Restore sidebar width
const savedWidth = loadSidebarWidth();
byId("sidebar").style.width = `${savedWidth}px`;

// Restore workspaces (layouts referencing sessions — terminals reconnect via WS)
workspaces.init();
state.sessionMeta = loadSessionMeta();

renderTabs();
if (isDashboardMode(state)) dashboardPanel.render();
else renderActiveWorkspace();
connect();

// Refit all terminals after page fully loads (fixes Ctrl+F5 layout)
window.addEventListener("load", () => {
  // Seed AI default from server preference (overrides localStorage when present).
  syncAiDefaultFromServer();
  // Multiple delayed refits to handle async font/CSS loading
  for (const delay of [100, 300, 600, 1200]) {
    setTimeout(() => {
      for (const [name, entry] of state.terminals) {
        try {
          entry.fitAddon.fit();
          const { cols, rows } = entry.term;
          state.ws?.send(JSON.stringify({ type: "resize", session: name, payload: { cols, rows } }));
        } catch {}
      }
    }, delay);
  }
});

// ===== Emcom feed panel (neo-terminal theme) =====

initFeedPanel({ byId, inputById, selectById, state, fitAllTerminals });

// ===== Right Panel Tab Switching =====
// ===== Agents Panel =====

const agentsPanel = createAgentsPanel({
  state,
  sessions,
  byId,
  fmtAgo,
  onFocusSession: focusExistingSession,
});

const trackerPanel = createTrackerPanel({ state, byId });

initRightPanel({ byId, panels: { tracker: trackerPanel, agents: agentsPanel } });

// ===== Settings modal (v0.1.33) =====
//
// Schema-driven preferences editor. Fetches /api/preferences/schema +
// /api/preferences on open, renders rows by type, writes via POST with
// updatedBy="pty-win-settings". Same prefs file as the right-click menu's
// pty-win-play writes — the two surfaces stay consistent.

initSettingsModal({ byId, buttonById, state });
