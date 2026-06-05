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
  loadFavorites,
  saveFavorites,
  loadPinnedFolders,
  savePinnedFolders,
  loadExpandedPaths,
  saveExpandedPaths,
  loadSidebarWidth,
  saveSidebarWidth,
  loadWorkspaces,
  saveWorkspaces,
  loadSessionMeta,
  saveSessionMeta,
} from "./lib/persistence.js";
import {
  buildBalancedTree,
  removeSessionFromLayout,
  insertAdjacentToPane,
  getLeafList,
  treeContains,
  findParentSplit,
} from "./lib/tiling.js";
import { rebuildPaneGroups as _rebuildPaneGroups } from "./lib/pane-groups.js";
import { createWorkspaceTabs } from "./lib/workspace-tabs.js";
import { createSessionDrop } from "./lib/session-drop.js";
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
} from "./lib/open-folder.js";
import {
  buildContextMenuActions,
  resolveContextAction,
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
} from "./lib/folder-tree.js";
import {
  createEmptyRow,
  createSessionRow,
  buildSessionRowActionsOpts,
  patchSessionRowIndicators,
  activeNameForRow,
  buildIdentityTag,
  buildUnreadBadge,
  buildIndicatorSlot,
  buildKillButton,
} from "./lib/session-row.js";
import {
  createPaneContextMenu,
} from "./lib/pane-context-menu.js";

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
  state.paneGroups = _rebuildPaneGroups(state.sessions, state.paneGroups);
}


// ===== Dashboard (extracted to lib/dashboard-panel.js) =====

const dashboardPanel = createDashboardPanel({
  state,
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
});

// ===== WebSocket (extracted to lib/ws-dispatcher.js) =====

const paneLifecycle = createPaneLifecycle({
  state,
  layout: { removeSessionFromLayout, getLeafList, buildBalancedTree, treeContains },
  helpers: {
    saveSessionMeta,
    escapeHtml,
    rebuildPaneGroups,
    refreshTreeRunningState,
    updateWorkspaceTabName,
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
  byId,
  layout: { removeSessionFromLayout, getLeafList, buildBalancedTree },
  helpers: { updateWorkspaceTabName, saveWorkspaces },
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
    showLayoutPresetsMenu: (e, ws) => showLayoutPresetsMenu(e, ws),
    handleSessionDrop: (e, wsId) => handleSessionDrop(e, wsId),
    createWorkspace: (n) => createWorkspace(n),
  },
});
const renderTabs = workspaceTabs.renderTabs;

const sessionDrop = createSessionDrop({
  state,
  byId,
  helpers: { getLeafList, getDefaultAiCommand },
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
  },
  sessions: { recreateOrphanedSessions, autoRemoveDeadSession, saveSessionMeta },
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
      if (!state.favorites.includes(root)) {
        state.favorites.push(root);
      }
    }
    saveFavorites();

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
  if (state.isDashboard) dashboardPanel.render();
  else renderActiveWorkspace();
}

// ===== Folder Tree =====

/**
 * @param {string} path
 */
