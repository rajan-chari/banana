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
  appendLeafToTree,
  getLeafList,
  treeContains,
  findParentSplit,
} from "./lib/tiling.js";
import { rebuildPaneGroups as _rebuildPaneGroups } from "./lib/pane-groups.js";
import { reorderWorkspaces, tabDropSide } from "./lib/workspace-tabs.js";
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
import {
  computeDiagTotalCost,
  removeStaleDiagRows,
  upsertDiagRow,
  upsertDiagTotalRow,
} from "./lib/diag-panel.js";
import {
  normPath,
  cssId,
  truncatePath,
  fmtAgo,
  escapeHtml,
} from "./lib/format.js";
import {
  buildSessionGroups,
} from "./lib/session-groups.js";
import {
  hasSessionNameSetChanged,
  findOrphanedLeaves,
  classifyOrphanGroups,
  rebalanceLayoutsWithoutLeaves,
} from "./lib/ws-handlers.js";
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
  EMPTY_DASHBOARD_HTML,
  patchCardFields,
  removeStaleCards,
} from "./lib/dashboard-patch.js";
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
import { resolveCtrlShiftKeyAction } from "./lib/key-shortcuts.js";
import {
  resolveResumeMenuState,
  makeCtxItem,
  makeCtxSeparator,
  makeCtxHeader,
} from "./lib/pane-context-menu.js";

/** @type {string | null} */
let dragSrcWsId = null;
/** @type {ReturnType<typeof setInterval> | null} */
let diagPollTimer = null;
/** @type {ReturnType<typeof setInterval> | null} */
let trackerPollTimer = null;

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

// ===== WebSocket =====

function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  state.ws = new WebSocket(`${proto}//${location.host}`);

  state.ws.onopen = () => initApp();

  state.ws.onclose = () => setTimeout(connect, 2000);

  state.ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    dispatchWsMessage(msg);
    restoreTerminalFocusAfterRebuild();
  };
}

/**
 * @param {{ type: string, [k: string]: any }} msg
 */
function dispatchWsMessage(msg) {
  switch (msg.type) {
    case "data": handleWsData(msg); break;
    case "sessions": handleWsSessions(msg); break;
    case "status": handleWsStatus(msg); break;
    case "config": handleWsConfig(msg); break;
    case "notification": handleWsNotification(msg); break;
  }
}

function handleWsData(/** @type {any} */ msg) {
  const entry = state.terminals.get(msg.session);
  if (entry) entry.term.write(msg.payload);
}

function handleWsSessions(/** @type {any} */ msg) {
  // Detect if the set of sessions changed (not just status updates)
  const prevNames = new Set(state.sessions.keys());
  const serverNames = new Set(msg.payload.map(/** @param {import('./lib/state.js').SessionInfo} s */ (s) => s.name));
  const layoutChanged = hasSessionNameSetChanged(prevNames, serverNames);

  // Replace full session list (server is authoritative)
  state.sessions.clear();
  for (const s of msg.payload) state.sessions.set(s.name, s);

  // Capture session metadata for recreation after restarts
  for (const s of msg.payload) {
    state.sessionMeta.set(s.name, { workingDir: s.workingDir, command: s.command });
  }
  saveSessionMeta();

  rebuildPaneGroups();

  // Collect orphaned workspace leaves (in layout but not on server)
  const serverGroups = new Set([...state.sessions.values()].map((s) => s.group || s.name));
  const orphans = findOrphanedLeaves(state.workspaces, serverGroups, getLeafList);

  const { recreatable, unrecoverable } = classifyOrphanGroups(orphans, state.sessionMeta);

  if (unrecoverable.length > 0) {
    const updates = rebalanceLayoutsWithoutLeaves(state.workspaces, unrecoverable, getLeafList, buildBalancedTree);
    for (const { workspace, newLayout } of updates) {
      workspace.layout = newLayout;
      updateWorkspaceTabName(workspace);
    }
  }

  if (recreatable.length > 0) {
    recreateOrphanedSessions(recreatable);
  }

  refreshTreeRunningState();
  renderSessionsPanel();
  renderQuickAccess();
  if (state.isDashboard) {
    renderDashboard();
  } else if (layoutChanged) {
    renderActiveWorkspace();
    requestAnimationFrame(() => refitAllTerminalsAndResize());
  } else {
    for (const s of msg.payload) updatePaneStatus(s.name);
  }
}

function refitAllTerminalsAndResize() {
  for (const [n, e] of state.terminals) {
    try {
      e.fitAddon.fit();
      const { cols, rows } = e.term;
      state.ws?.send(JSON.stringify({ type: "resize", session: n, payload: { cols, rows } }));
    } catch {}
  }
}

function handleWsStatus(/** @type {any} */ msg) {
  const s = state.sessions.get(msg.session);
  if (!s) return;
  s.status = msg.payload.status;
  s.unreadCount = msg.payload.unreadCount;
  s.pendingPermission = !!msg.payload.pendingPermission;
  rebuildPaneGroups();
  updatePaneStatus(msg.session);
  refreshTreeRunningState();
  renderSessionsPanel();
  renderQuickAccess();

  if (state.isDashboard) renderDashboard();

  if (msg.payload.status === "dead") {
    if (msg.payload.dirtyOnExit) {
      showDirtyWarning(msg.session, msg.payload.workingDir);
    }
    setTimeout(() => autoRemoveDeadSession(msg.session), 1500);
  }
}

function handleWsConfig(/** @type {any} */ msg) {
  if (msg.name != null) applyInstanceName(msg.name);
}

function handleWsNotification(/** @type {any} */ msg) {
  const s = state.sessions.get(msg.session);
  if (!s) return;
  // Don't increment unreadCount here — status-change carries the authoritative count.
  updatePaneStatus(msg.session);
  renderSessionsPanel();
  renderQuickAccess();
  if (state.isDashboard) renderDashboard();
}

