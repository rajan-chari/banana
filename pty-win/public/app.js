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
import {
  renderTrackerItemHtml,
  renderTrackerHistoryEntries,
  patchTrackerItem,
} from "./lib/tracker-render.js";
import { initFeedPanel } from "./lib/feed-panel.js";
import {
  normPath,
  cssId,
  truncatePath,
  fmtAgo,
  staleClass,
  escapeHtml,
} from "./lib/format.js";
import {
  filterTrackerItems as _filterTrackerItems,
  sortTrackerItems as _sortTrackerItems,
  extractFilterOptions,
} from "./lib/tracker-filters.js";
import {
  buildSessionGroups,
  computeGroupStatus,
  computeGroupUnread,
  getActiveSessionName,
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
} from "./lib/folder-tree.js";

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
    switch (msg.type) {
      case "data": {
        const entry = state.terminals.get(msg.session);
        if (entry) entry.term.write(msg.payload);
        break;
      }
      case "sessions": {
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

        // Rebuild pane groups
        rebuildPaneGroups();

        // Collect orphaned workspace leaves (in layout but not on server)
        const serverGroups = new Set([...state.sessions.values()].map((s) => s.group || s.name));
        const orphans = findOrphanedLeaves(state.workspaces, serverGroups, getLeafList);

        // Classify orphan group names: which have saved metadata (recreatable)
        // vs which are truly unknown (must be pruned from layouts).
        const { recreatable, unrecoverable } = classifyOrphanGroups(orphans, state.sessionMeta);

        // Prune leaves with no metadata — rebuilds affected workspaces as
        // balanced trees (split ratios discarded; see ws-handlers JSDoc).
        if (unrecoverable.length > 0) {
          const updates = rebalanceLayoutsWithoutLeaves(state.workspaces, unrecoverable, getLeafList, buildBalancedTree);
          for (const { workspace, newLayout } of updates) {
            workspace.layout = newLayout;
            updateWorkspaceTabName(workspace);
          }
        }

        // Recreate sessions that have metadata (async, server will re-broadcast)
        if (recreatable.length > 0) {
          recreateOrphanedSessions(recreatable);
        }


        refreshTreeRunningState();
        renderSessionsPanel();
        renderQuickAccess();
        if (state.isDashboard) renderDashboard();
        else if (layoutChanged) {
          // Full re-render only when sessions added/removed — avoids scroll/focus disruption
          renderActiveWorkspace();
          // Refit all terminals after layout rebuild — critical for Ctrl+F5
          requestAnimationFrame(() => {
            for (const [n, e] of state.terminals) {
              try {
                e.fitAddon.fit();
                const { cols, rows } = e.term;
                state.ws?.send(JSON.stringify({ type: "resize", session: n, payload: { cols, rows } }));
              } catch {}
            }
          });
        } else {
          // Status-only update — just refresh pane status indicators
          for (const s of msg.payload) updatePaneStatus(s.name);
        }
        break;
      }
      case "status": {
        const s = state.sessions.get(msg.session);
        if (s) {
          s.status = msg.payload.status;
          s.unreadCount = msg.payload.unreadCount;
          s.pendingPermission = !!msg.payload.pendingPermission;
          rebuildPaneGroups();
          updatePaneStatus(msg.session);
          refreshTreeRunningState();
          renderSessionsPanel();
          renderQuickAccess();

          if (state.isDashboard) renderDashboard();

          // Auto-remove dead sessions after a brief flash
          if (msg.payload.status === "dead") {
            // Layer 4: warn if workspace has uncommitted changes
            if (msg.payload.dirtyOnExit) {
              showDirtyWarning(msg.session, msg.payload.workingDir);
            }
            setTimeout(() => autoRemoveDeadSession(msg.session), 1500);
          }
        }
        break;
      }
      case "config": {
        if (msg.name != null) applyInstanceName(msg.name);
        break;
      }
      case "notification": {
        const s = state.sessions.get(msg.session);
        if (s) {
          // Don't increment unreadCount here — status-change carries the authoritative count.
          // Just trigger UI refresh to show the notification.
          updatePaneStatus(msg.session);
          renderSessionsPanel();
          renderQuickAccess();

          if (state.isDashboard) renderDashboard();
        }
        break;
      }
    }

    // Restore terminal focus after DOM rebuilds (prevents WS updates from stealing focus)
    // Check if focus was in a pane OR was lost to <body> (due to DOM rebuild destroying the focused element)
    if (state.focusedPane && !state.isDashboard) {
      const pg = state.paneGroups.get(state.focusedPane);
      const sessionName = pg ? (pg.activeType === "pwsh" ? pg.pwsh : pg.claude) : state.focusedPane;
      const entry = state.terminals.get(sessionName || state.focusedPane);
      const focusInPane = document.activeElement?.closest(".pane");
      const focusLostToBody = document.activeElement === document.body;
      if (entry && (focusInPane || focusLostToBody)) {
        entry.term.focus();
      }
    }
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
  if (folderCountEl) folderCountEl.textContent = state.favorites.length > 0 ? `(${state.favorites.length})` : "";

  for (const rootPath of state.favorites) {
    const rootName = rootPath.split(/[/\\]/).filter(Boolean).pop() || rootPath;
    const rootEl = document.createElement("div");
    rootEl.className = "tree-root";

    const label = document.createElement("div");
    label.className = "tree-root-label";
    label.dataset["path"] = normPath(rootPath);
    const expanded = state.expandedPaths.has(rootPath);

    // Arrow
    const arrow = document.createElement("span");
    arrow.className = `arrow ${expanded ? "expanded" : ""}`;
    label.appendChild(arrow);

    // Root name
    const nameSpan = document.createElement("span");
    nameSpan.className = "root-name";
    nameSpan.textContent = rootName;
    label.appendChild(nameSpan);

    // Green name for running sessions
    if (isFolderRunning(state.sessions, rootPath, normPath)) {
      nameSpan.classList.add("running");
    }

    // Shared right-side section (uses cached folder info, fetches async if needed)
    const rootResolved = resolveFolderSessions(state.sessions, rootName, rootPath, normPath);
    const rootSessionInfo = rootResolved.sessionInfo;
    const rootMatchesPath = rootResolved.sessionMatchesPath;
    const rootPwshInfo = rootResolved.pwshInfo;
    const rootPwshMatches = rootResolved.pwshMatchesPath;
    const rootCacheKey = normPath(rootPath);
    const rootCached = state.folderInfoCache.get(rootCacheKey);
    appendRowActions(label, {
      identityName: rootCached?.identityName || (rootMatchesPath ? rootSessionInfo?.emcomIdentity : null) || null,
      unreadCount: rootMatchesPath ? (rootSessionInfo?.unreadCount || 0) : 0,
      workingDir: rootPath,
      folderName: rootName,
      claudeAlive: !!(rootMatchesPath && rootSessionInfo?.status !== "dead"),
      pwshAlive: !!(rootPwshMatches && rootPwshInfo?.status !== "dead"),
      claudeCommand: rootMatchesPath ? rootSessionInfo?.command : null,
      isClaudeReady: rootCached?.isClaudeReady || false,
      hasIdentity: rootCached?.hasIdentity || false,
    });
    if (!rootCached) {
      fetch(`/api/folder-info?path=${encodeURIComponent(rootPath)}`)
        .then((r) => r.json())
        .then(/** @param {import('./lib/state.js').FolderInfo} info */ (info) => {
          state.folderInfoCache.set(rootCacheKey, info);
          // Update indicators in-place once folder info arrives
          const slot = label.querySelector(".indicator-slot");
          if (slot) {
            const indC = /** @type {HTMLElement | null} */ (slot.querySelector(".indicator.claude-ready"));
            const indI = /** @type {HTMLElement | null} */ (slot.querySelector(".indicator.identity"));
            if (indC) { indC.classList.toggle("hidden-placeholder", !info.isClaudeReady); if (info.isClaudeReady) indC.title = "Has CLAUDE.md"; }
            if (indI) { indI.classList.toggle("hidden-placeholder", !info.hasIdentity); if (info.hasIdentity) indI.title = `Identity: ${info.identityName || "yes"}`; }
          }
          // Update identity tag
          const idTag = label.querySelector(".identity-tag");
          if (idTag && info.identityName) {
            idTag.textContent = info.identityName;
            idTag.classList.remove("hidden-placeholder");
          }
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

    // The clickable row
    const row = document.createElement("div");
    row.className = "tree-node";
    row.dataset["path"] = normPath(entry.path);
    if (isFolderRunning(state.sessions, entry.path, normPath)) {
      row.classList.add("running");
    }

    // Indent
    const indent = document.createElement("span");
    indent.className = "indent";
    indent.style.width = `${depth * 8}px`;
    row.appendChild(indent);

    // Arrow
    const arrow = document.createElement("span");
    const isExpanded = state.expandedPaths.has(entry.path);
    arrow.className = `arrow ${isExpanded ? "expanded" : ""}`;
    row.appendChild(arrow);

    // Folder name
    const name = document.createElement("span");
    name.className = "folder-name";
    name.textContent = entry.name;
    row.appendChild(name);

    // Shared right-side section (matches sessions panel layout)
    const childResolved = resolveFolderSessions(state.sessions, entry.name, entry.path, normPath);
    const sessionInfo = childResolved.sessionInfo;
    const sessionMatchesPath = childResolved.sessionMatchesPath;
    const pwshInfo = childResolved.pwshInfo;
    const pwshMatchesPath = childResolved.pwshMatchesPath;
    appendRowActions(row, {
      identityName: entry.hasIdentity ? (entry.identityName || null) : null,
      unreadCount: sessionMatchesPath ? (sessionInfo?.unreadCount || 0) : 0,
      workingDir: entry.path,
      folderName: entry.name,
      claudeAlive: !!(sessionMatchesPath && sessionInfo && sessionInfo.status !== "dead"),
      pwshAlive: !!(pwshMatchesPath && pwshInfo && pwshInfo.status !== "dead"),
      claudeCommand: sessionMatchesPath ? sessionInfo?.command : null,
      isClaudeReady: entry.isClaudeReady,
      hasIdentity: entry.hasIdentity,
    });

    // Row click = expand/collapse
    row.onclick = () => toggleExpand(entry.path);
    row.addEventListener("contextmenu", (e) => showContextMenu(e, entry.path));
    // Drag to workspace tab
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      if (!e.dataTransfer) return;
      e.dataTransfer.setData("pty-win/folder", JSON.stringify({ workingDir: entry.path, folderName: entry.name }));
      e.dataTransfer.effectAllowed = "copy";
    });

    node.appendChild(row);

    // Children container
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
  const panel = byId("quick-access-panel");
  if (!panel) return;
  panel.innerHTML = "";

  if (state.pinnedFolders.length === 0) return;

  for (const folderPath of state.pinnedFolders) {
    const name = folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;
    const np = normPath(folderPath);

    const row = document.createElement("div");
    row.className = "quick-access-row";

    // Status dot (mirrors Sessions panel)
    const claudeStatusSession = [...state.sessions.values()].find(
      (s) => normPath(s.workingDir) === np && s.status !== "dead" && s.command !== "pwsh"
    );
    const pwshStatusSession = [...state.sessions.values()].find(
      (s) => normPath(s.workingDir) === np && s.status !== "dead" && s.command === "pwsh"
    );
    const qaStatus = claudeStatusSession?.status === "busy" || pwshStatusSession?.status === "busy"
      ? "busy" : claudeStatusSession?.status === "starting" || pwshStatusSession?.status === "starting"
      ? "starting" : claudeStatusSession || pwshStatusSession ? "idle" : "dead";
    const qaPerm = claudeStatusSession?.pendingPermission || pwshStatusSession?.pendingPermission;
    const dot = document.createElement("span");
    dot.className = `status-dot ${qaPerm ? "permission" : qaStatus}`;
    row.appendChild(dot);

    // Name — click to focus/open
    const label = document.createElement("span");
    label.className = "quick-access-name";
    label.textContent = name;
    label.onclick = () => {
      const existing = [...state.sessions.values()].find(
        (s) => normPath(s.workingDir) === np && s.status !== "dead"
      );
      if (existing) focusExistingSession(existing.name);
      else openFolder(folderPath, name);
    };
    row.appendChild(label);

    // Action pills — same as sessions/folders panels
    const claudeSession = [...state.sessions.values()].find(
      (s) => normPath(s.workingDir) === np && s.status !== "dead" && s.command !== "pwsh"
    );
    const pwshSession = [...state.sessions.values()].find(
      (s) => normPath(s.workingDir) === np && s.status !== "dead" && s.command === "pwsh"
    );
    const cached = state.folderInfoCache.get(np);

    appendRowActions(row, {
      identityName: claudeSession?.emcomIdentity || cached?.identityName || null,
      unreadCount: claudeSession?.unreadCount || 0,
      workingDir: folderPath,
      folderName: name,
      claudeAlive: !!claudeSession,
      pwshAlive: !!pwshSession,
      claudeCommand: claudeSession?.command || null,
      isClaudeReady: cached?.isClaudeReady || false,
      hasIdentity: cached?.hasIdentity || false,
      onKill: (claudeSession || pwshSession) ? () => {
        if (claudeSession) killSession(claudeSession.name);
        if (pwshSession) killSession(pwshSession.name);
      } : null,
    });

    // Fetch folder info if not cached
    if (!cached) {
      fetch(`/api/folder-info?path=${encodeURIComponent(folderPath)}`)
        .then((r) => r.json())
        .then((info) => {
          state.folderInfoCache.set(np, info);
          const slot = row.querySelector(".indicator-slot");
          if (slot) {
            const indC = /** @type {HTMLElement | null} */ (slot.querySelector(".indicator.claude-ready"));
            const indI = /** @type {HTMLElement | null} */ (slot.querySelector(".indicator.identity"));
            if (indC) { indC.classList.toggle("hidden-placeholder", !info.isClaudeReady); if (info.isClaudeReady) indC.title = "Has CLAUDE.md"; }
            if (indI) { indI.classList.toggle("hidden-placeholder", !info.hasIdentity); if (info.hasIdentity) indI.title = `Identity: ${info.identityName || "yes"}`; }
          }
        })
        .catch(() => {});
    }

    // Right-click → context menu
    row.addEventListener("contextmenu", (e) => showContextMenu(e, folderPath));
    // Drag to workspace tab
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      if (!e.dataTransfer) return;
      e.dataTransfer.setData("pty-win/folder", JSON.stringify({ workingDir: folderPath, folderName: name }));
      e.dataTransfer.effectAllowed = "copy";
    });

    panel.appendChild(row);
  }
}