async function fetchChildren(path) {
  if (state.folderCache.has(path)) return state.folderCache.get(path);
  try {
    const res = await fetch(`/api/folders?path=${encodeURIComponent(path)}`);
    const entries = await res.json();
    state.folderCache.set(path, entries);
    // Add to visited for quick-open
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

function renderTree() {
  const tree = byId("folder-tree");
  tree.innerHTML = "";

  const folderCountEl = document.querySelector(".folder-count");
  if (folderCountEl) folderCountEl.textContent = folderCountText(state.favorites);

  for (const rootPath of state.favorites) {
    const rootName = rootPath.split(/[/\\]/).filter(Boolean).pop() || rootPath;
    const rootEl = document.createElement("div");
    rootEl.className = "tree-root";

    const label = document.createElement("div");
    label.className = "tree-root-label";
    label.dataset["path"] = normPath(rootPath);
    const expanded = state.expandedPaths.has(rootPath);

    const arrow = document.createElement("span");
    arrow.className = `arrow ${expanded ? "expanded" : ""}`;
    label.appendChild(arrow);

    const nameSpan = document.createElement("span");
    nameSpan.className = "root-name";
    nameSpan.textContent = rootName;
    label.appendChild(nameSpan);

    if (isFolderRunning(state.sessions, rootPath, normPath)) {
      nameSpan.classList.add("running");
    }

    const rootResolved = resolveFolderSessions(state.sessions, rootName, rootPath, normPath);
    const rootCacheKey = normPath(rootPath);
    const rootCached = state.folderInfoCache.get(rootCacheKey);
    appendRowActions(label, buildTreeRowActionsOpts({
      workingDir: rootPath,
      folderName: rootName,
      cached: rootCached,
      sessionInfo: rootResolved.sessionInfo,
      sessionMatchesPath: rootResolved.sessionMatchesPath,
      pwshInfo: rootResolved.pwshInfo,
      pwshMatchesPath: rootResolved.pwshMatchesPath,
    }));
    if (!rootCached) {
      fetch(`/api/folder-info?path=${encodeURIComponent(rootPath)}`)
        .then((r) => r.json())
        .then((info) => {
          state.folderInfoCache.set(rootCacheKey, info);
          applyFolderInfoToTreeLabel(label, info);
        })
        .catch(() => {});
    }

    label.onclick = () => toggleExpand(rootPath);
    label.addEventListener("contextmenu", (e) => showContextMenu(e, rootPath));
    rootEl.appendChild(label);

    const childContainer = document.createElement("div");
    childContainer.className = `tree-children ${expanded ? "expanded" : ""}`;
    childContainer.id = `children-${cssId(rootPath)}`;
    rootEl.appendChild(childContainer);

    tree.appendChild(rootEl);

    if (expanded) loadAndRenderChildren(rootPath, childContainer, 1);
  }
}

/**
 * @param {string} path
 */
async function toggleExpand(path) {
  if (state.expandedPaths.has(path)) {
    state.expandedPaths.delete(path);
  } else {
    state.expandedPaths.add(path);
  }
  saveExpandedPaths();
  renderTree();
}

/**
 * @param {string} parentPath
 * @param {HTMLElement} container
 * @param {number} depth
 */
async function loadAndRenderChildren(parentPath, container, depth) {
  const entries = await fetchChildren(parentPath);
  container.innerHTML = "";

  for (const entry of entries) {
    if (!entry.isDir) continue;

    const node = document.createElement("div");
    const isExpanded = state.expandedPaths.has(entry.path);
    const isRunning = isFolderRunning(state.sessions, entry.path, normPath);
    const row = buildChildTreeRow(entry, depth, isExpanded, isRunning, normPath);

    const resolution = resolveFolderSessions(state.sessions, entry.name, entry.path, normPath);
    appendRowActions(row, buildChildRowActionsOpts(entry, resolution));

    row.onclick = () => toggleExpand(entry.path);
    row.addEventListener("contextmenu", (e) => showContextMenu(e, entry.path));
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      if (!e.dataTransfer) return;
      e.dataTransfer.setData("pty-win/folder", JSON.stringify({ workingDir: entry.path, folderName: entry.name }));
      e.dataTransfer.effectAllowed = "copy";
    });

    node.appendChild(row);

    const childContainer = document.createElement("div");
    childContainer.className = `tree-children ${isExpanded ? "expanded" : ""}`;
    node.appendChild(childContainer);

    container.appendChild(node);

    if (isExpanded) loadAndRenderChildren(entry.path, childContainer, depth + 1);
  }
}
function refreshTreeRunningState() {
  const { running, unread } = buildRunningUnreadSets(state.sessions, normPath);
  // Child folder nodes
  document.querySelectorAll(".tree-node[data-path]").forEach(/** @param {Element} n */ (n) => {
    if (!(n instanceof HTMLElement)) return;
    const path = n.dataset["path"] ?? "";
    n.classList.toggle("running", running.has(path));
    const dot = n.querySelector(".unread-dot");
    if (dot) dot.classList.toggle("show", unread.has(path));
  });
  // Root folder labels
  document.querySelectorAll(".tree-root-label[data-path]").forEach(/** @param {Element} n */ (n) => {
    if (!(n instanceof HTMLElement)) return;
    const path = n.dataset["path"] ?? "";
    const nameSpan = n.querySelector(".root-name");
    if (nameSpan) nameSpan.classList.toggle("running", running.has(path));
    const dot = n.querySelector(".unread-dot");
    if (dot) dot.classList.toggle("show", unread.has(path));
  });
}


// ===== Quick Access Panel =====

function renderQuickAccess() {
  _renderQuickAccess({
    byId,
    state,
    focusExistingSession,
    openFolder,
    appendRowActions,
    killSession,
    showContextMenu,
  });
}