function restoreTerminalFocusAfterRebuild() {
  // Restore terminal focus after DOM rebuilds (prevents WS updates from stealing focus).
  // Check if focus was in a pane OR was lost to <body> (due to DOM rebuild destroying the focused element).
  if (!state.focusedPane || state.isDashboard) return;
  const pg = state.paneGroups.get(state.focusedPane);
  const sessionName = pg ? (pg.activeType === "pwsh" ? pg.pwsh : pg.claude) : state.focusedPane;
  const entry = state.terminals.get(sessionName || state.focusedPane);
  const focusInPane = document.activeElement?.closest(".pane");
  const focusLostToBody = document.activeElement === document.body;
  if (entry && (focusInPane || focusLostToBody)) {
    entry.term.focus();
  }
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
  if (state.isDashboard) renderDashboard();
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
  if (state.isDashboard) renderDashboard();
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

  stopDiagPoll();
  stopTrackerPoll();
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

function stopDiagPoll() {
  if (diagPollTimer) { clearInterval(diagPollTimer); diagPollTimer = null; }
}

function switchToDashboard() {
  stopDiagPoll();
  stopTrackerPoll();
  state.activeWorkspaceId = null;
  state.isDashboard = true;
  state.isDiag = false;
  state.isTracker = false;
  renderTabs();
  renderDashboard();
  diagPollTimer = setInterval(renderDashboardStats, 5000);
}

function stopTrackerPoll() {
  if (trackerPollTimer) { clearInterval(trackerPollTimer); trackerPollTimer = null; }
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

// ===== Tabs =====

function renderTabs() {
  saveWorkspaces();
  const tabsEl = byId("tabs");
  tabsEl.innerHTML = "";

  const dashTab = document.createElement("div");
  dashTab.className = `tab ${state.isDashboard ? "active" : ""}`;
  dashTab.textContent = "Dashboard";
  dashTab.onclick = () => switchToDashboard();
  tabsEl.appendChild(dashTab);

  for (const ws of state.workspaces) {
    tabsEl.appendChild(buildWorkspaceTab(ws));
  }

  tabsEl.appendChild(buildAddWorkspaceButton());
}

/**
 * Build a single workspace tab element with all wiring (close, layout-presets
 * button, drag-to-reorder, click, double-click rename).
 * @param {import('./lib/state.js').Workspace} ws
 * @returns {HTMLElement}
 */
function buildWorkspaceTab(ws) {
  const tab = document.createElement("div");
  tab.className = `tab ${ws.id === state.activeWorkspaceId ? "active" : ""}`;

  const label = document.createElement("span");
  label.className = "tab-label";
  label.textContent = ws.name;
  tab.appendChild(label);

  const close = document.createElement("span");
  close.className = "tab-close";
  close.textContent = "\u00d7";
  close.onclick = (e) => { e.stopPropagation(); removeWorkspace(ws.id); };
  tab.appendChild(close);

  if (ws.id === state.activeWorkspaceId && ws.layout && getLeafList(ws.layout).length >= 2) {
    const layoutBtn = document.createElement("span");
    layoutBtn.className = "tab-layout-btn";
    layoutBtn.title = "Layout presets";
    layoutBtn.textContent = "\u229e";
    layoutBtn.onclick = (e) => showLayoutPresetsMenu(e, ws);
    tab.appendChild(layoutBtn);
  }

  wireTabDragReorder(tab, ws);
  wireTabClickAndRename(tab, label, ws);
  return tab;
}

/**
 * @param {HTMLElement} tab
 * @param {import('./lib/state.js').Workspace} ws
 */
function wireTabDragReorder(tab, ws) {
  tab.draggable = true;
  tab.addEventListener("dragstart", /** @param {DragEvent} e */ (e) => {
    if (!e.dataTransfer) return;
    dragSrcWsId = ws.id;
    tab.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  tab.addEventListener("dragend", () => {
    dragSrcWsId = null;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("drag-over-left", "drag-over-right", "dragging"));
  });
  tab.addEventListener("dragover", /** @param {DragEvent} e */ (e) => {
    if (!e.dataTransfer) return;
    if (e.dataTransfer.types.includes("pty-win/session") || e.dataTransfer.types.includes("pty-win/folder")) {
      e.preventDefault(); e.dataTransfer.dropEffect = "copy"; tab.classList.add("drop-target"); return;
    }
    if (!dragSrcWsId || dragSrcWsId === ws.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const side = tabDropSide(tab.getBoundingClientRect(), e.clientX);
    tab.classList.toggle("drag-over-left", side === "left");
    tab.classList.toggle("drag-over-right", side === "right");
  });
  tab.addEventListener("dragleave", () => {
    tab.classList.remove("drag-over-left", "drag-over-right", "drop-target");
  });
  tab.addEventListener("drop", /** @param {DragEvent} e */ (e) => {
    if (!e.dataTransfer) return;
    tab.classList.remove("drop-target");
    if (e.dataTransfer.types.includes("pty-win/session") || e.dataTransfer.types.includes("pty-win/folder")) {
      e.preventDefault(); handleSessionDrop(e, ws.id); return;
    }
    if (!dragSrcWsId || dragSrcWsId === ws.id) return;
    e.preventDefault();
    const side = tabDropSide(tab.getBoundingClientRect(), e.clientX);
    state.workspaces = reorderWorkspaces(state.workspaces, dragSrcWsId, ws.id, side);
    dragSrcWsId = null;
    renderTabs();
  });
}

/**
 * @param {HTMLElement} tab
 * @param {HTMLElement} label
 * @param {import('./lib/state.js').Workspace} ws
 */
function wireTabClickAndRename(tab, label, ws) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let clickTimer = null;
  tab.onclick = () => {
    if (clickTimer) return;
    clickTimer = setTimeout(() => {
      clickTimer = null;
      switchToWorkspace(ws.id);
    }, 250);
  };

  label.ondblclick = /** @param {MouseEvent} e */ (e) => {
    e.stopPropagation();
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }

    const input = document.createElement("input");
    input.className = "tab-rename";
    input.value = ws.name;
    input.style.width = `${Math.max(60, ws.name.length * 8)}px`;
    label.replaceWith(input);
    input.focus();
    input.select();

    const finish = () => {
      const newName = input.value.trim() || ws.name;
      ws.name = newName;
      ws.customName = true;
      renderTabs();
    };
    input.onblur = finish;
    input.onkeydown = /** @param {KeyboardEvent} ev */ (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
      if (ev.key === "Escape") { input.value = ws.name; input.blur(); }
    };
  };
}

/** @returns {HTMLElement} */
function buildAddWorkspaceButton() {
  const addBtn = document.createElement("button");
  addBtn.id = "btn-new-workspace";
  addBtn.title = "New workspace";
  addBtn.textContent = "+";
  addBtn.onclick = () => { const ws = createWorkspace(null); switchToWorkspace(ws.id); };
  addBtn.addEventListener("dragover", /** @param {DragEvent} e */ (e) => {
    if (!e.dataTransfer) return;
    if (e.dataTransfer.types.includes("pty-win/session") || e.dataTransfer.types.includes("pty-win/folder")) {
      e.preventDefault(); e.dataTransfer.dropEffect = "copy"; addBtn.classList.add("drop-target");
    }
  });
  addBtn.addEventListener("dragleave", () => addBtn.classList.remove("drop-target"));
  addBtn.addEventListener("drop", /** @param {DragEvent} e */ (e) => {
    addBtn.classList.remove("drop-target");
    handleSessionDrop(e, null);
  });
  return addBtn;
}

// ===== Session/Folder Drop Handler =====

/**
 * @param {DragEvent} e
 * @param {string | null} targetWsId
 */
async function handleSessionDrop(e, targetWsId) {
  e.preventDefault();
  if (!e.dataTransfer) return;
  let groupName, workingDir, folderName;

  const sessionData = e.dataTransfer.getData("pty-win/session");
  const folderData = e.dataTransfer.getData("pty-win/folder");

  if (sessionData) {
    const d = JSON.parse(sessionData);
    groupName = d.group;
  } else if (folderData) {
    const d = JSON.parse(folderData);
    workingDir = d.workingDir;
    folderName = d.folderName;
    groupName = folderName;
    // Start a session if not already running
    const existing = state.sessions.get(groupName);
    if (!existing || existing.status === "dead") {
      await openFolder(workingDir, folderName, getDefaultAiCommand());
    }
  }

  if (!groupName) return;

  // Create or use target workspace
  let ws;
  if (targetWsId) {
    ws = state.workspaces.find((w) => w.id === targetWsId);
  } else {
    ws = createWorkspace(groupName);
  }
  if (!ws) return;

  // Add session to workspace if not already there
  const leaves = ws.layout ? getLeafList(ws.layout) : [];
  if (!leaves.includes(groupName)) {
    addSessionToWorkspace(ws.id, groupName);
  }
  switchToWorkspace(ws.id);
  renderActiveWorkspace();
}

// Workspace area drop target (drop onto current workspace)
byId("workspace-area")?.addEventListener("dragover", /** @param {DragEvent} e */ (e) => {
  if (!e.dataTransfer) return;
  if (e.dataTransfer.types.includes("pty-win/session") || e.dataTransfer.types.includes("pty-win/folder")) {
    e.preventDefault(); e.dataTransfer.dropEffect = "copy";
  }
});
byId("workspace-area")?.addEventListener("drop", /** @param {DragEvent} e */ (e) => {
  if (!e.dataTransfer) return;
  if (e.dataTransfer.types.includes("pty-win/session") || e.dataTransfer.types.includes("pty-win/folder")) {
    handleSessionDrop(e, state.activeWorkspaceId);
  }
});

// ===== Tiling =====

/**
 * @param {string} workspaceId
 * @param {string} sessionName
 */
function addSessionToWorkspace(workspaceId, sessionName) {
  const ws = state.workspaces.find((w) => w.id === workspaceId);
  if (!ws) return;

  if (!ws.layout) {
    ws.layout = { type: "leaf", session: sessionName };
    return;
  }
  // Preserve manual/preset layout — append new pane to trailing edge
  ws.layout = appendLeafToTree(ws.layout, { type: "leaf", session: sessionName });
}

/** Build a balanced binary tree from a list of session names */
// ===== Pane drag-to-reorder =====

/** @type {{
 *   active: boolean,
 *   session: string | null,
 *   ghostEl: HTMLElement | null,
 *   dropZoneEls: HTMLElement[],
 *   currentTarget: { session: string, side: "left" | "right" | "top" | "bottom" } | null
 * }} */
const paneDrag = { active: false, session: null, ghostEl: null, dropZoneEls: [], currentTarget: null };

/**
 * @param {string} excludeSession
 */
function showDropZones(excludeSession) {
  clearDropZones();
  document.querySelectorAll(".pane[data-session]").forEach(paneEl => {
    if (!(paneEl instanceof HTMLElement)) return;
    const session = paneEl.dataset["session"];
    if (session === excludeSession) return;
    const r = paneEl.getBoundingClientRect();
    [
      { side: "top",    x: r.left,               y: r.top,                w: r.width,        h: r.height * 0.25 },
      { side: "bottom", x: r.left,               y: r.top + r.height * 0.75, w: r.width,     h: r.height * 0.25 },
      { side: "left",   x: r.left,               y: r.top + r.height * 0.25, w: r.width * 0.25, h: r.height * 0.5 },
      { side: "right",  x: r.left + r.width * 0.75, y: r.top + r.height * 0.25, w: r.width * 0.25, h: r.height * 0.5 },
    ].forEach(({ side, x, y, w, h }) => {
      const el = document.createElement("div");
      el.className = "pane-drop-zone";
      el.dataset["session"] = session;
      el.dataset["side"] = side;
      el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
      document.body.appendChild(el);
      paneDrag.dropZoneEls.push(el);
    });
  });
}

function clearDropZones() {
  paneDrag.dropZoneEls.forEach(el => el.remove());
  paneDrag.dropZoneEls = [];
  paneDrag.currentTarget = null;
}

/**
 * @param {number} mx
 * @param {number} my
 */
function updateDropZoneHighlight(mx, my) {
  let best = null;
  for (const el of paneDrag.dropZoneEls) {
    const r = el.getBoundingClientRect();
    if (mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom) { best = el; break; }
  }
  paneDrag.dropZoneEls.forEach(el => el.classList.remove("active"));
  if (best) {
    best.classList.add("active");
    const session = best.dataset["session"] || "";
    const side = /** @type {"left" | "right" | "top" | "bottom"} */ (best.dataset["side"] || "right");
    paneDrag.currentTarget = { session, side };
  } else {
    paneDrag.currentTarget = null;
  }
}

function commitPaneDrop() {
  const { session: dragSession, currentTarget, ghostEl } = paneDrag;
  ghostEl?.remove();
  clearDropZones();
  paneDrag.active = false; paneDrag.session = null; paneDrag.ghostEl = null;
  document.body.classList.remove("pane-dragging");
  if (!currentTarget || !dragSession || currentTarget.session === dragSession) return;
  const ws = state.workspaces.find(w => w.id === state.activeWorkspaceId);
  if (!ws?.layout) return;
  const pruned = removeSessionFromLayout(ws.layout, dragSession);
  if (!pruned || !treeContains(pruned, currentTarget.session)) return;
  ws.layout = insertAdjacentToPane(pruned, currentTarget.session, dragSession, currentTarget.side);
  saveWorkspaces();
  renderActiveWorkspace();
}

/**
 * @param {MouseEvent} e
 * @param {string} groupName
 */
function startPaneDrag(e, groupName) {
  const ws = state.workspaces.find(w => w.id === state.activeWorkspaceId);
  if (!ws?.layout || getLeafList(ws.layout).length < 2) return;
  e.preventDefault();
  paneDrag.active = true; paneDrag.session = groupName;
  document.body.classList.add("pane-dragging");
  const ghost = document.createElement("div");
  ghost.className = "pane-drag-ghost";
  ghost.textContent = groupName;
  ghost.style.left = `${e.clientX + 12}px`; ghost.style.top = `${e.clientY + 8}px`;
  document.body.appendChild(ghost);
  paneDrag.ghostEl = ghost;
  showDropZones(groupName);
  const onMove = /** @param {MouseEvent} ev */ ev => {
    ghost.style.left = `${ev.clientX + 12}px`; ghost.style.top = `${ev.clientY + 8}px`;
    updateDropZoneHighlight(ev.clientX, ev.clientY);
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    document.removeEventListener("keydown", onKey);
    commitPaneDrop();
  };
  const onKey = /** @param {KeyboardEvent} ev */ ev => {
    if (ev.key !== "Escape") return;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    document.removeEventListener("keydown", onKey);
    ghost.remove(); clearDropZones();
    paneDrag.active = false; paneDrag.session = null; paneDrag.ghostEl = null;
    document.body.classList.remove("pane-dragging");
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
  document.addEventListener("keydown", onKey);
}

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
  const area = byId("workspace-area");
  area.innerHTML = "";

  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (!ws || !ws.layout) {
    const empty = document.createElement("div");
    empty.className = "dashboard active";
    empty.innerHTML = '<div class="dashboard-empty">Empty workspace. Use the folder browser or <kbd>Ctrl+P</kbd> to open a folder.</div>';
    area.appendChild(empty);
    return;
  }

  const container = document.createElement("div");
  container.className = "workspace active";
  area.appendChild(container);

  renderTileNode(ws.layout, container);
  requestAnimationFrame(() => fitAllTerminals(ws.layout));
}

/**
 * @param {any} node
 * @param {HTMLElement} parentEl
 */
function renderTileNode(node, parentEl) {
  if (node.type === "leaf") {
    parentEl.appendChild(createPane(node.session));
    return;
  }

  const container = document.createElement("div");
  container.className = "split-container";
  container.style.flexDirection = node.direction === "h" ? "row" : "column";
  parentEl.appendChild(container);

  const child1 = document.createElement("div");
  child1.className = "split-child";
  child1.style.flex = `${node.ratio} 0 0%`;
  container.appendChild(child1);

  const handle = document.createElement("div");
  handle.className = `drag-handle ${node.direction === "v" ? "vertical" : ""}`;
  setupDragHandle(handle, node, container);
  container.appendChild(handle);

  const child2 = document.createElement("div");
  child2.className = "split-child";
  child2.style.flex = `${1 - node.ratio} 0 0%`;
  container.appendChild(child2);

  renderTileNode(node.children[0], child1);
  renderTileNode(node.children[1], child2);
}

/**
 * @param {HTMLElement} handle
 * @param {any} node
 * @param {HTMLElement} container
 */
function setupDragHandle(handle, node, container) {
  handle.addEventListener("mousedown", /** @param {MouseEvent} e */ (e) => {
    e.preventDefault();
    handle.classList.add("dragging");
    document.body.style.cursor = node.direction === "h" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    const startPos = node.direction === "h" ? e.clientX : e.clientY;
    const startRatio = node.ratio;
    const totalSize = node.direction === "h" ? container.offsetWidth : container.offsetHeight;

    const onMove = /** @param {MouseEvent} e */ (e) => {
      const delta = (node.direction === "h" ? e.clientX : e.clientY) - startPos;
      node.ratio = Math.max(0.15, Math.min(0.85, startRatio + delta / totalSize));
      const children = container.querySelectorAll(":scope > .split-child");
      const c0 = /** @type {HTMLElement | null} */ (children[0] || null);
      const c1 = /** @type {HTMLElement | null} */ (children[1] || null);
      if (c0) c0.style.flex = `${node.ratio} 0 0%`;
      if (c1) c1.style.flex = `${1 - node.ratio} 0 0%`;
    };

    const onUp = () => {
      handle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
      if (ws?.layout) requestAnimationFrame(() => fitAllTerminals(ws.layout));
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

/**
 * @param {any} node
 */
function fitAllTerminals(node) {
  if (!node) return;
  if (node.type === "leaf") {
    const groupName = node.session;
    const pg = state.paneGroups.get(groupName);
    const activeSessionName = pg ? (pg.activeType === "pwsh" ? pg.pwsh : pg.claude) : groupName;
    const entry = state.terminals.get(activeSessionName || groupName);
    if (entry) { try { entry.fitAddon.fit(); } catch {} }
    return;
  }
  fitAllTerminals(node.children[0]);
  fitAllTerminals(node.children[1]);
}

// ===== Panes =====

// Module-scoped paste guard: short (50ms) window during Ctrl+V handling
// that prevents onData from re-emitting the pasted text. Only one pane
// has focus at any time, so a singleton is sufficient.
// Per-session paste guard: when the Ctrl+V handler reads the clipboard and
// sends the payload via WS, the terminal's own onData also fires for the
// pasted text — set the guard while the clipboard read is in flight so we
// don't double-send. Module-scope but keyed BY session so a paste in pane
// A never suppresses data from pane B.
const _pasteGuards = new Set();

/**
 * Handle Ctrl+Shift+<key> shortcuts inside an xterm pane.
 *
 * @param {KeyboardEvent} e
 * @param {string} sessionName
 * @returns {boolean} false if handled (suppress default), true otherwise
 */
function handleCtrlShiftKey(e, sessionName) {
  const action = resolveCtrlShiftKeyAction(e.key);
  switch (action.type) {
    case "clearInputDirty":
      state.ws?.send(JSON.stringify({ type: "clear-input-dirty", session: sessionName }));
      return false;
    case "switchToDashboard": switchToDashboard(); return false;
    case "closeFocusedPane": closeFocusedPane(); return false;
    case "toggleSidebar": toggleSidebar(); return false;
    case "switchWorkspace":
      if (state.workspaces[action.index]) switchToWorkspace(state.workspaces[action.index].id);
      return false;
    case "resize": resizeFocused(action.direction); return false;
    case "noop": return false;
    case "passthrough": return true;
  }
  return true;
}

/**
 * Handle Ctrl+<key> (no shift) shortcuts inside an xterm pane.
 *
 * @param {KeyboardEvent} e
 * @param {string} sessionName
 * @returns {boolean} false if handled (suppress default), true otherwise
 */
function handleCtrlOnlyKey(e, sessionName) {
  if (e.key === "p") {
    openQuickOpen();
    return false;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
    navigatePanes(e.key);
    return false;
  }
  if (e.key === "v") {
    _pasteGuards.add(sessionName);
    navigator.clipboard.readText().then((text) => {
      if (text) state.ws?.send(JSON.stringify({ type: "input", session: sessionName, payload: text }));
    }).catch(() => {}).finally(() => {
      setTimeout(() => { _pasteGuards.delete(sessionName); }, 50);
    });
    return false;
  }
  return true;
}

const ALLOWED_STATUS_DOT = new Set(["starting", "busy", "idle", "dead"]);

/**
 * Normalise a server-supplied status string to one of the known
 * dot-color classes; unknown values fall back to "starting".
 *
 * @param {string | undefined} status
 * @returns {string}
 */
function normaliseStatusDot(status) {
  return status && ALLOWED_STATUS_DOT.has(status) ? status : "starting";
}

/**
 * Build the top bar of a pane, including all event handlers
 * (toggle, code button, close button, identity click, context menu,
 * topbar drag). All dynamic strings interpolated into innerHTML are
 * routed through escapeHtml() — defense in depth, since values like
 * info.emcomIdentity and info.workingDir can flow from disk-side
 * config files (identity.json, presets).
 *
 * @param {{ activeType?: string, claude?: string, pwsh?: string } | undefined} pg
 * @param {"claude" | "pwsh"} activeType
 * @param {import('./lib/state.js').SessionInfo | undefined} info
 * @param {string} groupName
 * @param {boolean} hasBoth
 * @param {string} activeSessionName
 * @returns {HTMLElement}
 */
function buildPaneTopbar(pg, activeType, info, groupName, hasBoth, activeSessionName) {
  const topbar = document.createElement("div");
  topbar.className = "pane-topbar";

  const toggleHtml = hasBoth ? buildPaneToggleHtml(activeType) : "";
  const identityHtml = info?.emcomIdentity
    ? `<span class="pane-identity">${escapeHtml(info.emcomIdentity)}</span>`
    : "";
  const aiPreset = (activeType !== "pwsh" && info?.command)
    ? getAiPresetForCommand(info.command)
    : null;
  const presetBadge = aiPreset
    ? `<span class="pane-ai-preset" title="${escapeHtml(aiPreset.name)}">${escapeHtml(aiPreset.icon)} ${escapeHtml(aiPreset.name)}</span>`
    : "";
  const wd = info?.workingDir || "";
  topbar.innerHTML = `
    <span class="pane-name">${escapeHtml(groupName)}</span>
    ${toggleHtml}
    ${presetBadge}
    <span class="pane-action cmd-tag code" title="Open in VS Code">&lt;/&gt;</span>
    ${identityHtml}
    <span class="pane-cwd" title="${escapeHtml(wd)}">${escapeHtml(truncatePath(wd))}</span>
    <span class="pane-close" title="Kill session">&times;</span>
  `;

  if (hasBoth) attachPaneToggleHandlers(topbar, groupName);
  attachPaneTopbarActions(topbar, groupName, info, activeSessionName);
  return topbar;
}

/**
 * @param {"claude" | "pwsh"} activeType
 * @returns {string}
 */
function buildPaneToggleHtml(activeType) {
  const claudeActive = activeType === "claude" ? "active" : "";
  const pwshActive = activeType === "pwsh" ? "active" : "";
  return `<span class="pane-toggle">
      <button class="toggle-btn toggle-claude ${claudeActive}" title="Claude">C</button>
      <button class="toggle-btn toggle-pwsh ${pwshActive}" title="PowerShell">&gt;_</button>
    </span>`;
}

/**
 * @param {HTMLElement} topbar
 * @param {string} groupName
 */
function attachPaneToggleHandlers(topbar, groupName) {
  topbar.querySelector(".toggle-claude")?.addEventListener("click", (e) => {
    e.stopPropagation();
    switchPaneType(groupName, "claude");
  });
  topbar.querySelector(".toggle-pwsh")?.addEventListener("click", (e) => {
    e.stopPropagation();
    switchPaneType(groupName, "pwsh");
  });
}

/**
 * Wire the code button, close button, identity click, right-click
 * context menu and topbar drag handler.
 *
 * @param {HTMLElement} topbar
 * @param {string} groupName
 * @param {import('./lib/state.js').SessionInfo | undefined} info
 * @param {string} activeSessionName
 */
function attachPaneTopbarActions(topbar, groupName, info, activeSessionName) {
  const codeBtn = /** @type {HTMLElement | null} */ (topbar.querySelector(".pane-action.code"));
  if (codeBtn) codeBtn.onclick = (e) => {
    e.stopPropagation();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    fetch("/api/open-editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: info?.workingDir || "" }),
    });
  };

  const closeBtn = /** @type {HTMLElement | null} */ (topbar.querySelector(".pane-close"));
  if (closeBtn) closeBtn.onclick = (e) => {
    e.stopPropagation();
    killSession(activeSessionName);
  };

  topbar.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showPaneContextMenu(e, groupName);
  });

  const identityEl = /** @type {HTMLElement | null} */ (topbar.querySelector(".pane-identity"));
  if (identityEl && info?.emcomIdentity) {
    const identity = info.emcomIdentity;
    identityEl.style.cursor = "pointer";
    identityEl.title = `Switch feed to ${identity}`;
    identityEl.onclick = (e) => {
      e.stopPropagation();
      localStorage.setItem("pty-win-feed-identity", identity);
      window.dispatchEvent(new CustomEvent("feed-identity-change", { detail: identity }));
    };
  }

  topbar.addEventListener("mousedown", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest("button, .pane-close, .pane-action, .pane-identity, .toggle-btn")) return;
    if (e.button !== 0) return;
    startPaneDrag(e, groupName);
  });
}

/**
 * Build the bottom status bar for a pane (status dot, label, unread
 * pill). Values are coerced/whitelisted defensively.
 *
 * @param {import('./lib/state.js').SessionInfo | undefined} info
 * @returns {HTMLElement}
 */
function buildPaneStatusbar(info) {
  const statusbar = document.createElement("div");
  statusbar.className = "pane-statusbar";
  const status = normaliseStatusDot(info?.status);
  const unread = Number(info?.unreadCount) || 0;
  const dotClass = info?.pendingPermission ? "permission" : status;
  const label = info?.pendingPermission ? "permission" : status;
  statusbar.innerHTML = `
    <span class="status-dot ${escapeHtml(dotClass)}"></span>
    <span class="pane-status-label">${escapeHtml(label)}</span>
    <span class="pane-unread ${unread > 0 ? "show" : ""}">${unread}</span>
  `;
  return statusbar;
}

/**
 * Set up the xterm fit/resize lifecycle for the terminal entry inside
 * the pane's terminal area. Performs the persistent-wrapper attach,
 * retry-fit loop (waits for flex layout to resolve), and the
 * ResizeObserver. A fresh observer is created per render so its
 * closure doesn't hold stale `termArea`/`fitAndSync` references after
 * re-render.
 *
 * @param {{ term: any, fitAddon: any, opened: boolean, wrapperEl: HTMLElement, resizeObserver?: ResizeObserver }} entry
 * @param {HTMLElement} termArea
 * @param {string} activeSessionName
 */
function setupPaneFitLifecycle(entry, termArea, activeSessionName) {
  const fitAndSync = () => {
    try {
      if (!termArea.isConnected) return; // pane was detached before delayed fit
      const h = termArea.offsetHeight;
      if (h < 50) return;
      const prevCols = entry.term.cols;
      const prevRows = entry.term.rows;
      entry.fitAddon.fit();
      const { cols, rows } = entry.term;
      if (cols !== prevCols || rows !== prevRows) {
        state.ws?.send(JSON.stringify({ type: "resize", session: activeSessionName, payload: { cols, rows } }));
      }
    } catch {}
  };

  requestAnimationFrame(() => {
    if (!termArea.isConnected) return;
    if (!entry.opened) {
      termArea.appendChild(entry.wrapperEl);
      entry.term.open(entry.wrapperEl);
      entry.opened = true;
    } else {
      termArea.appendChild(entry.wrapperEl);
    }

    let fitRetries = 0;
    const retryFit = () => {
      if (!termArea.isConnected) return;
      fitAndSync();
      if (termArea.offsetHeight < 50 && fitRetries < 20) {
        fitRetries++;
        setTimeout(retryFit, 100);
      }
    };
    retryFit();
    setTimeout(fitAndSync, 300);
    setTimeout(fitAndSync, 1000);

    // Always create a fresh ResizeObserver per render so its callback
    // closes over the *current* termArea/fitAndSync. Disconnect any
    // stale observer left over from a previous render of the same
    // terminal entry.
    entry.resizeObserver?.disconnect();
    let lastW = 0, lastH = 0;
    entry.resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.height < 50) return;
      const w = Math.round(rect.width), h = Math.round(rect.height);
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      fitAndSync();
    });
    entry.resizeObserver.observe(termArea);
  });
}