// ===== Sessions Panel =====

function renderSessionsPanel() {
  const list = byId("sessions-list");
  const countEl = document.querySelector(".session-count");
  if (!list) return;

  // Build list of active groups
  const groups = buildSessionGroups(state.paneGroups, state.sessions);

  if (countEl) countEl.textContent = groups.length > 0 ? `(${groups.length})` : "";

  list.innerHTML = "";
  if (groups.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sessions-empty";
    empty.textContent = "No sessions";
    list.appendChild(empty);
    return;
  }

  for (const g of groups) {
    const row = document.createElement("div");
    row.className = `session-row ${g.group === state.focusedPane ? "active" : ""}`;
    row.dataset["group"] = g.group;

    // Status dot — worst-of status across group; pendingPermission overrides
    const dotClass = computeGroupStatus(g.claudeInfo, g.pwshInfo, g.claudeAlive, g.pwshAlive);
    const dot = document.createElement("span");
    dot.className = `status-dot ${dotClass}`;
    row.appendChild(dot);

    // Name
    const name = document.createElement("span");
    name.className = "session-name";
    name.textContent = g.group;
    row.appendChild(name);

    // Shared right-side section
    const totalUnread = computeGroupUnread(g.claudeInfo, g.pwshInfo, g.claudeAlive, g.pwshAlive);
    const cacheKey = normPath(g.workingDir);
    const cached = state.folderInfoCache.get(cacheKey);
    appendRowActions(row, {
      identityName: (g.claudeInfo || g.pwshInfo)?.emcomIdentity || null,
      unreadCount: totalUnread,
      workingDir: g.workingDir,
      folderName: g.group,
      claudeAlive: g.claudeAlive,
      pwshAlive: g.pwshAlive,
      claudeCommand: g.claudeAlive ? g.claudeInfo?.command : null,
      isClaudeReady: cached?.isClaudeReady || false,
      hasIdentity: cached?.hasIdentity || false,
      onKill: () => {
        if (g.claudeAlive && g.pg.claude) killSession(g.pg.claude);
        if (g.pwshAlive && g.pg.pwsh) killSession(g.pg.pwsh);
      },
    });
    // Fetch folder info if not cached (for indicator dots)
    if (!cached && g.workingDir) {
      fetch(`/api/folder-info?path=${encodeURIComponent(g.workingDir)}`)
        .then((r) => r.json())
        .then((info) => {
          state.folderInfoCache.set(cacheKey, info);
          // Update indicators in-place once folder info arrives
          const slot = row.querySelector(".indicator-slot");
          if (slot) {
            const indC = /** @type {HTMLElement | null} */ (slot.querySelector(".indicator.claude-ready"));
            const indI = /** @type {HTMLElement | null} */ (slot.querySelector(".indicator.identity"));
            if (indC) { indC.classList.toggle("hidden-placeholder", !info.isClaudeReady); if (info.isClaudeReady) indC.title = "Has CLAUDE.md"; }
            if (indI) { indI.classList.toggle("hidden-placeholder", !info.hasIdentity); if (info.hasIdentity) indI.title = `Identity: ${info.identityName || "yes"}`; }
          }
        })
        .catch(() => {});
    }

    // Click row → focus active session
    const activeName = getActiveSessionName(g.pg, g.claudeAlive, g.pwshAlive);
    if (activeName) row.onclick = () => focusExistingSession(activeName);
    row.addEventListener("contextmenu", (e) => { if (g.workingDir) showContextMenu(e, g.workingDir); });
    // Drag to workspace tab
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
 * @param {HTMLElement} container
 * @param {any} opts
 */
function appendRowActions(container, opts) {
  const { identityName, unreadCount, workingDir, folderName,
    claudeAlive, pwshAlive, claudeCommand, isClaudeReady, hasIdentity, onKill } = opts;

  // Identity tag (always rendered for column alignment)
  const idTag = document.createElement("span");
  idTag.className = `identity-tag ${identityName ? "" : "hidden-placeholder"}`;
  idTag.textContent = identityName ? identityName : "@";
  container.appendChild(idTag);

  // Unread badge (always rendered)
  const badge = document.createElement("span");
  badge.className = `unread-badge ${unreadCount > 0 ? "" : "hidden-placeholder"}`;
  badge.textContent = unreadCount > 0 ? `(${unreadCount})` : "(0)";
  container.appendChild(badge);

  // AI tag
  const aiPreset = claudeAlive && claudeCommand ? getAiPresetForCommand(claudeCommand) : state.aiPresets[state.aiDefaultIndex];
  const cTag = document.createElement("span");
  cTag.className = `cmd-tag ${claudeAlive ? "alive" : "absent"}`;
  cTag.textContent = aiPreset.icon;
  if (claudeAlive) {
    cTag.title = `${aiPreset.name}: running — click to send message`;
    cTag.onclick = (e) => { e.stopPropagation(); showQuickMessageInput(folderName, cTag); };
  } else {
    cTag.title = `Start ${aiPreset.name} (right-click for options)`;
    cTag.onclick = (e) => { e.stopPropagation(); openFolder(workingDir, folderName, getDefaultAiCommand()); };
    cTag.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); showAiTagContextMenu(e, workingDir, folderName); };
  }
  container.appendChild(cTag);

  // PowerShell tag
  const pTag = document.createElement("span");
  pTag.className = `cmd-tag pwsh ${pwshAlive ? "alive" : "absent"}`;
  pTag.textContent = ">_";
  pTag.title = pwshAlive ? "PowerShell: running" : "Start PowerShell";
  if (!pwshAlive) {
    pTag.onclick = (e) => { e.stopPropagation(); openFolder(workingDir, folderName, "pwsh"); };
  }
  container.appendChild(pTag);

  // VS Code tag
  const codeTag = document.createElement("span");
  codeTag.className = "cmd-tag code";
  codeTag.textContent = "\u003c/\u003e";
  codeTag.title = "Open in VS Code (click to launch)";
  codeTag.onclick = (e) => {
    e.stopPropagation();
    // Exit Fullscreen API mode (server handles F11/minimize via Win32)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    fetch("/api/open-editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: workingDir }),
    });
  };
  container.appendChild(codeTag);

  // Indicator slot (always render both dots)
  const indicatorSlot = document.createElement("span");
  indicatorSlot.className = "indicator-slot";
  container.appendChild(indicatorSlot);

  const indClaude = document.createElement("span");
  indClaude.className = `indicator claude-ready ${isClaudeReady ? "" : "hidden-placeholder"}`;
  indClaude.textContent = "\u25c6";
  if (isClaudeReady) indClaude.title = "Has CLAUDE.md";
  indicatorSlot.appendChild(indClaude);

  const indIdentity = document.createElement("span");
  indIdentity.className = `indicator identity ${hasIdentity ? "" : "hidden-placeholder"}`;
  indIdentity.textContent = "\u25cf";
  if (hasIdentity) indIdentity.title = `Identity: ${identityName || "yes"}`;
  indicatorSlot.appendChild(indIdentity);

  // Kill button — always render as spacer to keep column alignment
  const killBtn = document.createElement("button");
  killBtn.className = "kill-btn";
  killBtn.textContent = "\u00d7";
  if (onKill) {
    killBtn.title = "Kill session";
    killBtn.onclick = (e) => { e.stopPropagation(); onKill(); };
  } else {
    killBtn.style.pointerEvents = "none";
  }
  container.appendChild(killBtn);
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
  const baseName = folderName || folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;
  const isPwsh = command === "pwsh";
  const sessionName = isPwsh ? baseName + "~pwsh" : baseName;

  // If this exact session exists and alive, just focus it
  const existing = state.sessions.get(sessionName);
  if (existing && existing.status !== "dead") {
    // Switch the pane group to show this type
    const pg = state.paneGroups.get(baseName);
    if (pg) pg.activeType = isPwsh ? "pwsh" : "claude";
    focusExistingSession(baseName);
    renderActiveWorkspace();
    return;
  }

  // If dead session with same name exists, clean it up first
  if (existing && existing.status === "dead") {
    await fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: "DELETE" }).catch(() => {});
    state.sessions.delete(sessionName);
    const entry = state.terminals.get(sessionName);
    if (entry) {
      entry.resizeObserver?.disconnect();
      entry.term.dispose();
      entry.wrapperEl?.remove();
      state.terminals.delete(sessionName);
    }
  }

  // Create session
  try {
    // Estimate initial terminal size from the workspace area
    const mainEl = byId("main");
    const charW = 7.6, charH = 18; // approximate character dimensions for Consolas 13px
    const availW = (mainEl?.clientWidth || 800) - 4; // minus pane borders
    const availH = (mainEl?.clientHeight || 600) - 35 - 26 - 22 - 4; // minus tabbar, topbar, statusbar, borders
    const cols = Math.max(80, Math.floor(availW / charW));
    const rows = Math.max(24, Math.floor(availH / charH));

    /** @type {{workingDir: string, cols: number, rows: number, command?: string, args?: string[]}} */
    const body = { workingDir: folderPath, cols, rows };
    if (command) body.command = command;
    else body.command = getDefaultAiCommand();
    if (args.length) body.args = args;

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

    // Check if a sibling session already has a pane in a workspace
    const siblingWs = findWorkspaceContaining(baseName);
    if (siblingWs && isPwsh) {
      // Sibling claude session already has a pane — just switch toggle to pwsh
      const pg = state.paneGroups.get(baseName) || { activeType: "pwsh" };
      pg.pwsh = sessionName;
      pg.activeType = "pwsh";
      state.paneGroups.set(baseName, pg);
      switchToWorkspace(siblingWs.id);
      renderActiveWorkspace();
      focusPane(baseName);
      return;
    }
    if (siblingWs && !isPwsh) {
      // Sibling pwsh session already has a pane — switch toggle to claude
      const pg = state.paneGroups.get(baseName) || { activeType: "claude" };
      pg.claude = sessionName;
      pg.activeType = "claude";
      state.paneGroups.set(baseName, pg);
      switchToWorkspace(siblingWs.id);
      renderActiveWorkspace();
      focusPane(baseName);
      return;
    }

    // No existing pane — tile into workspace using the group name (baseName)
    const ws = newWorkspace ? createWorkspace(baseName) : getOrCreateActiveWorkspace();
    addSessionToWorkspace(ws.id, baseName);
    switchToWorkspace(ws.id);
    renderActiveWorkspace();
    focusPane(baseName);
    updateWorkspaceTabName(ws);
  } catch {
    alert("Failed to create session");
  }
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