// ===== Sessions Panel =====

function renderSessionsPanel() {
  const list = byId("sessions-list");
  const countEl = document.querySelector(".session-count");
  if (!list) return;

  const groups = buildSessionGroups(state.paneGroups, state.sessions);
  if (countEl) countEl.textContent = groups.length > 0 ? `(${groups.length})` : "";

  list.innerHTML = "";
  if (groups.length === 0) {
    list.appendChild(createEmptyRow());
    return;
  }

  for (const g of groups) {
    const row = createSessionRow(g, state.focusedPane);
    const cacheKey = normPath(g.workingDir);
    const cached = state.folderInfoCache.get(cacheKey);

    appendRowActions(row, buildSessionRowActionsOpts(g, cached, () => {
      if (g.claudeAlive && g.pg.claude) killSession(g.pg.claude);
      if (g.pwshAlive && g.pg.pwsh) killSession(g.pg.pwsh);
    }));

    if (!cached && g.workingDir) {
      fetch(`/api/folder-info?path=${encodeURIComponent(g.workingDir)}`)
        .then((r) => r.json())
        .then((info) => {
          state.folderInfoCache.set(cacheKey, info);
          patchSessionRowIndicators(row, info);
        })
        .catch(() => {});
    }

    const activeName = activeNameForRow(g);
    if (activeName) row.onclick = () => focusExistingSession(activeName);
    row.addEventListener("contextmenu", (e) => { if (g.workingDir) showContextMenu(e, g.workingDir); });
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      if (!e.dataTransfer) return;
      e.dataTransfer.setData("pty-win/session", JSON.stringify({ group: g.group, workingDir: g.workingDir }));
      e.dataTransfer.effectAllowed = "copy";
    });
    list.appendChild(row);
  }
}

/**
 * AI command tag (Claude / agency cc / etc). Uses the running command's
 * preset when alive, falls back to the user's default-AI when absent.
 * Live: click sends a quick message. Absent: click launches the default,
 * right-click shows the AI-picker context menu.
 *
 * @param {any} opts
 * @returns {HTMLSpanElement}
 */
function buildAiTag(opts) {
  const aiPreset = opts.claudeAlive && opts.claudeCommand
    ? getAiPresetForCommand(opts.claudeCommand)
    : state.aiPresets[state.aiDefaultIndex];
  const tag = document.createElement("span");
  tag.className = `cmd-tag ${opts.claudeAlive ? "alive" : "absent"}`;
  tag.textContent = aiPreset.icon;
  if (opts.claudeAlive) {
    tag.title = `${aiPreset.name}: running — click to send message`;
    tag.onclick = (e) => { e.stopPropagation(); showQuickMessageInput(opts.folderName, tag); };
  } else {
    tag.title = `Start ${aiPreset.name} (right-click for options)`;
    tag.onclick = (e) => { e.stopPropagation(); openFolder(opts.workingDir, opts.folderName, getDefaultAiCommand()); };
    tag.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); showAiTagContextMenu(e, opts.workingDir, opts.folderName); };
  }
  return tag;
}

/**
 * PowerShell tag — click launches pwsh in the folder when absent;
 * non-interactive when alive (other UI surfaces handle pwsh focus).
 *
 * @param {any} opts
 * @returns {HTMLSpanElement}
 */
function buildPwshTag(opts) {
  const tag = document.createElement("span");
  tag.className = `cmd-tag pwsh ${opts.pwshAlive ? "alive" : "absent"}`;
  tag.textContent = ">_";
  tag.title = opts.pwshAlive ? "PowerShell: running" : "Start PowerShell";
  if (!opts.pwshAlive) {
    tag.onclick = (e) => { e.stopPropagation(); openFolder(opts.workingDir, opts.folderName, "pwsh"); };
  }
  return tag;
}

/**
 * VS Code launcher tag — fires POST /api/open-editor with the folder path.
 * Exits Fullscreen API mode first so the editor steals focus cleanly
 * (server handles F11/minimize via Win32).
 *
 * @param {any} workingDir
 * @returns {HTMLSpanElement}
 */