/**
 * @param {string} groupName
 */
function createPane(groupName) {
  const pg = state.paneGroups.get(groupName);
  const activeType = pg?.activeType || "claude";
  const activeSessionName = activeType === "pwsh" ? (pg?.pwsh || groupName) : (pg?.claude || groupName);
  const info = state.sessions.get(activeSessionName);
  const hasBoth = !!(pg?.claude && pg?.pwsh);

  const pane = document.createElement("div");
  pane.className = `pane ${groupName === state.focusedPane ? "focused" : ""} ${info?.status === "dead" ? "dead" : ""}`;
  pane.dataset["session"] = groupName;
  pane.addEventListener("mousedown", () => focusPane(groupName));

  pane.appendChild(buildPaneTopbar(pg, activeType, info, groupName, hasBoth, activeSessionName));

  const termArea = document.createElement("div");
  termArea.className = "pane-terminal";
  pane.appendChild(termArea);

  pane.appendChild(buildPaneStatusbar(info));

  const entry = ensureTerminal(activeSessionName);
  setupPaneFitLifecycle(entry, termArea, activeSessionName);

  return pane;
}

/**
 * @param {string} sessionName
 */
function ensureTerminal(sessionName) {
  let entry = state.terminals.get(sessionName);
  if (entry) return entry;

  const term = new xtermTerminal({
    theme: TERM_THEME,
    fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: true,
    allowProposedApi: true,
  });

  const fitAddon = new xtermFitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new xtermWebLinksAddon.WebLinksAddon());

  term.onData(/** @param {string} data */ (data) => {
    if (_pasteGuards.has(sessionName)) return; // skip — already sent by Ctrl+V handler
    state.ws?.send(JSON.stringify({ type: "input", session: sessionName, payload: data }));
  });

  term.onResize(/** @param {{cols: number, rows: number}} dim */ ({ cols, rows }) => {
    state.ws?.send(JSON.stringify({ type: "resize", session: sessionName, payload: { cols, rows } }));
  });

  term.attachCustomKeyEventHandler(/** @param {KeyboardEvent} e */ (e) => {
    if (e.type !== "keydown") return true;
    if (e.ctrlKey && e.shiftKey) return handleCtrlShiftKey(e, sessionName);
    if (e.ctrlKey && !e.shiftKey) return handleCtrlOnlyKey(e, sessionName);
    return true;
  });

  const wrapperEl = document.createElement("div");
  wrapperEl.style.position = "absolute";
  wrapperEl.style.inset = "0";

  entry = { term, fitAddon, opened: false, wrapperEl };
  state.terminals.set(sessionName, entry);
  return entry;
}