byId("context-menu").addEventListener("click", /** @param {MouseEvent} e */ async (e) => {
  const item = e.target instanceof Element ? /** @type {HTMLElement | null} */ (e.target.closest(".ctx-item")) : null;
  const action = item?.dataset["action"];
  if (!action || !state.ctxTarget || item?.classList.contains("ctx-disabled")) return;

  const path = state.ctxTarget;
  const name = path.split(/[/\\]/).filter(Boolean).pop() || path;

  switch (action) {
    case "open":
      openFolder(path, name);
      break;
    case "open-new-ws": {
      openFolder(path, name, undefined, true);
      break;
    }
    case "open-cmd": {
      const cmd = prompt("Command to run:", "cmd.exe");
      if (cmd) openFolder(path, name, cmd);
      break;
    }
    case "force-idle": {
      const fnp = normPath(path);
      const aiCmds = new Set(state.aiPresets.map((p) => p.command));
      for (const [sName, s] of state.sessions) {
        if (aiCmds.has(s.command) && s.status === "busy" && normPath(s.workingDir) === fnp) {
          fetch(`/api/sessions/${encodeURIComponent(sName)}/force-idle`, { method: "POST" });
        }
      }
      break;
    }
    case "new-folder": {
      const folderName = prompt("New folder name:");
      if (!folderName?.trim()) break;
      const trimmed = folderName.trim();
      if (/[/\\:*?"<>|]/.test(trimmed)) { alert("Invalid folder name. Avoid: / \\ : * ? \" < > |"); break; }
      try {
        const res = await fetch("/api/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentPath: path, name: trimmed }),
        });
        if (!res.ok) { const err = await res.json(); alert(err.error || "Failed to create folder"); break; }
        state.folderCache.delete(path);
        state.expandedPaths.add(path);
        renderTree();
      } catch (err) { alert("Failed to create folder: " + (err instanceof Error ? err.message : String(err))); }
      break;
    }
    case "fav-add":
      if (!state.favorites.includes(path)) {
        state.favorites.push(path);
        saveFavorites();
        renderTree();
      }
      break;
    case "fav-remove": {
      const idx = state.favorites.indexOf(path);
      if (idx !== -1) {
        state.favorites.splice(idx, 1);
        saveFavorites();
        renderTree();
      }
      break;
    }
    case "pin-add":
      if (!state.pinnedFolders.includes(path)) {
        state.pinnedFolders.push(path);
        savePinnedFolders();
        renderQuickAccess();
      }
      break;
    case "pin-remove": {
      const pidx = state.pinnedFolders.indexOf(path);
      if (pidx !== -1) {
        state.pinnedFolders.splice(pidx, 1);
        savePinnedFolders();
        renderQuickAccess();
      }
      break;
    }
  }

  byId("context-menu").classList.add("hidden");
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
    const tab = document.createElement("div");
    tab.className = `tab ${ws.id === state.activeWorkspaceId ? "active" : ""}`;

    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = ws.name;
    tab.appendChild(label);

    const close = document.createElement("span");
    close.className = "tab-close";
    close.textContent = "\u00d7";
    close.onclick = /** @param {MouseEvent} e */ (e) => { e.stopPropagation(); removeWorkspace(ws.id); };
    tab.appendChild(close);

    // Layout preset button (active tab with 2+ panes only)
    if (ws.id === state.activeWorkspaceId && ws.layout && getLeafList(ws.layout).length >= 2) {
      const layoutBtn = document.createElement("span");
      layoutBtn.className = "tab-layout-btn";
      layoutBtn.title = "Layout presets";
      layoutBtn.textContent = "\u229e"; // ⊞
      layoutBtn.onclick = /** @param {MouseEvent} e */ (e) => showLayoutPresetsMenu(e, ws);
      tab.appendChild(layoutBtn);
    }

    // Drag-to-reorder
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
      // Session/folder drop onto tab
      if (e.dataTransfer.types.includes("pty-win/session") || e.dataTransfer.types.includes("pty-win/folder")) {
        e.preventDefault(); e.dataTransfer.dropEffect = "copy"; tab.classList.add("drop-target"); return;
      }
      if (!dragSrcWsId || dragSrcWsId === ws.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = tab.getBoundingClientRect();
      const isLeft = e.clientX < rect.left + rect.width / 2;
      tab.classList.toggle("drag-over-left", isLeft);
      tab.classList.toggle("drag-over-right", !isLeft);
    });
    tab.addEventListener("dragleave", () => {
      tab.classList.remove("drag-over-left", "drag-over-right", "drop-target");
    });
    tab.addEventListener("drop", /** @param {DragEvent} e */ (e) => {
      if (!e.dataTransfer) return;
      tab.classList.remove("drop-target");
      // Session/folder drop
      if (e.dataTransfer.types.includes("pty-win/session") || e.dataTransfer.types.includes("pty-win/folder")) {
        e.preventDefault(); handleSessionDrop(e, ws.id); return;
      }
      if (!dragSrcWsId || dragSrcWsId === ws.id) return;
      e.preventDefault();
      const rect = tab.getBoundingClientRect();
      const isLeft = e.clientX < rect.left + rect.width / 2;
      const srcIdx = state.workspaces.findIndex((w) => w.id === dragSrcWsId);
      /** @type {any} */
      const removed = state.workspaces.splice(srcIdx, 1)[0];
      const tgtIdx = state.workspaces.findIndex((w) => w.id === ws.id);
      state.workspaces.splice(isLeft ? tgtIdx : tgtIdx + 1, 0, removed);
      dragSrcWsId = null;
      renderTabs();
    });

    // Single-click delayed to allow double-click to cancel it
    /** @type {ReturnType<typeof setTimeout> | null} */
    let clickTimer = null;
    tab.onclick = () => {
      if (clickTimer) return; // already pending
      clickTimer = setTimeout(() => {
        clickTimer = null;
        switchToWorkspace(ws.id);
      }, 250);
    };

    // Double-click to rename
    label.ondblclick = /** @param {MouseEvent} e */ (e) => {
      e.stopPropagation();
      // Cancel the pending single-click
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

    tabsEl.appendChild(tab);
  }

  // New workspace button — inline after last tab
  const addBtn = document.createElement("button");
  addBtn.id = "btn-new-workspace";
  addBtn.title = "New workspace";
  addBtn.textContent = "+";
  addBtn.onclick = () => { const ws = createWorkspace(null); switchToWorkspace(ws.id); };
  // Drop on + creates new workspace with dragged session
  addBtn.addEventListener("dragover", /** @param {DragEvent} e */ (e) => {
    if (!e.dataTransfer) return;
    if (e.dataTransfer.types.includes("pty-win/session") || e.dataTransfer.types.includes("pty-win/folder")) {
      e.preventDefault(); e.dataTransfer.dropEffect = "copy"; addBtn.classList.add("drop-target");
    }
  });
  addBtn.addEventListener("dragleave", () => addBtn.classList.remove("drop-target"));
  addBtn.addEventListener("drop", /** @param {DragEvent} e */ (e) => {
    addBtn.classList.remove("drop-target");
    handleSessionDrop(e, null); // null = new workspace
  });
  tabsEl.appendChild(addBtn);
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