function buildVsCodeTag(workingDir) {
  const tag = document.createElement("span");
  tag.className = "cmd-tag code";
  tag.textContent = "\u003c/\u003e";
  tag.title = "Open in VS Code (click to launch)";
  tag.onclick = (e) => {
    e.stopPropagation();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    fetch("/api/open-editor", {
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
  for (const ws of state.workspaces) {
    if (ws.layout && treeContains(ws.layout, name)) {
      const leaves = getLeafList(ws.layout).filter((n) => n !== name);
      ws.layout = buildBalancedTree(leaves);
      updateWorkspaceTabName(ws);
    }
  }
  saveWorkspaces();
  if (state.isDashboard) dashboardPanel.render();
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

  const existing = state.sessions.get(sessionName);
  if (existing && existing.status !== "dead") {
    focusAliveSession(baseName, isPwsh);
    return;
  }
  if (existing && existing.status === "dead") {
    await cleanupDeadSession(sessionName, { state });
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
    placeNewSession({ baseName, sessionName, isPwsh, newWorkspace });
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
  if (pg) pg.activeType = isPwsh ? "pwsh" : "claude";
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
 * @param {{ baseName: string, sessionName: string, isPwsh: boolean, newWorkspace: boolean }} args
 */
function placeNewSession({ baseName, sessionName, isPwsh, newWorkspace }) {
  const siblingWs = findWorkspaceContaining(baseName);
  if (siblingWs) {
    attachToSiblingWorkspace({
      siblingWs, baseName, sessionName, isPwsh,
      state, switchToWorkspace, renderActiveWorkspace, focusPane,
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
    if (pg) pg.activeType = "pwsh";
  }
  // Find workspace containing this group's pane
  const ws = findWorkspaceContaining(groupName);
  if (ws) {
    // Set focusedPane directly so switchToWorkspace picks it up
    state.focusedPane = groupName;
    ws.lastFocusedPane = groupName;
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
    state.focusedPane = groupName;
    activeWs.lastFocusedPane = groupName;
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

// ===== Context Menu =====

/**
 * @param {string} sessionName
 * @param {HTMLElement} anchorEl
 */
function showQuickMessageInput(sessionName, anchorEl) {
  // Remove any existing popup
  byId("quick-msg-popup")?.remove();

  const popup = document.createElement("div");
  popup.id = "quick-msg-popup";
  popup.className = "quick-msg-popup";

  const title = document.createElement("div");
  title.className = "quick-msg-title";
  title.textContent = `→ ${sessionName}`;
  popup.appendChild(title);

  const row = document.createElement("div");
  row.className = "quick-msg-row";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "quick-msg-input";
  input.placeholder = "Type a message…";

  const sendBtn = document.createElement("button");
  sendBtn.className = "quick-msg-send";
  sendBtn.textContent = "Send";

  row.appendChild(input);
  row.appendChild(sendBtn);
  popup.appendChild(row);
  document.body.appendChild(popup);

  // Position below the anchor element
  const rect = anchorEl.getBoundingClientRect();
  popup.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
  popup.style.top = `${rect.bottom + 4}px`;

  input.focus();

  const dismiss = () => popup.remove();

  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    sendBtn.disabled = true;
    input.disabled = true;
    fetch(`/api/sessions/${encodeURIComponent(sessionName)}/quick-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          title.textContent = "sent ✓";
          title.style.color = "#4ec94e";
          setTimeout(dismiss, 1200);
        } else {
          title.textContent = `error: ${data.error || "failed"}`;
          title.style.color = "#ff6060";
          sendBtn.disabled = false;
          input.disabled = false;
          input.focus();
        }
      })
      .catch((err) => {
        title.textContent = `error: ${err.message}`;
        title.style.color = "#ff6060";
        sendBtn.disabled = false;
        input.disabled = false;
        input.focus();
      });
  };

  sendBtn.onclick = send;
  input.onkeydown = /** @param {KeyboardEvent} e */ (e) => {
    if (e.key === "Enter") send();
    if (e.key === "Escape") dismiss();
  };

  // Click outside to dismiss
  const outside = /** @param {MouseEvent} e */ (e) => {
    const t = e.target instanceof Node ? e.target : null;
    if (!popup.contains(t)) { dismiss(); document.removeEventListener("mousedown", outside); }
  };
  setTimeout(() => document.addEventListener("mousedown", outside), 0);
}

/**
 * @param {MouseEvent} e
 * @param {string} path
 */
function showContextMenu(e, path) {
  e.preventDefault();
  e.stopPropagation();
  state.ctxTarget = path;

  const menu = byId("context-menu");
  const isFav = state.favorites.includes(path);

  menu.querySelector('[data-action="fav-add"]')?.classList.toggle("ctx-disabled", isFav);
  menu.querySelector('[data-action="fav-remove"]')?.classList.toggle("ctx-disabled", !isFav);

  const isPinned = state.pinnedFolders.includes(path);
  menu.querySelector('[data-action="pin-add"]')?.classList.toggle("ctx-disabled", isPinned);
  menu.querySelector('[data-action="pin-remove"]')?.classList.toggle("ctx-disabled", !isPinned);

  // Hide separator only when both pin items are disabled (nothing meaningful to show)
  const pinSep = /** @type {HTMLElement | null} */ (menu.querySelector(".ctx-sep-pin"));
  if (pinSep) pinSep.style.display = "";

  // Show "Force idle" only when a busy AI session exists at this path
  const np = normPath(path);
  const aiCommands = new Set(state.aiPresets.map((p) => p.command));
  const hasBusyAI = [...state.sessions.values()].some(
    (s) => aiCommands.has(s.command) && s.status === "busy" && normPath(s.workingDir) === np
  );
  const forceIdleItem = /** @type {HTMLElement | null} */ (menu.querySelector('[data-action="force-idle"]'));
  if (forceIdleItem) forceIdleItem.style.display = hasBusyAI ? "" : "none";

  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
  menu.classList.remove("hidden");
}

document.addEventListener("click", () => {
  byId("context-menu").classList.add("hidden");
});

byId("context-menu").addEventListener("click", async (e) => {
  const resolved = resolveContextAction(e.target, state.ctxTarget);
  if (!resolved) return;
  const handler = contextMenuActions[resolved.action];
  if (handler) await handler(resolved.path, resolved.name);
  byId("context-menu").classList.add("hidden");
});

const contextMenuActions = buildContextMenuActions({
  state,
  openFolder,
  renderTree,
  renderQuickAccess,
  saveFavorites,
  savePinnedFolders,
  normPath,
});

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

    const isRunning = state.sessions.has(f.name);

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
  state.expandedPaths.clear();
  saveExpandedPaths();
  renderTree();
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
  if (path && !state.favorites.includes(path)) {
    state.favorites.push(path);
    saveFavorites();
    state.expandedPaths.add(path);
    renderTree();
  }
};

// ===== Workspaces =====

/**
 * @param {string | null} name
 * @returns {import("./lib/state.js").Workspace}
 */
function createWorkspace(name) {
  const id = `ws-${state.nextWorkspaceId++}`;
  /** @type {import("./lib/state.js").Workspace} */
  const ws = { id, name: name || `Workspace ${state.nextWorkspaceId - 1}`, layout: null };
  state.workspaces.push(ws);
  renderTabs();
  return ws;
}

/**
 * @param {string} id
 */
function switchToWorkspace(id) {
  // Save focused pane for current workspace
  if (state.activeWorkspaceId) {
    const prevWs = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    if (prevWs) prevWs.lastFocusedPane = state.focusedPane;
  }

  dashboardPanel.stopPolling();
  state.activeWorkspaceId = id;
  state.isDashboard = false;
  state.isDiag = false;
  state.isTracker = false;

  // Restore focused pane for target workspace
  const ws = state.workspaces.find((w) => w.id === id);
  if (ws?.lastFocusedPane && ws.layout && treeContains(ws.layout, ws.lastFocusedPane)) {
    state.focusedPane = ws.lastFocusedPane;
  } else if (ws?.layout) {
    const leaves = getLeafList(ws.layout);
    state.focusedPane = leaves.length > 0 ? leaves[0] : null;
  }

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
  state.activeWorkspaceId = null;
  state.isDashboard = true;
  state.isDiag = false;
  state.isTracker = false;
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
  const idx = state.workspaces.findIndex((w) => w.id === id);
  if (idx === -1) return;
  state.workspaces.splice(idx, 1);
  if (state.activeWorkspaceId === id) switchToDashboard();
  renderTabs();
}


// ===== Tabs (extracted to lib/workspace-tabs.js) =====


// ===== Session/Folder Drop Handler (extracted to lib/session-drop.js) =====

// ===== Tiling =====

// ===== Pane drag-to-reorder (extracted to lib/pane-drag.js) =====

// ===== Layout presets =====

const LAYOUT_PRESETS = [
  { name: "Auto (balanced)",    min: 1, build: /** @param {string[]} s */ (s) => buildBalancedTree(s) },
  { name: "2 Columns",          min: 2, build: /** @param {string[]} s */ ([a,b]) => ({ type:"split", direction:"h", ratio:0.5, children:[{type:"leaf",session:a},{type:"leaf",session:b}] }) },
  { name: "3 Columns",          min: 3, build: /** @param {string[]} s */ ([a,b,c]) => ({ type:"split", direction:"h", ratio:0.333, children:[{type:"leaf",session:a},{type:"split",direction:"h",ratio:0.5,children:[{type:"leaf",session:b},{type:"leaf",session:c}]}] }) },
  { name: "2 Top + 1 Bottom",   min: 3, build: /** @param {string[]} s */ ([a,b,c]) => ({ type:"split", direction:"v", ratio:0.5, children:[{type:"split",direction:"h",ratio:0.5,children:[{type:"leaf",session:a},{type:"leaf",session:b}]},{type:"leaf",session:c}] }) },
  { name: "1 Top + 2 Bottom",   min: 3, build: /** @param {string[]} s */ ([a,b,c]) => ({ type:"split", direction:"v", ratio:0.5, children:[{type:"leaf",session:a},{type:"split",direction:"h",ratio:0.5,children:[{type:"leaf",session:b},{type:"leaf",session:c}]}] }) },
  { name: "Large Left + Stack", min: 3, build: /** @param {string[]} s */ ([a,b,c]) => ({ type:"split", direction:"h", ratio:0.6, children:[{type:"leaf",session:a},{type:"split",direction:"v",ratio:0.5,children:[{type:"leaf",session:b},{type:"leaf",session:c}]}] }) },
];

/**
 * @param {import('./lib/state.js').Workspace} ws
 * @param {number} idx
 */
function applyLayoutPreset(ws, idx) {
  const preset = LAYOUT_PRESETS[idx];
  const sessions = getLeafList(ws.layout);
  if (!preset || sessions.length < preset.min) return;
  ws.layout = /** @type {import('./lib/state.js').TileNode} */ (preset.build(sessions));
  saveWorkspaces(); renderActiveWorkspace();
}

/**
 * @param {MouseEvent} e
 * @param {import('./lib/state.js').Workspace} ws
 */
function showLayoutPresetsMenu(e, ws) {
  e.stopPropagation();
  const menu = byId("pane-context-menu");
  menu.innerHTML = ""; menu.classList.remove("hidden");
  const target = e.target instanceof HTMLElement ? e.target : null;
  const rect = target ? target.getBoundingClientRect() : { left: 0, bottom: 0 };
  menu.style.left = `${rect.left}px`; menu.style.top = `${rect.bottom + 2}px`;
  const sessions = ws.layout ? getLeafList(ws.layout) : [];
  LAYOUT_PRESETS.forEach((p, i) => {
    const item = document.createElement("div");
    item.className = `ctx-item${sessions.length < p.min ? " ctx-disabled" : ""}`;
    item.textContent = p.name;
    if (sessions.length >= p.min) item.onclick = () => { applyLayoutPreset(ws, i); menu.classList.add("hidden"); };
    menu.appendChild(item);
  });
  const close = /** @param {MouseEvent} ev */ ev => {
    const t = ev.target instanceof Node ? ev.target : null;
    if (!menu.contains(t)) { menu.classList.add("hidden"); document.removeEventListener("mousedown", close); }
  };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}

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

state.favorites = loadFavorites();
if (state.favorites.length === 0) state.favorites.push("C:\\");
state.pinnedFolders = loadPinnedFolders();
state.expandedPaths = loadExpandedPaths();
// Auto-expand favorites that haven't been explicitly collapsed
for (const f of state.favorites) {
  if (!state.expandedPaths.has(f) && state.expandedPaths.size === 0) {
    state.expandedPaths.add(f);
  }
}

// Restore sidebar width
const savedWidth = loadSidebarWidth();
byId("sidebar").style.width = `${savedWidth}px`;

// Restore workspaces (layouts referencing sessions — terminals reconnect via WS)
const savedWs = loadWorkspaces();
if (savedWs) {
  state.workspaces = savedWs.workspaces || [];
  state.activeWorkspaceId = savedWs.activeWorkspaceId || null;
  state.isDashboard = savedWs.isDashboard !== false;
  state.nextWorkspaceId = savedWs.nextId || 1;
}
state.sessionMeta = loadSessionMeta();

renderTabs();
if (state.isDashboard) dashboardPanel.render();
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