/**
 * @param {string} groupName
 * @param {"claude" | "pwsh"} type
 */
function switchPaneType(groupName, type) {
  const pg = state.paneGroups.get(groupName);
  if (!pg) return;
  pg.activeType = type;
  renderActiveWorkspace();
  focusPane(groupName);
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

  const currentWs = findWorkspaceContaining(groupName);
  appendResumeSection(menu, groupName);
  appendMoveToSection(menu, groupName, currentWs);
  appendNewWorkspaceItem(menu, groupName, currentWs);
  attachCloseOnClickOutside(menu);
}

/** @param {any} menu @param {string} groupName */
function appendResumeSection(menu, groupName) {
  const pg = state.paneGroups.get(groupName);
  const claudeSession = pg?.claude ? state.sessions.get(pg.claude) : null;
  const aiCommands = state.aiPresets.map((p) => p.command);
  const { show, canResume, workingDir } = resolveResumeMenuState(claudeSession, aiCommands);
  if (!show) return;

  const onResume = canResume && workingDir
    ? () => {
        menu.classList.add("hidden");
        openFolder(workingDir, groupName, "claude", false, ["--resume"]);
      }
    : null;
  menu.appendChild(makeCtxItem("\u25b6 Resume Claude session", onResume, canResume ? "" : "ctx-disabled"));
  menu.appendChild(makeCtxSeparator());
}