/**
 * @param {string} groupName
 */
function createPane(groupName) {
  // Resolve which session to show via pane group
  const pg = state.paneGroups.get(groupName);
  const activeType = pg?.activeType || "claude";
  const activeSessionName = activeType === "pwsh" ? (pg?.pwsh || groupName) : (pg?.claude || groupName);
  const info = state.sessions.get(activeSessionName);
  const hasBoth = pg?.claude && pg?.pwsh;

  const pane = document.createElement("div");
  pane.className = `pane ${groupName === state.focusedPane ? "focused" : ""} ${info?.status === "dead" ? "dead" : ""}`;
  pane.dataset["session"] = groupName;
  pane.addEventListener("mousedown", () => focusPane(groupName));

  // Top bar
  const topbar = document.createElement("div");
  topbar.className = "pane-topbar";

  // Toggle buttons (only when both session types exist)
  let toggleHtml = "";
  if (hasBoth) {
    const claudeActive = activeType === "claude" ? "active" : "";
    const pwshActive = activeType === "pwsh" ? "active" : "";
    toggleHtml = `<span class="pane-toggle">
      <button class="toggle-btn toggle-claude ${claudeActive}" title="Claude">C</button>
      <button class="toggle-btn toggle-pwsh ${pwshActive}" title="PowerShell">&gt;_</button>
    </span>`;
  }

  const identity = info?.emcomIdentity ? `<span class="pane-identity">${info.emcomIdentity}</span>` : "";
  const aiPreset = (activeType !== "pwsh" && info?.command) ? getAiPresetForCommand(info.command) : null;
  const presetBadge = aiPreset ? `<span class="pane-ai-preset" title="${aiPreset.name}">${aiPreset.icon} ${aiPreset.name}</span>` : "";
  topbar.innerHTML = `
    <span class="pane-name">${groupName}</span>
    ${toggleHtml}
    ${presetBadge}
    <span class="pane-action cmd-tag code" title="Open in VS Code">&lt;/&gt;</span>
    ${identity}
    <span class="pane-cwd" title="${info?.workingDir || ""}">${truncatePath(info?.workingDir || "")}</span>
    <span class="pane-close" title="Kill session">&times;</span>
  `;

  // Toggle button handlers
  if (hasBoth) {
    topbar.querySelector(".toggle-claude")?.addEventListener("click", (e) => {
      e.stopPropagation();
      switchPaneType(groupName, "claude");
    });
    topbar.querySelector(".toggle-pwsh")?.addEventListener("click", (e) => {
      e.stopPropagation();
      switchPaneType(groupName, "pwsh");
    });
  }

  const codeBtn = /** @type {HTMLElement | null} */ (topbar.querySelector(".pane-action.code"));
  if (codeBtn) codeBtn.onclick = /** @param {MouseEvent} e */ (e) => {
    e.stopPropagation();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    fetch("/api/open-editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: info?.workingDir || "" }),
    });
  };

  const closeBtn = /** @type {HTMLElement | null} */ (topbar.querySelector(".pane-close"));
  if (closeBtn) closeBtn.onclick = /** @param {MouseEvent} e */ (e) => {
    e.stopPropagation();
    killSession(activeSessionName);
  };

  topbar.addEventListener("contextmenu", /** @param {MouseEvent} e */ (e) => {
    e.preventDefault();
    e.stopPropagation();
    showPaneContextMenu(e, groupName);
  });

  const identityEl = /** @type {HTMLElement | null} */ (topbar.querySelector(".pane-identity"));
  if (identityEl && info && info.emcomIdentity) {
    const identity = info.emcomIdentity;
    identityEl.style.cursor = "pointer";
    identityEl.title = `Switch feed to ${identity}`;
    identityEl.onclick = /** @param {MouseEvent} e */ (e) => {
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

  pane.appendChild(topbar);

  // Terminal
  const termArea = document.createElement("div");
  termArea.className = "pane-terminal";
  pane.appendChild(termArea);

  // Status bar
  const statusbar = document.createElement("div");
  statusbar.className = "pane-statusbar";
  const status = info?.status || "starting";
  const unread = info?.unreadCount || 0;
  const dotClass = info?.pendingPermission ? "permission" : status;
  const label = info?.pendingPermission ? "permission" : status;
  statusbar.innerHTML = `
    <span class="status-dot ${dotClass}"></span>
    <span class="pane-status-label">${label}</span>
    <span class="pane-unread ${unread > 0 ? "show" : ""}">${unread}</span>
  `;
  pane.appendChild(statusbar);

  // Create or reattach xterm for the active session
  const entry = ensureTerminal(activeSessionName);

  // Fit terminal and explicitly notify server of new dimensions
  // Guards against unnecessary fit() calls that reset xterm scroll position
  const fitAndSync = () => {
    try {
      // Skip fit if container has no usable height yet (flex not resolved)
      const h = termArea.offsetHeight;
      if (h < 50) return;
      // Compute what fit() would set without actually calling it
      // FitAddon uses core._renderService.dimensions to calculate
      const prevCols = entry.term.cols;
      const prevRows = entry.term.rows;
      entry.fitAddon.fit();
      const { cols, rows } = entry.term;
      // Only notify server if dimensions actually changed
      if (cols !== prevCols || rows !== prevRows) {
        state.ws?.send(JSON.stringify({ type: "resize", session: activeSessionName, payload: { cols, rows } }));
      }
    } catch {}
  };

  // xterm.js can only open() once. Move the persistent wrapper on re-renders.
  requestAnimationFrame(() => {
    if (!entry.opened) {
      termArea.appendChild(entry.wrapperEl);
      entry.term.open(entry.wrapperEl);
      entry.opened = true;
    } else {
      termArea.appendChild(entry.wrapperEl);
    }
    // Retry fit until container has usable height (flex layout resolved)
    let fitRetries = 0;
    const retryFit = () => {
      fitAndSync();
      if (termArea.offsetHeight < 50 && fitRetries < 20) {
        fitRetries++;
        setTimeout(retryFit, 100);
      }
    };
    retryFit();
    setTimeout(fitAndSync, 300);
    setTimeout(fitAndSync, 1000);

    if (!entry.resizeObserver) {
      let lastW = 0, lastH = 0;
      entry.resizeObserver = new ResizeObserver(/** @param {ResizeObserverEntry[]} entries */ (entries) => {
        const rect = entries[0]?.contentRect;
        if (!rect || rect.height < 50) return;
        // Skip if dimensions haven't actually changed (prevents spurious scroll resets)
        const w = Math.round(rect.width), h = Math.round(rect.height);
        if (w === lastW && h === lastH) return;
        lastW = w; lastH = h;
        fitAndSync();
      });
      entry.resizeObserver.observe(termArea);
    } else {
      entry.resizeObserver.disconnect();
      entry.resizeObserver.observe(termArea);
    }
  });

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

  let _pasteGuard = false;
  term.onData(/** @param {string} data */ (data) => {
    if (_pasteGuard) return; // skip — already sent by Ctrl+V handler
    state.ws?.send(JSON.stringify({ type: "input", session: sessionName, payload: data }));
  });

  term.onResize(/** @param {{cols: number, rows: number}} dim */ ({ cols, rows }) => {
    state.ws?.send(JSON.stringify({ type: "resize", session: sessionName, payload: { cols, rows } }));
  });

  term.attachCustomKeyEventHandler(/** @param {KeyboardEvent} e */ (e) => {
    if (e.type !== "keydown") return true;
    if (e.ctrlKey && e.shiftKey) {
      if (e.key === " ") {
        state.ws?.send(JSON.stringify({ type: "clear-input-dirty", session: sessionName }));
        return false;
      }
      switch (e.key) {
        case "D": case "d": switchToDashboard(); return false;
        case "H": case "h": return false;
        case "V": case "v": return false;
        case "W": case "w": closeFocusedPane(); return false;
        case "B": case "b": toggleSidebar(); return false;
      }
      if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        if (state.workspaces[idx]) switchToWorkspace(state.workspaces[idx].id);
        return false;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        resizeFocused(e.key); return false;
      }
    }
    if (e.ctrlKey && !e.shiftKey) {
      if (e.key === "p") { openQuickOpen(); return false; }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        navigatePanes(e.key); return false;
      }
      if (e.key === "v") {
        _pasteGuard = true;
        navigator.clipboard.readText().then((text) => {
          if (text) state.ws?.send(JSON.stringify({ type: "input", session: sessionName, payload: text }));
        }).catch(() => {}).finally(() => {
          setTimeout(() => { _pasteGuard = false; }, 50);
        });
        return false;
      }
    }
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
 * @param {MouseEvent} e
 * @param {string} folderPath
 * @param {string} folderName
 */
function showAiPicker(e, folderPath, folderName) {
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
      showAiPicker(e, folderPath, folderName); // re-render to update star
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

  // Resume Claude session (only for dead AI sessions)
  const pg = state.paneGroups.get(groupName);
  const claudeSession = pg?.claude ? state.sessions.get(pg.claude) : null;
  const aiCommands = new Set(state.aiPresets.map((p) => p.command));
  const isDeadAi = claudeSession?.status === "dead" && aiCommands.has(claudeSession.command);
  const isNoAi = !claudeSession || claudeSession.status === "dead";
  if (isDeadAi || isNoAi) {
    const resumeItem = document.createElement("div");
    const canResume = isDeadAi && !!claudeSession?.workingDir;
    resumeItem.className = `ctx-item ${canResume ? "" : "ctx-disabled"}`;
    resumeItem.textContent = "\u25b6 Resume Claude session";
    if (canResume && claudeSession?.workingDir) {
      const wd = claudeSession.workingDir;
      resumeItem.onclick = () => {
        menu.classList.add("hidden");
        openFolder(wd, groupName, "claude", false, ["--resume"]);
      };
    }
    menu.appendChild(resumeItem);

    const resumeSep = document.createElement("div");
    resumeSep.className = "ctx-sep";
    menu.appendChild(resumeSep);
  }

  // Move to existing workspaces
  const header = document.createElement("div");
  header.className = "ctx-header";
  header.textContent = "Move to";
  menu.appendChild(header);

  for (const ws of state.workspaces) {
    if (ws === currentWs) continue;
    const item = document.createElement("div");
    item.className = "ctx-item";
    item.textContent = ws.name;
    item.onclick = () => {
      movePaneToWorkspace(groupName, currentWs, ws);
      menu.classList.add("hidden");
    };
    menu.appendChild(item);
  }

  // Move to new workspace
  const sep = document.createElement("div");
  sep.className = "ctx-sep";
  menu.appendChild(sep);

  const newItem = document.createElement("div");
  newItem.className = "ctx-item";
  newItem.textContent = "+ New workspace";
  newItem.onclick = () => {
    const newWs = createWorkspace(groupName);
    movePaneToWorkspace(groupName, currentWs, newWs);
    switchToWorkspace(newWs.id);
    menu.classList.add("hidden");
  };
  menu.appendChild(newItem);

  // Close on click outside
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
    // signal since the user needs to act before Claude proceeds.
    const dotClass = info.pendingPermission ? "permission" : info.status;
    if (dot) dot.className = `status-dot ${dotClass}`;
    if (label) label.textContent = info.pendingPermission ? "permission" : info.status;
    if (unread) {
      unread.textContent = String(info.unreadCount ?? 0);
      unread.classList.toggle("show", (info.unreadCount ?? 0) > 0);
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
    // No sibling — remove pane from all workspaces
    for (const ws of state.workspaces) {
      if (ws.layout && treeContains(ws.layout, groupName)) {
        const leaves = getLeafList(ws.layout).filter((n) => n !== groupName);
        ws.layout = buildBalancedTree(leaves);
        updateWorkspaceTabName(ws);
      }
    }
  } else {
    // Sibling alive — switch toggle
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

  if (state.focusedPane === groupName && !siblingAlive) {
    state.focusedPane = null;
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    const leaves = ws?.layout ? getLeafList(ws.layout) : [];
    if (leaves.length > 0) state.focusedPane = leaves[0];
  }

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
    dash.innerHTML = `
      <div class="dashboard-empty">
        // NO ACTIVE SESSIONS<br><br>
        Open a folder from the sidebar or press <kbd>Ctrl+P</kbd>
      </div>
    `;
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

  // Patch cards
  const cardsGrid = dash.querySelector(".dash-cards");
  if (!cardsGrid) return;

  const currentNames = new Set(state.sessions.keys());
  const existingCards = cardsGrid.querySelectorAll(".dashboard-card[data-session]");

  // Remove cards for sessions that no longer exist
  for (const card of existingCards) {
    if (!(card instanceof HTMLElement)) continue;
    if (!currentNames.has(card.dataset["session"] ?? "")) {
      card.remove();
    }
  }

  // Add or patch cards
  for (const [name, info] of state.sessions) {
    const card = cardsGrid.querySelector(`.dashboard-card[data-session="${CSS.escape(name)}"]`);
    if (!card) {
      // New session — add card
      cardsGrid.appendChild(createDashboardCard(name, info));
    } else {
      // Existing — patch fields
      const statusEl = card.querySelector(".dashboard-card-status");
      if (statusEl && statusEl.textContent !== info.status) {
        statusEl.textContent = info.status;
        statusEl.className = `dashboard-card-status ${info.status}`;
        card.className = `dashboard-card status-${info.status}`;
      }
      const costEl = card.querySelector(".dashboard-card-cost");
      const costText = `$${(info.costUsd || 0).toFixed(2)}`;
      if (costEl && costEl.textContent !== costText) costEl.textContent = costText;
      const badgeEl = card.querySelector(".dashboard-card-badge");
      const unread = info.unreadCount || 0;
      if (badgeEl) {
        badgeEl.textContent = String(unread);
        badgeEl.className = `dashboard-card-badge ${unread > 0 ? "show" : ""}`;
      }
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
    const allSessions = [...state.sessions.entries()];
    const totalCostVal = allSessions.reduce((sum, [, s]) => sum + (s.costUsd || 0), 0);

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
    const currentNames = new Set(state.sessions.keys());

    // Remove rows for sessions that no longer exist
    for (const row of [...tbody.querySelectorAll(".diag-row")]) {
      if (!(row instanceof HTMLElement)) continue;
      if (!currentNames.has(row.dataset["session"] ?? "")) row.remove();
    }

    // Add or patch rows
    for (const [name, info] of allSessions) {
      const s = statsMap.get(name);
      const hot = s && s.busy.callbacksPerSec > 100;
      let row = /** @type {HTMLTableRowElement | null} */ (tbody.querySelector(`.diag-row[data-session="${CSS.escape(name)}"]`));

      if (!row) {
        row = document.createElement("tr");
        row.className = "diag-row";
        row.dataset["session"] = name;
        row.style.cursor = "pointer";
        row.onclick = () => focusExistingSession(name);
        row.innerHTML = `<td class="diag-name"></td><td class="diag-status"></td><td class="diag-ago"></td><td class="diag-cbs"></td><td class="diag-kbs"></td><td class="diag-cost"></td>`;
        // Insert before total row if it exists
        const totalRow = tbody.querySelector(".diag-cost-total");
        tbody.insertBefore(row, totalRow);
      }

      row.className = `diag-row ${hot ? "diag-hot" : ""}`;
      const cells = row.children;
      if (cells[0].textContent !== name) cells[0].textContent = name;
      if (cells[1].textContent !== info.status) { cells[1].textContent = info.status; cells[1].className = `diag-status ${info.status}`; }
      const agoText = fmtAgo(info.lastActiveMs);
      if (cells[2].textContent !== agoText) cells[2].textContent = agoText;
      const cbsText = s ? String(s.busy.callbacksPerSec) : "0";
      if (cells[3].textContent !== cbsText) { cells[3].textContent = cbsText; cells[3].className = hot ? "diag-hot-val" : ""; }
      const kbsText = s ? (s.busy.bytesPerSec / 1024).toFixed(1) : "0.0";
      if (cells[4].textContent !== kbsText) cells[4].textContent = kbsText;
      const costText = `$${(info.costUsd || 0).toFixed(2)}`;
      if (cells[5].textContent !== costText) cells[5].textContent = costText;
    }

    // Patch or create total row
    let totalRow = tbody.querySelector(".diag-cost-total");
    if (totalCostVal > 0) {
      if (!totalRow) {
        totalRow = document.createElement("tr");
        totalRow.className = "diag-cost-total";
        totalRow.innerHTML = `<td colspan="5">Total</td><td class="diag-cost"></td>`;
        tbody.appendChild(totalRow);
      }
      const totalCell = totalRow.querySelector(".diag-cost");
      const totalText = `$${totalCostVal.toFixed(2)}`;
      if (totalCell && totalCell.textContent !== totalText) totalCell.textContent = totalText;
    } else if (totalRow) {
      totalRow.remove();
    }
  }).catch(() => {});
}

// ===== Tracker Panel (Redesigned) =====

const TRACKER_STATUS_ORDER = ["decision-pending", "investigating", "implementing", "monitoring", "blocked", "deferred", "merged", "closed", "ready-to-merge", "testing", "pr-up"];
/** @type {import('./lib/tracker-filters.js').TrackerSortField} */
let trackerSortField = "status"; // default: grouped by status
/** @type {import('./lib/tracker-filters.js').TrackerSortDir} */
let trackerSortDir = "asc";
let trackerPrevItems = new Map();

/**
 * @param {any[]} items
 */
function filterTrackerItems(items) {
  return _filterTrackerItems(items, {
    repo: /** @type {HTMLSelectElement|null} */ (byId("tracker-filter-repo"))?.value || "",
    sev: /** @type {HTMLSelectElement|null} */ (byId("tracker-filter-sev"))?.value || "",
    assignee: /** @type {HTMLSelectElement|null} */ (byId("tracker-filter-assignee"))?.value || "",
    cat: localStorage.getItem("pty-win-tracker-cat") || "",
  });
}

/**
 * @param {any[]} items
 */
function populateTrackerFilters(items) {
  const repoSel = /** @type {HTMLSelectElement | null} */ (byId("tracker-filter-repo"));
  const assigneeSel = /** @type {HTMLSelectElement | null} */ (byId("tracker-filter-assignee"));
  if (!repoSel || !assigneeSel) return;

  const { repos, assignees } = extractFilterOptions(items);

  const updateOptions = /**
   * @param {HTMLSelectElement} sel
   * @param {string[]} options
   */
  (sel, options) => {
    const saved = localStorage.getItem(`pty-win-${sel.id}`) || "";
    const current = sel.value;
    if (sel.options.length - 1 === options.length) return; // no change
    const firstLabel = sel.options[0].textContent;
    sel.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>` + options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
    sel.value = saved || current;
  };

  updateOptions(repoSel, repos);
  updateOptions(assigneeSel, assignees);
}

/**
 * @param {any[]} items
 */
function sortTrackerItems(items) {
  return _sortTrackerItems(items, trackerSortField, trackerSortDir);
}

let _trackerRowNum = 0;
function resetTrackerRowNum() { _trackerRowNum = 0; }

/**
 * @param {import('./lib/state.js').TrackerItem} item
 */
function buildTrackerItem(item) {
  const el = document.createElement("div");
  el.className = `tracker-item`;
  el.dataset["id"] = item.id;
  el.style.contain = "content";

  const ageDate = item.date_found || item.created_at;
  if (staleClass(ageDate) === "stale-red") el.classList.add("stale-row");
  if (["closed", "merged", "deferred"].includes(item.status ?? "")) el.classList.add("tracker-item-done");

  el.innerHTML = renderTrackerItemHtml(item, ++_trackerRowNum);

  el.querySelector(".tracker-item-row")?.addEventListener("click", () => {
    const wasExpanded = el.classList.contains("expanded");
    el.classList.toggle("expanded");
    // Lazy-load history on first expand
    if (!wasExpanded && !el.dataset["historyLoaded"]) {
      loadTrackerHistory(el, item.id);
    }
  });
  return el;
}

/**
 * @param {HTMLElement} el
 * @param {import('./lib/state.js').TrackerItem} item
 */
const TRACKER_DEFAULT_COLS = [22, 85, 0, 55, 55, 65, 40, 35, 40, 50]; // 0 = flex; first col is row #

/**
 * Tracker container element with expandos for column-resize state.
 * The expandos are attached by initTrackerColumnResize() and re-read on
 * subsequent renderTracker() calls to apply widths to newly-appended rows.
 * @typedef {HTMLElement & { _applyColWidths?: () => void, _colWidths?: number[] }} TrackerContainer
 */

/**
 * @param {TrackerContainer} container
 */
function initTrackerColumnResize(container) {
  const thead = /** @type {HTMLElement | null} */ (container.querySelector(".tracker-thead"));
  if (!thead) return;
  const theadEl = thead; // narrow for closures
  const ths = /** @type {HTMLElement[]} */ ([...theadEl.querySelectorAll(".tracker-th")]);

  // Load saved widths (reset if column count changed)
  /** @type {number[]} */
  let colWidths;
  try {
    const saved = localStorage.getItem("pty-win-tracker-col-widths");
    const parsed = saved ? JSON.parse(saved) : null;
    colWidths = (parsed && parsed.length === TRACKER_DEFAULT_COLS.length) ? parsed : [...TRACKER_DEFAULT_COLS];
  } catch { colWidths = [...TRACKER_DEFAULT_COLS]; }

  function applyWidths() {
    const tpl = colWidths.map(w => w === 0 ? "minmax(0,1fr)" : `${w}px`).join(" ");
    theadEl.style.gridTemplateColumns = tpl;
    container.querySelectorAll(".tracker-item-row").forEach(r => {
      if (r instanceof HTMLElement) r.style.gridTemplateColumns = tpl;
    });
  }

  applyWidths();

  // Store applyWidths so new rows can pick it up
  container._applyColWidths = applyWidths;
  container._colWidths = colWidths;

  // Add resize handles to all but last header
  for (let i = 0; i < ths.length - 1; i++) {
    const handle = document.createElement("div");
    handle.className = "tracker-col-resize";
    ths[i].appendChild(handle);

    handle.onmousedown = /** @param {MouseEvent} e */ (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle.classList.add("dragging");
      const startX = e.clientX;
      const startW = ths[i].offsetWidth;
      const onMove = /** @param {MouseEvent} ev */ (ev) => {
        const delta = ev.clientX - startX;
        const newW = Math.max(30, startW + delta);
        colWidths[i] = newW;
        applyWidths();
      };
      const onUp = () => {
        handle.classList.remove("dragging");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        localStorage.setItem("pty-win-tracker-col-widths", JSON.stringify(colWidths));
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
  }
}

/**
 * @param {HTMLElement} el
 * @param {string} itemId
 */
function loadTrackerHistory(el, itemId) {
  const identity = localStorage.getItem("pty-win-feed-identity") || "";
  const detail = el.querySelector(".tracker-item-detail");
  if (!detail) return;

  // Add loading placeholder
  let timeline = detail.querySelector(".tracker-timeline");
  if (!timeline) {
    timeline = document.createElement("div");
    timeline.className = "tracker-timeline";
    timeline.innerHTML = `<div class="tracker-timeline-title">History</div><div class="tracker-timeline-loading">Loading...</div>`;
    detail.appendChild(timeline);
  }

  fetch(`/api/emcom-proxy/tracker/${itemId}`, { headers: { "X-Emcom-Name": identity } })
    .then(r => r.json())
    .then(data => {
      el.dataset["historyLoaded"] = "true";
      const history = data.history || [];
      if (history.length === 0) {
        timeline.innerHTML = `<div class="tracker-timeline-title">History</div><div class="tracker-timeline-loading">No history</div>`;
        return;
      }

      const entries = renderTrackerHistoryEntries(history);

      timeline.innerHTML = `<div class="tracker-timeline-title">History</div>${entries}`;
    })
    .catch(() => {
      timeline.innerHTML = `<div class="tracker-timeline-title">History</div><div class="tracker-timeline-loading">Failed to load</div>`;
    });
}

function renderTracker() {
  const area = byId("tracker-content");
  if (!area) return;
  const identity = localStorage.getItem("pty-win-feed-identity") || "";

  // Ensure container + chrome exist (build once)
  let container = /** @type {TrackerContainer | null} */ (area.querySelector(".tracker-view"));
  if (!container) {
    area.innerHTML = "";
    container = document.createElement("div");
    container.className = "tracker-view";
    container.innerHTML = `
      <div class="tracker-chrome">
        <span class="tracker-chrome-title">Work Tracker</span>
        <div class="tracker-chrome-stats"></div>
        <label class="tracker-show-closed"><input type="checkbox" id="tracker-closed-toggle"> closed</label>
        <button class="tracker-refresh-btn" id="tracker-refresh-btn" title="Refresh now">&#x21bb;</button>
      </div>
      <div class="tracker-filters">
        <div class="tracker-category-btns">
          <button class="tracker-cat-btn active" data-cat="">All</button>
          <button class="tracker-cat-btn" data-cat="sdk">SDK</button>
          <button class="tracker-cat-btn" data-cat="infra">Infra</button>
          <button class="tracker-cat-btn" data-cat="ops">Ops</button>
          <button class="tracker-cat-btn" data-cat="reminder">Reminders</button>
        </div>
        <select class="tracker-filter" id="tracker-filter-repo"><option value="">all repos</option></select>
        <select class="tracker-filter" id="tracker-filter-sev"><option value="">all sev</option><option value="critical">critical</option><option value="high">high</option><option value="normal">normal</option></select>
        <select class="tracker-filter" id="tracker-filter-assignee"><option value="">all assignees</option></select>
      </div>
      <div class="tracker-thead">
        <div class="tracker-th tracker-th-num">#</div>
        <div class="tracker-th" data-sort="ref">Ref <span class="sort-arrow"></span></div>
        <div class="tracker-th" data-sort="title">Title <span class="sort-arrow"></span></div>
        <div class="tracker-th" data-sort="assignee">Assignee <span class="sort-arrow"></span></div>
        <div class="tracker-th" data-sort="opened_by">Opened By <span class="sort-arrow"></span></div>
        <div class="tracker-th" data-sort="responders">Responders <span class="sort-arrow"></span></div>
        <div class="tracker-th" data-sort="severity">Sev <span class="sort-arrow"></span></div>
        <div class="tracker-th" data-sort="age" style="text-align:center;justify-content:center">Age <span class="sort-arrow"></span></div>
        <div class="tracker-th" data-sort="last_github_activity" style="text-align:center;justify-content:center">Active <span class="sort-arrow"></span></div>
        <div class="tracker-th" data-sort="updated">Updated <span class="sort-arrow"></span></div>
      </div>
      <div class="tracker-body"></div>`;
    area.appendChild(container);
  }
  const c = container;
  if (!c.dataset["wired"]) {
    c.dataset["wired"] = "1";

    // Wire sortable headers
    c.querySelectorAll(".tracker-th").forEach(th => {
      if (!(th instanceof HTMLElement)) return;
      th.onclick = () => {
        const field = /** @type {import('./lib/tracker-filters.js').TrackerSortField} */ (th.dataset["sort"] || "status");
        if (trackerSortField === field) {
          trackerSortDir = trackerSortDir === "asc" ? "desc" : "asc";
        } else {
          trackerSortField = field;
          trackerSortDir = "asc";
        }
        // Update sort indicators
        c.querySelectorAll(".tracker-th").forEach(h => {
          if (!(h instanceof HTMLElement)) return;
          h.classList.toggle("sort-active", h.dataset["sort"] === trackerSortField);
          const arrow = h.querySelector(".sort-arrow");
          if (arrow) arrow.textContent = h.dataset["sort"] === trackerSortField ? (trackerSortDir === "asc" ? "\u25b4" : "\u25be") : "";
        });
        renderTrackerBody(c, filterTrackerItems(state.trackerItems || []));
      };
    });

    // Wire refresh button
    const refreshBtn = /** @type {HTMLElement | null} */ (c.querySelector("#tracker-refresh-btn"));
    if (refreshBtn) refreshBtn.onclick = () => renderTracker();

    // Wire closed toggle
    const closedToggle = /** @type {HTMLInputElement | null} */ (c.querySelector("#tracker-closed-toggle"));
    if (closedToggle) {
      closedToggle.checked = localStorage.getItem("pty-win-tracker-show-closed") === "true";
      closedToggle.onchange = () => {
        localStorage.setItem("pty-win-tracker-show-closed", String(closedToggle.checked));
        renderTracker();
      };
    }

    // Wire column resize handles
    initTrackerColumnResize(c);

    // Wire filter dropdowns
    const wireFilter = /**
     * @param {string} id
     * @param {string} _key reserved for future use; currently the localStorage key derives from id
     */
    (id, _key) => {
      const el = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (c.querySelector(`#${id}`));
      if (!el) return;
      const saved = localStorage.getItem(`pty-win-${id}`);
      if (saved) el.value = saved;
      el.onchange = () => {
        localStorage.setItem(`pty-win-${id}`, el.value);
        renderTrackerBody(c, filterTrackerItems(state.trackerItems || []));
      };
    };
    wireFilter("tracker-filter-repo", "repo");
    wireFilter("tracker-filter-sev", "severity");
    wireFilter("tracker-filter-assignee", "assigned_to");

    // Wire category toggle buttons
    const savedCat = localStorage.getItem("pty-win-tracker-cat") || "";
    c.querySelectorAll(".tracker-cat-btn").forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      if (btn.dataset["cat"] === savedCat) {
        c.querySelectorAll(".tracker-cat-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      }
      btn.onclick = () => {
        c.querySelectorAll(".tracker-cat-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        localStorage.setItem("pty-win-tracker-cat", btn.dataset["cat"] ?? "");
        renderTrackerBody(c, filterTrackerItems(state.trackerItems || []));
      };
    });
  }

  const showClosed = localStorage.getItem("pty-win-tracker-show-closed") === "true";
  fetch(`/api/emcom-proxy/tracker${showClosed ? "" : "?status=open"}`, {
    headers: { "X-Emcom-Name": identity },
  })
    .then(r => r.json())
    .then(/** @param {any[]} items */ items => {
      state.trackerItems = items;
      state.trackerDecisionCount = items.filter(i => i.status === "decision-pending").length;

      // Update right panel tracker tab badge
      const badge = byId("tracker-tab-badge");
      if (badge) {
        badge.textContent = state.trackerDecisionCount > 0 ? ` (${state.trackerDecisionCount})` : "";
        badge.classList.toggle("hidden", state.trackerDecisionCount === 0);
      }

      // Update chrome stats
      const statsEl = c.querySelector(".tracker-chrome-stats");
      if (statsEl) {
        const dec = items.filter(i => i.status === "decision-pending").length;
        const inv = items.filter(i => i.status === "investigating").length;
        const blk = items.filter(i => i.status === "blocked").length;
        statsEl.innerHTML = `
          <span class="tracker-chrome-stat decision"><span class="val">${dec}</span> pending</span>
          <span class="tracker-chrome-stat"><span class="val">${inv}</span> investigating</span>
          <span class="tracker-chrome-stat"><span class="val">${blk}</span> blocked</span>
          <span class="tracker-chrome-stat"><span class="val">${items.length}</span> total</span>`;
      }

      populateTrackerFilters(items);
      renderTrackerBody(c, filterTrackerItems(items));
    })
    .catch(() => {
      const body = c.querySelector(".tracker-body");
      if (body) body.innerHTML = `<div class="tracker-error">// CONNECTION FAILED</div>`;
    });
}

/**
 * @param {TrackerContainer} container
 * @param {any[]} items
 */
function renderTrackerBody(container, items) {
  const body = container.querySelector(".tracker-body");
  if (!body) return;
  resetTrackerRowNum();

  // Always remove stale empty state before rendering
  const existingEmpty = body.querySelector(".tracker-empty");
  if (existingEmpty) existingEmpty.remove();

  if (items.length === 0) {
    // Clear all groups and items, show empty state
    body.innerHTML = `<div class="tracker-empty">// NO OPEN ITEMS</div>`;
    trackerPrevItems.clear();
    return;
  }

  const currentIds = new Set(items.map(i => i.id));
  const newItemMap = new Map(items.map(i => [i.id, i]));

  // Remove items that no longer exist
  for (const el of [...body.querySelectorAll(".tracker-item[data-id]")]) {
    if (!(el instanceof HTMLElement)) continue;
    if (!currentIds.has(el.dataset["id"] ?? "")) el.remove();
  }

  // Remove empty groups
  for (const g of [...body.querySelectorAll(".tracker-group")]) {
    if (g.querySelectorAll(".tracker-item").length === 0) g.remove();
  }

  if (trackerSortField !== "status") {
    // Flat sorted view — no groups
    for (const g of [...body.querySelectorAll(".tracker-group")]) g.remove();
    const sorted = sortTrackerItems(items);
    for (const item of sorted) {
      let el = /** @type {HTMLElement | null} */ (body.querySelector(`.tracker-item[data-id="${item.id}"]`));
      if (!el) {
        el = buildTrackerItem(item);
        body.appendChild(el);
      } else {
        patchTrackerItem(el, item);
        body.appendChild(el); // re-append to maintain sort order
      }
    }
  } else {
    // Grouped by status
    for (const status of TRACKER_STATUS_ORDER) {
      const groupItems = items.filter(i => i.status === status);
      if (groupItems.length === 0) {
        const existing = body.querySelector(`.tracker-group[data-status="${status}"]`);
        if (existing) existing.remove();
        continue;
      }

      let groupEl = /** @type {HTMLElement | null} */ (body.querySelector(`.tracker-group[data-status="${status}"]`));
      if (!groupEl) {
        groupEl = document.createElement("div");
        groupEl.className = "tracker-group";
        groupEl.dataset["status"] = status;
        groupEl.innerHTML = `<div class="tracker-group-bar">
          <span class="tracker-group-dot"></span>
          <span class="tracker-group-name">${status.replace(/-/g, " ")}</span>
          <span class="tracker-group-count">(${groupItems.length})</span>
        </div>`;
        body.appendChild(groupEl);
      } else {
        const countEl = groupEl.querySelector(".tracker-group-count");
        if (countEl) countEl.textContent = `(${groupItems.length})`;
      }

      for (const item of groupItems) {
        let el = /** @type {HTMLElement | null} */ (groupEl.querySelector(`.tracker-item[data-id="${item.id}"]`));
        if (!el) {
          el = buildTrackerItem(item);
          groupEl.appendChild(el);
        } else {
          patchTrackerItem(el, item);
        }
      }

      // Remove items that moved to a different status
      for (const el of [...groupEl.querySelectorAll(".tracker-item[data-id]")]) {
        if (!(el instanceof HTMLElement)) continue;
        const item = newItemMap.get(el.dataset["id"] ?? "");
        if (!item || item.status !== status) el.remove();
      }
    }
  }

  trackerPrevItems = newItemMap;

  // Apply column widths to any new rows
  if (container._applyColWidths) container._applyColWidths();
}

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

function renderAgentsPanel() {
  const area = byId("agents-content");
  if (!area) return;

  const allSessions = [...state.sessions.entries()];
  if (allSessions.length === 0) {
    area.innerHTML = `<div class="agents-panel"><div class="agents-empty">No active sessions</div></div>`;
    return;
  }

  // Build table structure once, then patch. If empty state was showing, rebuild.
  let panel = /** @type {HTMLElement | null} */ (area.querySelector(".agents-panel"));
  if (!panel || !panel.querySelector(".agents-table")) {
    area.innerHTML = "";
    panel = document.createElement("div");
    panel.className = "agents-panel";
    panel.innerHTML = `
      <div class="agents-header">
        <span class="agents-title">AGENT STATUS</span>
        <span class="agents-summary"></span>
      </div>
      <table class="agents-table">
        <thead><tr><th>Agent</th><th>Status</th><th>cb/s</th><th>Active</th><th>Trend</th><th>Cost</th></tr></thead>
        <tbody></tbody>
      </table>`;
    area.appendChild(panel);
  }

  // Fetch stats for cb/s data
  fetch("/api/stats").then(r => r.json()).then(/** @param {any[]} stats */ stats => {
    const statsMap = new Map(stats.map(s => [s.name, s]));

    // Patch summary
    const busy = allSessions.filter(([, i]) => i.status === "busy").length;
    const idle = allSessions.filter(([, i]) => i.status === "idle").length;
    const needsInputCount = allSessions.filter(([name, i]) => {
      const st = statsMap.get(name);
      const cbs = st ? st.busy.callbacksPerSec : 0;
      return i.status !== "dead" && (
        i.pendingPermission ||
        (i.status === "busy" && cbs === 0)
      );
    }).length;
    const totalCost = allSessions.reduce((s, [, i]) => s + (i.costUsd || 0), 0);
    const summaryEl = panel.querySelector(".agents-summary");
    if (summaryEl) {
      summaryEl.innerHTML = `${busy} busy · ${idle} idle${needsInputCount > 0 ? ` · <span class="agents-needs-input-count">${needsInputCount} need input</span>` : ""} · $${totalCost.toFixed(2)}`;
    }

    const tbody = panel.querySelector("tbody");
    if (!tbody) return;
    const currentNames = new Set(state.sessions.keys());

    // Remove rows for gone sessions
    for (const row of [...tbody.querySelectorAll(".agents-row")]) {
      if (!(row instanceof HTMLElement)) continue;
      if (!currentNames.has(row.dataset["session"] ?? "")) row.remove();
    }

    // Add or patch rows
    for (const [name, info] of allSessions) {
      const s = statsMap.get(name);
      let row = /** @type {HTMLTableRowElement | null} */ (tbody.querySelector(`.agents-row[data-session="${CSS.escape(name)}"]`));
      if (!row) {
        row = document.createElement("tr");
        row.className = "agents-row";
        row.dataset["session"] = name;
        row.style.cursor = "pointer";
        row.onclick = () => focusExistingSession(name);
        row.innerHTML = `<td class="agents-name"></td><td class="agents-status"></td><td class="agents-cbs"></td><td class="agents-active"></td><td class="agents-trend"></td><td class="agents-cost"></td>`;
        const totalRow = tbody.querySelector(".agents-total-row");
        tbody.insertBefore(row, totalRow);
      }

      const cbs = s ? s.busy.callbacksPerSec : 0;
      // permission_prompt hook = definite needs input; busy + 0 cb/s = probable needs input
      const needsInput = info.status !== "dead" && (
        info.pendingPermission ||
        (info.status === "busy" && cbs === 0)
      );
      row.className = `agents-row ${needsInput ? "agents-needs-input" : ""}`;

      const cells = row.children;
      const nameText = name;
      if (cells[0].textContent !== nameText) cells[0].textContent = nameText;

      const statusText = needsInput ? "needs input" : (info.status || "unknown");
      if (cells[1].textContent !== statusText) {
        cells[1].textContent = statusText;
        cells[1].className = `agents-status ${needsInput ? "status-needs-input" : `status-${info.status}`}`;
      }

      const cbsText = s ? String(s.busy.callbacksPerSec) : "0";
      if (cells[2].textContent !== cbsText) cells[2].textContent = cbsText;

      const agoText = fmtAgo(info.lastActiveMs);
      if (cells[3].textContent !== agoText) cells[3].textContent = agoText;

      const costText = `$${(info.costUsd || 0).toFixed(2)}`;
      if (cells[5].textContent !== costText) cells[5].textContent = costText;
    }

    // Patch or create total row
    let totalRow = /** @type {HTMLElement | null} */ (tbody.querySelector(".agents-total-row"));
    if (totalCost > 0) {
      if (!totalRow) {
        totalRow = document.createElement("tr");
        totalRow.className = "agents-total-row";
        totalRow.innerHTML = `<td colspan="4">Total</td><td class="agents-trend"></td><td class="agents-cost"></td>`;
        tbody.appendChild(totalRow);
      }
      const totalCell = totalRow.querySelector(".agents-cost");
      const totalText = `$${totalCost.toFixed(2)}`;
      if (totalCell && totalCell.textContent !== totalText) totalCell.textContent = totalText;
    } else if (totalRow) {
      totalRow.remove();
    }
    // Fetch and render sparklines into trend column
    fetchCostHistory(panel);
  }).catch(() => {});
}

/**
 * @param {HTMLElement} panel
 */
function fetchCostHistory(panel) {
  fetch("/api/cost-history").then(r => r.json()).then(/** @param {any[]} history */ history => {
    if (!history || history.length < 2) return;

    // Extract per-session time series
    const sessionSeries = new Map();
    for (const sample of history) {
      for (const [name, cost] of Object.entries(sample.sessions)) {
        if (!sessionSeries.has(name)) sessionSeries.set(name, []);
        sessionSeries.get(name).push(cost);
      }
    }

    // Draw sparklines into table trend cells
    const tbody = panel.querySelector("tbody");
    if (!tbody) return;

    for (const [name, series] of sessionSeries) {
      const row = tbody.querySelector(`.agents-row[data-session="${CSS.escape(name)}"]`);
      if (!row) continue;

      const trendCell = row.querySelector(".agents-trend");
      if (!trendCell) continue;

      let canvas = /** @type {HTMLCanvasElement | null} */ (trendCell.querySelector(".agents-sparkline"));
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.className = "agents-sparkline";
        canvas.width = 50;
        canvas.height = 14;
        trendCell.appendChild(canvas);
      }

      drawSparkline(canvas, series);
    }

    // Total sparkline — sum all sessions per timestamp
    const totalSeries = history.map(sample => {
      let sum = 0;
      for (const cost of Object.values(sample.sessions)) sum += cost;
      return sum;
    });

    const totalRow = tbody.querySelector(".agents-total-row");
    if (totalRow && totalSeries.length >= 2) {
      // Find or create trend cell in total row
      let trendCell = totalRow.querySelector(".agents-trend");
      if (!trendCell) {
        // Total row has colspan — need to restructure: remove colspan, add trend cell
        totalRow.innerHTML = `<td colspan="4">Total</td><td class="agents-trend"></td><td class="agents-cost"></td>`;
      }
      trendCell = totalRow.querySelector(".agents-trend");
      if (trendCell) {
        let canvas = /** @type {HTMLCanvasElement | null} */ (trendCell.querySelector(".agents-sparkline"));
        if (!canvas) {
          canvas = document.createElement("canvas");
          canvas.className = "agents-sparkline";
          canvas.width = 50;
          canvas.height = 14;
          trendCell.appendChild(canvas);
        }
        drawSparkline(canvas, totalSeries);
      }
    }
  }).catch(() => {});
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} data
 */
function drawSparkline(canvas, data) {
  if (data.length < 2) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  ctx.strokeStyle = "#d4882a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((data[i] - min) / range) * (h - 2) - 1;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

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
        renderTracker();
      }
      if (panel === "agents") renderAgentsPanel();
    };
  });

  // Start tracker polling (updates badge even when feed tab is active)
  renderTracker();
  setInterval(renderTracker, 10000);

  // Start agents panel polling
  renderAgentsPanel();
  setInterval(renderAgentsPanel, 5000);
})();