/** @param {any} menu @param {string} groupName @param {any} currentWs */
function appendMoveToSection(menu, groupName, currentWs) {
  menu.appendChild(makeCtxHeader("Move to"));
  for (const ws of state.workspaces) {
    if (ws === currentWs) continue;
    menu.appendChild(makeCtxItem(ws.name, () => {
      movePaneToWorkspace(groupName, currentWs, ws);
      menu.classList.add("hidden");
    }));
  }
}

/** @param {any} menu @param {string} groupName @param {any} currentWs */
function appendNewWorkspaceItem(menu, groupName, currentWs) {
  menu.appendChild(makeCtxSeparator());
  menu.appendChild(makeCtxItem("+ New workspace", () => {
    const newWs = createWorkspace(groupName);
    movePaneToWorkspace(groupName, currentWs, newWs);
    switchToWorkspace(newWs.id);
    menu.classList.add("hidden");
  }));
}

/** @param {any} menu */
function attachCloseOnClickOutside(menu) {
  /** @param {MouseEvent} ev */
  const close = (ev) => {
    const t = ev.target instanceof Node ? ev.target : null;
    if (!menu.contains(t)) {
      menu.classList.add("hidden");
      document.removeEventListener("mousedown", close);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}

/**
 * @param {string} groupName
 * @param {import('./lib/state.js').Workspace | null} fromWs
 * @param {import('./lib/state.js').Workspace} toWs
 */
function movePaneToWorkspace(groupName, fromWs, toWs) {
  if (fromWs) {
    fromWs.layout = removeSessionFromLayout(fromWs.layout, groupName);
    updateWorkspaceTabName(fromWs);
  }
  const existing = toWs.layout ? getLeafList(toWs.layout) : [];
  existing.push(groupName);
  toWs.layout = buildBalancedTree(existing);
  updateWorkspaceTabName(toWs);
  saveWorkspaces();
  renderTabs();
  renderActiveWorkspace();
}

/**
 * @param {string} sessionName
 */
function updatePaneStatus(sessionName) {
  const info = state.sessions.get(sessionName);
  if (!info) return;
  // Pane data-session is the group name
  const groupName = info.group || sessionName;
  const pg = state.paneGroups.get(groupName);
  const activeSessionName = pg ? (pg.activeType === "pwsh" ? pg.pwsh : pg.claude) : sessionName;
  // Only update status bar if this is the currently active session in the pane
  if (activeSessionName !== sessionName) return;
  document.querySelectorAll(`.pane[data-session="${groupName}"]`).forEach((pane) => {
    const dot = pane.querySelector(".status-dot");
    const label = pane.querySelector(".pane-status-label");
    const unread = pane.querySelector(".pane-unread");
    // pendingPermission overrides the status dot — it's the highest-priority
    // signal since the user needs to act before Claude proceeds. Otherwise
    // funnel through normaliseStatusDot so updates honor the same whitelist
    // (starting | busy | idle | dead) used at initial render.
    const dotClass = info.pendingPermission ? "permission" : normaliseStatusDot(info.status);
    const labelText = info.pendingPermission ? "permission" : dotClass;
    if (dot) dot.className = `status-dot ${dotClass}`;
    if (label) label.textContent = labelText;
    if (unread) {
      const unreadN = Number(info.unreadCount) || 0;
      unread.textContent = String(unreadN);
      unread.classList.toggle("show", unreadN > 0);
    }
    pane.classList.toggle("dead", info.status === "dead");
    pane.classList.toggle("pending-permission", !!info.pendingPermission);
  });
}

/**
 * @param {string} groupName
 */
function focusPane(groupName) {
  state.focusedPane = groupName;
  document.querySelectorAll(".pane").forEach((p) => {
    if (!(p instanceof HTMLElement)) return;
    p.classList.toggle("focused", p.dataset["session"] === groupName);
  });
  // Update sessions panel highlight
  document.querySelectorAll(".session-row").forEach((r) => r.classList.remove("active"));
  document.querySelector(`.session-row[data-group="${groupName}"]`)?.classList.add("active");
  // Focus the active session's terminal (use rAF to run after any pending DOM updates)
  const pg = state.paneGroups.get(groupName);
  const activeSessionName = pg ? (pg.activeType === "pwsh" ? pg.pwsh : pg.claude) : groupName;
  const entry = state.terminals.get(activeSessionName || groupName);
  if (entry) {
    entry.term.focus();
    // Double-tap: rAF ensures focus sticks after any queued DOM mutations
    requestAnimationFrame(() => entry.term.focus());
  }
}

// ===== Navigation =====

/**
 * @param {string} arrowKey
 */
function navigatePanes(arrowKey) {
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (!ws?.layout) return;
  const leaves = getLeafList(ws.layout);
  if (!leaves.length) return;
  if (!state.focusedPane) return;
  const idx = leaves.indexOf(state.focusedPane);
  const newIdx = (arrowKey === "ArrowRight" || arrowKey === "ArrowDown")
    ? (idx + 1) % leaves.length
    : (idx - 1 + leaves.length) % leaves.length;
  focusPane(leaves[newIdx]);
}

/**
 * @param {string} arrowKey
 */
function resizeFocused(arrowKey) {
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (!ws?.layout || ws.layout.type !== "split") return;
  if (!state.focusedPane) return;
  const splitNode = findParentSplit(ws.layout, state.focusedPane);
  if (!splitNode) return;
  const delta = 0.05;
  splitNode.ratio = (arrowKey === "ArrowRight" || arrowKey === "ArrowDown")
    ? Math.min(0.85, splitNode.ratio + delta)
    : Math.max(0.15, splitNode.ratio - delta);
  renderActiveWorkspace();
}

function closeFocusedPane() {
  if (!state.focusedPane) return;
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (!ws) return;
  ws.layout = removeSessionFromLayout(ws.layout, state.focusedPane);
  state.focusedPane = null;
  const leaves = ws.layout ? getLeafList(ws.layout) : [];
  if (leaves.length > 0) state.focusedPane = leaves[0];
  renderActiveWorkspace();
}

/**
 * @param {string} sessionName
 */
async function killSession(sessionName) {
  try {
    await fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: "DELETE" });
  } catch {}

  // Determine group — only remove tiling leaf if no sibling alive
  const groupName = sessionName.replace(/~pwsh$/, "");
  const siblingName = sessionName.endsWith("~pwsh") ? groupName : groupName + "~pwsh";
  const siblingAlive = state.sessions.has(siblingName) && state.sessions.get(siblingName)?.status !== "dead";

  if (!siblingAlive) {
    // No sibling — remove pane from all workspaces
    for (const ws of state.workspaces) {
      ws.layout = removeSessionFromLayout(ws.layout, groupName);
    }
  } else {
    // Sibling exists — switch to it
    const pg = state.paneGroups.get(groupName);
    if (pg) pg.activeType = sessionName.endsWith("~pwsh") ? "claude" : "pwsh";
  }

  // Destroy terminal
  const entry = state.terminals.get(sessionName);
  if (entry) {
    entry.resizeObserver?.disconnect();
    entry.term.dispose();
    entry.wrapperEl?.remove();
    state.terminals.delete(sessionName);
  }

  state.sessions.delete(sessionName);
  state.sessionMeta.delete(sessionName);
  saveSessionMeta();
  rebuildPaneGroups();
  if (state.focusedPane === groupName && !siblingAlive) state.focusedPane = null;

  refreshTreeRunningState();
  renderActiveWorkspace();
  renderTabs();
}

/**
 * @param {string} sessionName
 * @param {string} workingDir
 */
function showDirtyWarning(sessionName, workingDir) {
  const folderName = workingDir.split(/[/\\]/).filter(Boolean).pop() || workingDir;
  console.warn(`[dirty] ${sessionName} exited with uncommitted changes in ${folderName}`);
  const toast = document.createElement("div");
  toast.className = "dirty-toast";
  toast.innerHTML = `<strong>⚠ ${escapeHtml(folderName)}</strong> has uncommitted changes (session ${escapeHtml(sessionName)} exited)`;
  toast.onclick = () => toast.remove();
  document.body.appendChild(toast);
  // Auto-dismiss after 30s
  setTimeout(() => toast.remove(), 30000);
}

/**
 * Remove a no-longer-existent pane group from all workspaces by
 * rebuilding any workspace that contained it as a balanced tree of
 * the remaining leaves.
 *
 * @param {string} groupName
 */
function removeGroupFromAllWorkspaces(groupName) {
  for (const ws of state.workspaces) {
    if (ws.layout && treeContains(ws.layout, groupName)) {
      const leaves = getLeafList(ws.layout).filter((n) => n !== groupName);
      ws.layout = buildBalancedTree(leaves);
      updateWorkspaceTabName(ws);
    }
  }
}