// ===== Settings modal (v0.1.33) =====
//
// Schema-driven preferences editor. Fetches /api/preferences/schema +
// /api/preferences on open, renders rows by type, writes via POST with
// updatedBy="pty-win-settings". Same prefs file as the right-click menu's
// pty-win-play writes — the two surfaces stay consistent.

(function initSettingsModal() {
  const btn = byId("settings-btn");
  const modal = byId("settings-modal");
  const backdrop = byId("settings-modal-backdrop");
  const closeBtn = byId("settings-modal-close");
  const cancelBtn = byId("settings-modal-cancel");
  const saveBtn = buttonById("settings-modal-save");
  const body = byId("settings-modal-body");
  const status = byId("settings-modal-status");

  if (!btn || !modal || !body) return;

  /** Current rendered state — keyed by pref name, value is the editor's current value.
   * @type {Record<string, any>}
   */
  let formState = {};
  /** Original loaded values, for cancel/dirty detection.
   * @type {Record<string, any>}
   */
  let initialState = {};
  /** Schema descriptor loaded from server.
   * @type {Record<string, any>}
   */
  let schema = {};

  async function openModal() {
    setStatus("loading…");
    saveBtn.disabled = true;
    show(true);

    try {
      const [schemaResp, prefsResp] = await Promise.all([
        fetch("/api/preferences/schema"),
        fetch("/api/preferences"),
      ]);
      if (!schemaResp.ok) throw new Error("schema fetch failed");
      const schemaPayload = await schemaResp.json();
      schema = schemaPayload.keys || {};

      const prefs = prefsResp.ok ? await prefsResp.json() : {};
      const file = prefs.file || {};
      initialState = {};
      for (const key of Object.keys(schema)) {
        initialState[key] = file[key] ?? prefs.cliPreference ?? "";
      }
      formState = { ...initialState };
      render();
      setStatus(prefs.source === "first-found" ? "Default detected from PATH (no preference saved yet)" : "");
      saveBtn.disabled = false;
    } catch (e) {
      setStatus(`Failed to load: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  function closeModal() {
    show(false);
    body.innerHTML = "";
    setStatus("");
    formState = {};
    initialState = {};
  }

  /**
   * @param {boolean} visible
   */
  function show(visible) {
    modal.classList.toggle("hidden", !visible);
  }

  /**
   * @param {string} msg
   * @param {string} [level]
   */
  function setStatus(msg, level) {
    status.textContent = msg || "";
    status.classList.remove("error", "ok");
    if (level === "error") status.classList.add("error");
    if (level === "ok") status.classList.add("ok");
  }

  function render() {
    body.innerHTML = "";
    for (const [key, def] of Object.entries(schema)) {
      body.appendChild(renderRow(key, def));
    }
  }

  /**
   * @param {string} key
   * @param {any} def
   */
  function renderRow(key, def) {
    const row = document.createElement("div");
    row.className = `settings-row ${def.type}`;

    const label = document.createElement("label");
    label.textContent = def.label || key;
    label.htmlFor = `pref-${key}`;
    row.appendChild(label);

    if (def.description) {
      const desc = document.createElement("p");
      desc.className = "desc";
      desc.textContent = def.description;
      row.appendChild(desc);
    }

    const current = formState[key] ?? "";

    if (def.type === "select") {
      const sel = document.createElement("select");
      sel.id = `pref-${key}`;
      for (const opt of def.options || []) {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      }
      const customValue = isCustom(current, def);
      if (def.allowCustom) {
        const o = document.createElement("option");
        o.value = "__custom__";
        o.textContent = def.customLabel || "Custom…";
        sel.appendChild(o);
      }
      sel.value = customValue ? "__custom__" : (current || (def.options || [])[0] || "");
      row.appendChild(sel);

      const custom = document.createElement("input");
      custom.type = "text";
      custom.className = "custom-input";
      custom.placeholder = "Full path or command";
      custom.value = customValue ? current : "";
      custom.style.display = customValue ? "block" : "none";
      row.appendChild(custom);

      sel.onchange = () => {
        if (sel.value === "__custom__") {
          custom.style.display = "block";
          custom.focus();
          formState[key] = custom.value || "";
        } else {
          custom.style.display = "none";
          formState[key] = sel.value;
        }
      };
      custom.oninput = () => { formState[key] = custom.value; };
    } else if (def.type === "number") {
      const inp = document.createElement("input");
      inp.type = "number";
      inp.id = `pref-${key}`;
      inp.value = current === "" ? "" : String(current);
      if (def.min != null) inp.min = String(def.min);
      if (def.max != null) inp.max = String(def.max);
      inp.oninput = () => { formState[key] = inp.value === "" ? "" : Number(inp.value); };
      row.appendChild(inp);
    } else if (def.type === "boolean") {
      const inp = document.createElement("input");
      inp.type = "checkbox";
      inp.id = `pref-${key}`;
      inp.checked = !!current;
      inp.onchange = () => { formState[key] = inp.checked; };
      // Move label after checkbox for proper visual alignment with .boolean rule
      row.insertBefore(inp, label);
      row.classList.add("boolean");
    } else { // string
      const inp = document.createElement("input");
      inp.type = "text";
      inp.id = `pref-${key}`;
      inp.value = current ?? "";
      inp.oninput = () => { formState[key] = inp.value; };
      row.appendChild(inp);
    }
    return row;
  }

  /**
   * @param {any} value
   * @param {any} def
   */
  function isCustom(value, def) {
    if (def.type !== "select" || !def.allowCustom) return false;
    if (!value) return false;
    return !(def.options || []).includes(value);
  }

  async function save() {
    setStatus("saving…");
    saveBtn.disabled = true;

    // For now, the only key the server-side POST endpoint accepts is
    // cliPreference. If we add more keys later, expand to POST each that
    // changed.
    const changed = Object.entries(formState).filter(([k, v]) => v !== initialState[k] && v !== "" && v != null);
    if (changed.length === 0) {
      setStatus("No changes", "ok");
      saveBtn.disabled = false;
      return;
    }

    try {
      for (const [key, value] of changed) {
        if (key !== "cliPreference") {
          console.warn(`[settings] unsupported key in POST: ${key}`);
          continue;
        }
        const resp = await fetch("/api/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cliPreference: String(value), updatedBy: "pty-win-settings" }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${resp.status}`);
        }
      }
      // Update local AI default index to match the saved value.
      if (typeof state !== "undefined" && state.aiPresets) {
        const cli = formState["cliPreference"];
        const idx = state.aiPresets.findIndex((p) => p.command === cli);
        if (idx >= 0) {
          state.aiDefaultIndex = idx;
          localStorage.setItem("pty-win-ai-default", String(idx));
        }
      }
      setStatus("Saved", "ok");
      initialState = { ...formState };
      setTimeout(closeModal, 600);
    } catch (e) {
      setStatus(`Save failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      saveBtn.disabled = false;
    }
  }

  btn.onclick = openModal;
  closeBtn.onclick = closeModal;
  cancelBtn.onclick = closeModal;
  backdrop.onclick = closeModal;
  saveBtn.onclick = save;

  document.addEventListener("keydown", /** @param {KeyboardEvent} e */ (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });
})();