/**
 * Tear down the terminal entry for a session (xterm dispose,
 * resize-observer disconnect, wrapper element removal).
 *
 * @param {string} sessionName
 */
function disposeTerminalEntry(sessionName) {
  const entry = state.terminals.get(sessionName);
  if (!entry) return;
  entry.resizeObserver?.disconnect();
  entry.term.dispose();
  entry.wrapperEl?.remove();
  state.terminals.delete(sessionName);
}

/**
 * After a pane is removed and no sibling remains, pick a new focused
 * pane from the active workspace (or null if it's now empty).
 *
 * @param {string} groupName - the just-removed group
 * @param {boolean} siblingAlive
 */
function refocusAfterPaneRemoval(groupName, siblingAlive) {
  if (state.focusedPane !== groupName || siblingAlive) return;
  state.focusedPane = null;
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  const leaves = ws?.layout ? getLeafList(ws.layout) : [];
  if (leaves.length > 0) state.focusedPane = leaves[0];
}

/**
 * @param {string} sessionName
 */
function autoRemoveDeadSession(sessionName) {
  // Check it's still dead (not restarted)
  const s = state.sessions.get(sessionName);
  if (!s || s.status !== "dead") return;

  // Delete from server so the name can be reused
  fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: "DELETE" }).catch(() => {});

  const groupName = sessionName.replace(/~pwsh$/, "");
  const siblingName = sessionName.endsWith("~pwsh") ? groupName : groupName + "~pwsh";
  const siblingAlive = state.sessions.has(siblingName) && state.sessions.get(siblingName)?.status !== "dead";

  if (!siblingAlive) {
    removeGroupFromAllWorkspaces(groupName);
  } else {
    const pg = state.paneGroups.get(groupName);
    if (pg) pg.activeType = sessionName.endsWith("~pwsh") ? "claude" : "pwsh";
  }

  disposeTerminalEntry(sessionName);

  state.sessions.delete(sessionName);
  state.sessionMeta.delete(sessionName);
  saveSessionMeta();
  rebuildPaneGroups();

  refocusAfterPaneRemoval(groupName, siblingAlive);

  refreshTreeRunningState();
  if (state.isDashboard) renderDashboard();
  else renderActiveWorkspace();
  renderTabs();
}

// ===== Dashboard =====

function renderDashboard() {
  const area = byId("workspace-area");

  // Check if dashboard already exists — patch in-place instead of rebuilding
  let dash = /** @type {HTMLElement | null} */ (area.querySelector(".dashboard"));
  if (dash) {
    patchDashboard(dash);
    return;
  }

  // First render — build the structure once
  area.innerHTML = "";
  dash = document.createElement("div");
  dash.className = "dashboard active";
  area.appendChild(dash);

  if (state.sessions.size === 0) {
    dash.innerHTML = `
      <div class="dashboard-empty">
        // NO ACTIVE SESSIONS<br><br>
        Open a folder from the sidebar or press <kbd>Ctrl+P</kbd>
      </div>
    `;
    return;
  }

  // Header strip
  const header = document.createElement("div");
  header.className = "dash-header";
  header.innerHTML = buildHeaderHTML();
  dash.appendChild(header);

  // Collapsible cards section
  const cardsCollapsed = localStorage.getItem("pty-win-dash-cards-collapsed") === "true";
  const cardsSection = document.createElement("div");
  cardsSection.className = "dash-cards-section";

  const cardsHeader = document.createElement("div");
  cardsHeader.className = "dash-cards-header";
  cardsHeader.innerHTML = `<span class="dash-cards-arrow">${cardsCollapsed ? "\u25b8" : "\u25be"}</span> Workspaces <span class="dash-cards-count">(${state.sessions.size})</span>`;
  cardsHeader.onclick = () => {
    const grid = /** @type {HTMLElement | null} */ (cardsSection.querySelector(".dash-cards"));
    const arrow = /** @type {HTMLElement | null} */ (cardsHeader.querySelector(".dash-cards-arrow"));
    if (!grid || !arrow) return;
    const collapsed = grid.style.display === "none";
    grid.style.display = collapsed ? "" : "none";
    arrow.textContent = collapsed ? "\u25be" : "\u25b8";
    localStorage.setItem("pty-win-dash-cards-collapsed", collapsed ? "false" : "true");
  };
  cardsSection.appendChild(cardsHeader);

  const cardsGrid = document.createElement("div");
  cardsGrid.className = "dash-cards";
  if (cardsCollapsed) cardsGrid.style.display = "none";
  cardsSection.appendChild(cardsGrid);
  dash.appendChild(cardsSection);

  for (const [name, info] of state.sessions) {
    cardsGrid.appendChild(createDashboardCard(name, info));
  }
}

function buildHeaderHTML() {
  const totalCost = [...state.sessions.values()].reduce(/**
   * @param {number} s
   * @param {import('./lib/state.js').SessionInfo} i
   */
  (s, i) => s + (i.costUsd || 0), 0);
  const alive = [...state.sessions.values()].filter(i => i.status !== "dead").length;
  const busy = [...state.sessions.values()].filter(i => i.status === "busy").length;
  return `
    <span class="dash-title">Mission Control</span>
    <span class="dash-summary">
      <span class="val">${alive}</span> active &middot;
      <span class="val">${busy}</span> busy &middot;
      <span class="val">${state.sessions.size}</span> total
      ${totalCost > 0 ? `&middot; <span class="val">$${totalCost.toFixed(2)}</span>` : ""}
    </span>
  `;
}

/**
 * @param {string} name
 * @param {import('./lib/state.js').SessionInfo} info
 */
function createDashboardCard(name, info) {
  const card = document.createElement("div");
  card.className = `dashboard-card status-${info.status}`;
  card.dataset["session"] = name;
  card.style.contain = "content";
  const unread = info.unreadCount || 0;
  const identity = info.emcomIdentity ? `<span class="dashboard-card-identity">@${info.emcomIdentity}</span>` : "";
  const cost = `<span class="dashboard-card-cost">$${(info.costUsd || 0).toFixed(2)}</span>`;
  card.innerHTML = `
    <div class="dashboard-card-header">
      <span class="dashboard-card-name">${name}</span>
      <span class="dashboard-card-meta">
        ${identity}
        ${cost}
        <span class="dashboard-card-status ${info.status}">${info.status}</span>
        <span class="dashboard-card-badge ${unread > 0 ? "show" : ""}">${unread}</span>
      </span>
    </div>
    <div class="dashboard-card-preview">...</div>
  `;
  card.onclick = () => focusExistingSession(name);
  loadSnapshot(name);
  return card;
}

/**
 * @param {HTMLElement} dash
 */
function patchDashboard(dash) {
  if (state.sessions.size === 0) {
    dash.innerHTML = EMPTY_DASHBOARD_HTML;
    return;
  }

  // Remove empty placeholder if sessions appeared
  const empty = dash.querySelector(".dashboard-empty");
  if (empty) { dash.innerHTML = ""; renderDashboard(); return; }

  // Patch header
  const header = dash.querySelector(".dash-header");
  if (header) header.innerHTML = buildHeaderHTML();

  // Patch cards count
  const countEl = dash.querySelector(".dash-cards-count");
  if (countEl) countEl.textContent = `(${state.sessions.size})`;

  // Patch cards grid
  const cardsGrid = dash.querySelector(".dash-cards");
  if (!cardsGrid) return;

  removeStaleCards(cardsGrid, new Set(state.sessions.keys()));

  for (const [name, info] of state.sessions) {
    const card = cardsGrid.querySelector(`.dashboard-card[data-session="${CSS.escape(name)}"]`);
    if (!card) {
      cardsGrid.appendChild(createDashboardCard(name, info));
    } else {
      patchCardFields(/** @type {HTMLElement} */ (card), info);
    }
  }
}

/**
 * @param {string} sessionName
 */
async function loadSnapshot(sessionName) {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/snapshot?lines=8`);
    const data = await res.json();
    const card = document.querySelector(`.dashboard-card[data-session="${CSS.escape(sessionName)}"]`);
    const el = card?.querySelector(".dashboard-card-preview");
    if (el) el.textContent = data.lines.join("\n") || "(no output yet)";
  } catch {}
}

// ===== Dashboard Stats (inline) =====

function renderDashboardStats() {
  if (!state.isDashboard) return;
  // Use getElementById here (not byId) because the #dashboard-stats
  // container is not currently rendered — the guarded early-return
  // keeps the polling interval harmless. If the dashboard ever gains
  // a real stats container with this ID, this can switch to byId.
  const container = document.getElementById("dashboard-stats");
  if (!container) return;

  fetch("/api/stats").then((r) => r.json()).then(/** @param {any[]} stats */ (stats) => {
    if (!state.isDashboard) return;

    const statsMap = new Map(stats.map((s) => [s.name, s]));
    const sessions = [...state.sessions.entries()];
    const totalCostVal = computeDiagTotalCost(sessions);

    // Build table structure once, then patch rows
    let table = container.querySelector(".diag-table");
    if (!table) {
      container.innerHTML = `
        <div class="diag-section-title">Sessions</div>
        <table class="diag-table">
          <thead>
            <tr><th>Session</th><th>Status</th><th>Active</th><th>cb/s</th><th>KB/s</th><th>Cost</th></tr>
          </thead>
          <tbody></tbody>
        </table>`;
      table = container.querySelector(".diag-table");
    }

    const tbody = table?.querySelector("tbody");
    if (!tbody) return;
    const currentNames = new Set(sessions.map(([n]) => n));

    removeStaleDiagRows(tbody, currentNames);

    for (const [name, info] of sessions) {
      upsertDiagRow(tbody, name, info, statsMap.get(name), {
        onFocusSession: focusExistingSession,
        fmtAgo,
      });
    }

    upsertDiagTotalRow(tbody, totalCostVal);
  }).catch(() => {});
}


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
if (state.isDashboard) renderDashboard();
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

(function initRightPanelTabs() {
  const tabs = document.querySelectorAll("#right-panel-tabs .rp-tab");
  const feedContent = byId("feed-content");
  const trackerContent = byId("tracker-content");
  const agentsContent = byId("agents-content");

  tabs.forEach(tab => {
    if (!(tab instanceof HTMLElement)) return;
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const panel = tab.dataset["panel"];
      if (feedContent) feedContent.classList.toggle("active", panel === "feed");
      if (trackerContent) trackerContent.classList.toggle("active", panel === "tracker");
      if (agentsContent) agentsContent.classList.toggle("active", panel === "agents");
      if (panel === "tracker") {
        const existing = trackerContent.querySelector(".tracker-view");
        if (existing) existing.remove();
        trackerPanel.render();
      }
      if (panel === "agents") agentsPanel.render();
    };
  });

  // Start tracker polling (updates badge even when feed tab is active)
  trackerPanel.render();
  trackerPanel.startPolling();

  // Start agents panel polling
  agentsPanel.render();
  agentsPanel.startPolling();
})();

// ===== Settings modal (v0.1.33) =====
//
// Schema-driven preferences editor. Fetches /api/preferences/schema +
// /api/preferences on open, renders rows by type, writes via POST with
// updatedBy="pty-win-settings". Same prefs file as the right-click menu's
// pty-win-play writes — the two surfaces stay consistent.

initSettingsModal({ byId, buttonById, state });
