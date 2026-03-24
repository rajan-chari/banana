// @ts-check
// pty-win — Folder-centric terminal multiplexer

// ===== State =====

/** @typedef {{ type: "leaf", session: string }} LeafNode */
/** @typedef {{ type: "split", direction: "h"|"v", ratio: number, children: [TileNode, TileNode] }} SplitNode */
/** @typedef {LeafNode | SplitNode} TileNode */
/** @typedef {{ id: string, name: string, layout: TileNode | null }} Workspace */

const state = {
  ws: null,
  sessions: new Map(),    // name -> SessionInfo
  workspaces: [],         // Workspace[]
  activeWorkspaceId: null,
  terminals: new Map(),   // sessionName -> { term, fitAddon, opened: boolean }
  focusedPane: null,
  isDashboard: true,
  sidebarVisible: true,
  favorites: [],          // string[] — favorite root paths
  folderCache: new Map(), // path -> FolderEntry[]
  visitedFolders: [],     // {name, path, identityName?, isClaudeReady}[] for quick-open
  expandedPaths: new Set(),
  ctxTarget: null,        // path for context menu
  sessionMeta: new Map(), // name -> { workingDir, command } for recreating after restart
  paneGroups: new Map(),  // group -> { claude?: name, pwsh?: name, activeType: "claude"|"pwsh" }
  folderInfoCache: new Map(), // normPath(workingDir) -> { isClaudeReady, hasIdentity, identityName }
  aiPresets: JSON.parse(localStorage.getItem("pty-win-ai-presets") || "null") || [
    { name: "Claude", command: "claude", icon: "\u25b6" },
    { name: "Agency CC", command: "agency cc", icon: "A" },
    { name: "Copilot", command: "copilot", icon: "GH" },
    { name: "Agency GH", command: "agency gh", icon: "AG" },
  ],
  aiDefaultIndex: parseInt(localStorage.getItem("pty-win-ai-default") || "0") || 0,
};

let nextWorkspaceId = 1;

function getDefaultAiCommand() {
  return state.aiPresets[state.aiDefaultIndex]?.command || "claude";
}
function getAiPresetForCommand(cmd) {
  return state.aiPresets.find((p) => p.command === cmd) || { name: cmd, command: cmd, icon: "?" };
}
function setAiDefault(index) {
  state.aiDefaultIndex = index;
  localStorage.setItem("pty-win-ai-default", String(index));
}

// ===== xterm theme =====

const TERM_THEME = {
  background: "#1e1e1e",
  foreground: "#cccccc",
  cursor: "#aeafad",
  cursorAccent: "#1e1e1e",
  selectionBackground: "#264f7840",
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#e5e5e5",
};

// ===== Persistence =====

function loadFavorites() {
  try {
    const raw = localStorage.getItem("pty-win-favorites");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveFavorites() {
  localStorage.setItem("pty-win-favorites", JSON.stringify(state.favorites));
}

function loadExpandedPaths() {
  try {
    const raw = localStorage.getItem("pty-win-expanded");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveExpandedPaths() {
  localStorage.setItem("pty-win-expanded", JSON.stringify([...state.expandedPaths]));
}

function loadSidebarWidth() {
  try {
    const w = localStorage.getItem("pty-win-sidebar-width");
    return w ? parseInt(w, 10) : 220;
  } catch { return 220; }
}

function saveWorkspaces() {
  // Save workspace metadata + layout (session names only, not terminal instances)
  const data = state.workspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    customName: ws.customName || false,
    layout: ws.layout,
  }));
  localStorage.setItem("pty-win-workspaces", JSON.stringify({
    workspaces: data,
    activeWorkspaceId: state.activeWorkspaceId,
    isDashboard: state.isDashboard,
    nextId: nextWorkspaceId,
  }));
}

function loadWorkspaces() {
  try {
    const raw = localStorage.getItem("pty-win-workspaces");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveSidebarWidth(w) {
  localStorage.setItem("pty-win-sidebar-width", String(w));
}

function loadSessionMeta() {
  try {
    const raw = localStorage.getItem("pty-win-session-meta");
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw)));
  } catch { return new Map(); }
}

function saveSessionMeta() {
  const obj = {};
  for (const [name, meta] of state.sessionMeta) obj[name] = meta;
  localStorage.setItem("pty-win-session-meta", JSON.stringify(obj));
}

function rebuildPaneGroups() {
  // Preserve activeType selections across rebuilds
  const prevActive = new Map();
  for (const [g, pg] of state.paneGroups) prevActive.set(g, pg.activeType);

  state.paneGroups.clear();
  for (const [name, info] of state.sessions) {
    const group = info.group || name;
    if (!state.paneGroups.has(group)) {
      state.paneGroups.set(group, { activeType: prevActive.get(group) || "claude" });
    }
    const pg = state.paneGroups.get(group);
    if (name.endsWith("~pwsh")) {
      pg.pwsh = name;
    } else {
      pg.claude = name;
    }
  }
  // If activeType points to a dead/missing session, flip to the other
  for (const [, pg] of state.paneGroups) {
    if (pg.activeType === "pwsh" && !pg.pwsh) pg.activeType = "claude";
    if (pg.activeType === "claude" && !pg.claude) pg.activeType = "pwsh";
  }
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
        // Replace full session list (server is authoritative)
        const serverNames = new Set(msg.payload.map((s) => s.name));
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
        const orphans = new Set();
        for (const ws of state.workspaces) {
          if (!ws.layout) continue;
          for (const name of getLeafList(ws.layout)) {
            if (!serverGroups.has(name)) orphans.add(name);
          }
        }

        // Attempt to recreate orphans that have saved metadata; prune the rest
        // Orphans are group names; metadata is keyed by session name (group or group~pwsh)
        const hasMetaForGroup = (g) => state.sessionMeta.has(g) || state.sessionMeta.has(g + "~pwsh");
        const recreatable = [];
        for (const g of orphans) {
          if (state.sessionMeta.has(g)) recreatable.push(g);
          if (state.sessionMeta.has(g + "~pwsh")) recreatable.push(g + "~pwsh");
        }
        const unrecoverable = [...orphans].filter((n) => !hasMetaForGroup(n));

        // Prune leaves with no metadata (truly unknown)
        if (unrecoverable.length > 0) {
          for (const ws of state.workspaces) {
            if (!ws.layout) continue;
            const leaves = getLeafList(ws.layout);
            const alive = leaves.filter((n) => !unrecoverable.includes(n));
            if (alive.length < leaves.length) {
              ws.layout = buildBalancedTree(alive);
              updateWorkspaceTabName(ws);
            }
          }
        }

        // Recreate sessions that have metadata (async, server will re-broadcast)
        if (recreatable.length > 0) {
          recreateOrphanedSessions(recreatable);
        }


        refreshTreeRunningState();
        renderSessionsPanel();
        if (state.isDashboard) renderDashboard();
        else renderActiveWorkspace();
        break;
      }
      case "status": {
        const s = state.sessions.get(msg.session);
        if (s) {
          s.status = msg.payload.status;
          s.unreadCount = msg.payload.unreadCount;
          rebuildPaneGroups();
          updatePaneStatus(msg.session);
          refreshTreeRunningState();
          renderSessionsPanel();

          if (state.isDashboard) renderDashboard();

          // Auto-remove dead sessions after a brief flash
          if (msg.payload.status === "dead") {
            setTimeout(() => autoRemoveDeadSession(msg.session), 1500);
          }
        }
        break;
      }
      case "notification": {
        const s = state.sessions.get(msg.session);
        if (s) {
          // Don't increment unreadCount here — status-change carries the authoritative count.
          // Just trigger UI refresh to show the notification.
          updatePaneStatus(msg.session);
          renderSessionsPanel();

          if (state.isDashboard) renderDashboard();
        }
        break;
      }
    }
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
  } catch {}

  renderTree();
  renderTabs();
  if (state.isDashboard) renderDashboard();
  else renderActiveWorkspace();
}

// ===== Folder Tree =====

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
  const tree = document.getElementById("folder-tree");
  tree.innerHTML = "";

  const folderCountEl = document.querySelector(".folder-count");
  if (folderCountEl) folderCountEl.textContent = state.favorites.length > 0 ? `(${state.favorites.length})` : "";

  for (const rootPath of state.favorites) {
    const rootName = rootPath.split(/[/\\]/).filter(Boolean).pop() || rootPath;
    const rootEl = document.createElement("div");
    rootEl.className = "tree-root";

    const label = document.createElement("div");
    label.className = "tree-root-label";
    label.dataset.path = normPath(rootPath);
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
    for (const [, s] of state.sessions) {
      if (s.status !== "dead" && normPath(s.workingDir) === label.dataset.path) {
        nameSpan.classList.add("running");
        break;
      }
    }

    // Identity tag + unread badge (loaded async, inserted before action buttons)
    const identitySlot = document.createElement("span");
    identitySlot.className = "identity-slot";
    label.appendChild(identitySlot);
    fetch(`/api/folder-info?path=${encodeURIComponent(rootPath)}`)
      .then((r) => r.json())
      .then((info) => {
        if (info.hasIdentity && info.identityName) {
          const idTag = document.createElement("span");
          idTag.className = "identity-tag";
          idTag.textContent = `@${info.identityName}`;
          identitySlot.appendChild(idTag);
        }
      })
      .catch(() => {});

    // Unread badge
    const rootSessionInfo = state.sessions.get(rootName);
    const rootMatchesPath = rootSessionInfo && normPath(rootSessionInfo.workingDir) === normPath(rootPath);
    if (rootMatchesPath && rootSessionInfo.unreadCount > 0) {
      const badge = document.createElement("span");
      badge.className = "unread-badge";
      badge.textContent = `(${rootSessionInfo.unreadCount})`;
      label.appendChild(badge);
    }

    // Action buttons (hover reveal)
    const playBtn = document.createElement("button");
    playBtn.className = "play-btn";
    playBtn.innerHTML = "&#9654;";
    playBtn.title = "Open AI session (right-click for options)";
    playBtn.onclick = (e) => { e.stopPropagation(); openFolder(rootPath, rootName, getDefaultAiCommand()); };
    playBtn.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); showAiPicker(e, rootPath, rootName); };
    label.appendChild(playBtn);

    const pwshBtn = document.createElement("button");
    pwshBtn.className = "pwsh-btn";
    pwshBtn.textContent = ">_";
    pwshBtn.title = "Open PowerShell session";
    pwshBtn.onclick = (e) => { e.stopPropagation(); openFolder(rootPath, rootName, "pwsh"); };
    label.appendChild(pwshBtn);

    const codeBtn = document.createElement("button");
    codeBtn.className = "code-btn";
    codeBtn.innerHTML = "{ }";
    codeBtn.title = "Open in VS Code";
    codeBtn.onclick = (e) => {
      e.stopPropagation();
      fetch("/api/open-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: rootPath }),
      });
    };
    label.appendChild(codeBtn);

    // Indicators (loaded async)
    const indicatorSlot = document.createElement("span");
    indicatorSlot.className = "indicator-slot";
    label.appendChild(indicatorSlot);
    fetch(`/api/folder-info?path=${encodeURIComponent(rootPath)}`)
      .then((r) => r.json())
      .then((info) => {
        if (info.isClaudeReady) {
          const ind = document.createElement("span");
          ind.className = "indicator claude-ready";
          ind.textContent = "\u25c6";
          ind.title = "Has CLAUDE.md";
          indicatorSlot.appendChild(ind);
        }
        if (info.hasIdentity) {
          const ind = document.createElement("span");
          ind.className = "indicator identity";
          ind.textContent = "\u25cf";
          ind.title = `Identity: ${info.identityName || "yes"}`;
          indicatorSlot.appendChild(ind);
        }
      })
      .catch(() => {});

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

async function toggleExpand(path) {
  if (state.expandedPaths.has(path)) {
    state.expandedPaths.delete(path);
  } else {
    state.expandedPaths.add(path);
  }
  saveExpandedPaths();
  renderTree();
}

async function loadAndRenderChildren(parentPath, container, depth) {
  const entries = await fetchChildren(parentPath);
  container.innerHTML = "";

  for (const entry of entries) {
    if (!entry.isDir) continue;

    const node = document.createElement("div");

    // The clickable row
    const row = document.createElement("div");
    row.className = "tree-node";
    row.dataset.path = normPath(entry.path);
    for (const [, s] of state.sessions) {
      if (s.status !== "dead" && normPath(s.workingDir) === row.dataset.path) {
        row.classList.add("running");
        break;
      }
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

    // Identity tag (matches sessions panel order)
    if (entry.hasIdentity) {
      const idTag = document.createElement("span");
      idTag.className = "identity-tag";
      idTag.textContent = `@${entry.identityName || "?"}`;
      row.appendChild(idTag);
    }

    // Unread badge (matches sessions panel: between identity and action tags)
    const sessionInfo = state.sessions.get(entry.name);
    const sessionMatchesPath = sessionInfo && normPath(sessionInfo.workingDir) === normPath(entry.path);
    if (sessionMatchesPath && sessionInfo.unreadCount > 0) {
      const badge = document.createElement("span");
      badge.className = "unread-badge";
      badge.textContent = `(${sessionInfo.unreadCount})`;
      row.appendChild(badge);
    }

    // AI play button (hover reveal)
    const playBtn = document.createElement("button");
    playBtn.className = "play-btn";
    playBtn.innerHTML = "&#9654;";
    playBtn.title = "Open AI session (right-click for options)";
    playBtn.onclick = (e) => { e.stopPropagation(); openFolder(entry.path, entry.name, getDefaultAiCommand()); };
    playBtn.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); showAiPicker(e, entry.path, entry.name); };
    row.appendChild(playBtn);

    // PowerShell button (hover reveal)
    const pwshBtn = document.createElement("button");
    pwshBtn.className = "pwsh-btn";
    pwshBtn.textContent = ">_";
    pwshBtn.title = "Open PowerShell session";
    pwshBtn.onclick = (e) => { e.stopPropagation(); openFolder(entry.path, entry.name, "pwsh"); };
    row.appendChild(pwshBtn);

    // VS Code button (hover reveal)
    const codeBtn = document.createElement("button");
    codeBtn.className = "code-btn";
    codeBtn.innerHTML = "{ }";
    codeBtn.title = "Open in VS Code";
    codeBtn.onclick = (e) => {
      e.stopPropagation();
      fetch("/api/open-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: entry.path }),
      });
    };
    row.appendChild(codeBtn);

    // Indicators (in slot, matching sessions panel)
    const indicatorSlot = document.createElement("span");
    indicatorSlot.className = "indicator-slot";
    row.appendChild(indicatorSlot);
    if (entry.isClaudeReady) {
      const ind = document.createElement("span");
      ind.className = "indicator claude-ready";
      ind.textContent = "\u25c6";
      ind.title = "Has CLAUDE.md";
      indicatorSlot.appendChild(ind);
    }
    if (entry.hasIdentity) {
      const ind = document.createElement("span");
      ind.className = "indicator identity";
      ind.textContent = "\u25cf";
      ind.title = `Identity: ${entry.identityName || "yes"}`;
      indicatorSlot.appendChild(ind);
    }

    // Row click = expand/collapse
    row.onclick = () => toggleExpand(entry.path);
    row.addEventListener("contextmenu", (e) => showContextMenu(e, entry.path));

    node.appendChild(row);

    // Children container
    const childContainer = document.createElement("div");
    childContainer.className = `tree-children ${isExpanded ? "expanded" : ""}`;
    node.appendChild(childContainer);

    container.appendChild(node);

    if (isExpanded) loadAndRenderChildren(entry.path, childContainer, depth + 1);
  }
}
function normPath(p) {
  return p ? p.replace(/\\/g, "/").toLowerCase() : "";
}

function refreshTreeRunningState() {
  const running = new Set();
  const unread = new Set();
  for (const [, s] of state.sessions) {
    if (s.status !== "dead" && s.workingDir) running.add(normPath(s.workingDir));
    if (s.unreadCount > 0 && s.workingDir) unread.add(normPath(s.workingDir));
  }
  // Child folder nodes
  document.querySelectorAll(".tree-node[data-path]").forEach((node) => {
    node.classList.toggle("running", running.has(node.dataset.path));
    const dot = node.querySelector(".unread-dot");
    if (dot) dot.classList.toggle("show", unread.has(node.dataset.path));
  });
  // Root folder labels
  document.querySelectorAll(".tree-root-label[data-path]").forEach((label) => {
    const nameSpan = label.querySelector(".root-name");
    if (nameSpan) nameSpan.classList.toggle("running", running.has(label.dataset.path));
    const dot = label.querySelector(".unread-dot");
    if (dot) dot.classList.toggle("show", unread.has(label.dataset.path));
  });
}

function cssId(path) {
  return path.replace(/[^a-zA-Z0-9]/g, "_");
}

// ===== Sessions Panel =====

function renderSessionsPanel() {
  const list = document.getElementById("sessions-list");
  const countEl = document.querySelector(".session-count");
  if (!list) return;

  // Build list of active groups
  const groups = [];
  for (const [group, pg] of state.paneGroups) {
    const claudeInfo = pg.claude ? state.sessions.get(pg.claude) : null;
    const pwshInfo = pg.pwsh ? state.sessions.get(pg.pwsh) : null;
    const claudeAlive = claudeInfo && claudeInfo.status !== "dead";
    const pwshAlive = pwshInfo && pwshInfo.status !== "dead";
    if (!claudeAlive && !pwshAlive) continue;
    const workingDir = (claudeInfo || pwshInfo).workingDir;
    groups.push({ group, pg, claudeInfo, pwshInfo, claudeAlive, pwshAlive, workingDir });
  }

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
    row.dataset.group = g.group;

    // Status dot — worst-of status across group
    const bestStatus = g.claudeAlive && g.claudeInfo.status === "busy" || g.pwshAlive && g.pwshInfo.status === "busy"
      ? "busy" : g.claudeAlive && g.claudeInfo.status === "starting" || g.pwshAlive && g.pwshInfo.status === "starting"
      ? "starting" : "idle";
    const dot = document.createElement("span");
    dot.className = `status-dot ${bestStatus}`;
    row.appendChild(dot);

    // Name
    const name = document.createElement("span");
    name.className = "session-name";
    name.textContent = g.group;
    row.appendChild(name);

    // Identity tag
    const identity = (g.claudeInfo || g.pwshInfo)?.emcomIdentity;
    if (identity) {
      const idTag = document.createElement("span");
      idTag.className = "identity-tag";
      idTag.textContent = `@${identity}`;
      row.appendChild(idTag);
    }

    // Unread badge (between identity and action tags)
    const totalUnread = (g.claudeAlive ? g.claudeInfo.unreadCount || 0 : 0)
      + (g.pwshAlive ? g.pwshInfo.unreadCount || 0 : 0);
    if (totalUnread > 0) {
      const badge = document.createElement("span");
      badge.className = "unread-badge";
      badge.textContent = `(${totalUnread})`;
      row.appendChild(badge);
    }

    // AI tag (shows icon of running preset, or default when absent)
    const aiPreset = g.claudeAlive ? getAiPresetForCommand(g.claudeInfo.command) : state.aiPresets[state.aiDefaultIndex];
    const cTag = document.createElement("span");
    cTag.className = `cmd-tag ${g.claudeAlive ? "alive" : "absent"}`;
    cTag.textContent = aiPreset.icon;
    cTag.title = g.claudeAlive ? `${aiPreset.name}: ${g.claudeInfo.status}` : `Start ${aiPreset.name} (right-click for options)`;
    if (!g.claudeAlive) {
      cTag.onclick = (e) => { e.stopPropagation(); openFolder(g.workingDir, g.group, getDefaultAiCommand()); };
      cTag.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); showAiPicker(e, g.workingDir, g.group); };
    }
    row.appendChild(cTag);

    // PowerShell tag
    const pTag = document.createElement("span");
    pTag.className = `cmd-tag ${g.pwshAlive ? "alive pwsh" : "absent"}`;
    pTag.textContent = ">_";
    pTag.title = g.pwshAlive ? `PowerShell: ${g.pwshInfo.status}` : "Start PowerShell";
    if (!g.pwshAlive) {
      pTag.onclick = (e) => { e.stopPropagation(); openFolder(g.workingDir, g.group, "pwsh"); };
    }
    row.appendChild(pTag);

    // VS Code tag
    const codeTag = document.createElement("span");
    codeTag.className = "cmd-tag code";
    codeTag.textContent = "{ }";
    codeTag.title = "Open in VS Code";
    codeTag.onclick = (e) => {
      e.stopPropagation();
      fetch("/api/open-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: g.workingDir }),
      });
    };
    row.appendChild(codeTag);

    // Indicators (async, cached)
    const indicatorSlot = document.createElement("span");
    indicatorSlot.className = "indicator-slot";
    row.appendChild(indicatorSlot);
    const cacheKey = normPath(g.workingDir);
    if (state.folderInfoCache.has(cacheKey)) {
      appendIndicators(indicatorSlot, state.folderInfoCache.get(cacheKey));
    } else {
      fetch(`/api/folder-info?path=${encodeURIComponent(g.workingDir)}`)
        .then((r) => r.json())
        .then((info) => {
          state.folderInfoCache.set(cacheKey, info);
          appendIndicators(indicatorSlot, info);
        })
        .catch(() => {});
    }

    // Kill button
    const killBtn = document.createElement("button");
    killBtn.className = "kill-btn";
    killBtn.textContent = "\u00d7";
    killBtn.title = "Kill all sessions in group";
    killBtn.onclick = (e) => {
      e.stopPropagation();
      if (g.claudeAlive) killSession(g.pg.claude);
      if (g.pwshAlive) killSession(g.pg.pwsh);
    };
    row.appendChild(killBtn);

    // Click row → focus active session
    const activeName = g.pg.activeType === "pwsh" && g.pwshAlive ? g.pg.pwsh
      : g.claudeAlive ? g.pg.claude : g.pg.pwsh;
    row.onclick = () => focusExistingSession(activeName);
    list.appendChild(row);
  }
}

function appendIndicators(slot, info) {
  if (info.isClaudeReady) {
    const ind = document.createElement("span");
    ind.className = "indicator claude-ready";
    ind.textContent = "\u25c6";
    ind.title = "Has CLAUDE.md";
    slot.appendChild(ind);
  }
  if (info.hasIdentity) {
    const ind = document.createElement("span");
    ind.className = "indicator identity";
    ind.textContent = "\u25cf";
    ind.title = `Identity: ${info.identityName || "yes"}`;
    slot.appendChild(ind);
  }
}

// Sessions panel collapse toggle
(() => {
  const header = document.getElementById("sessions-panel-header");
  const body = document.getElementById("sessions-list");
  const arrow = header?.querySelector(".arrow");
  const stored = localStorage.getItem("pty-win-sessions-expanded");
  if (stored === "false") {
    body?.classList.remove("expanded");
    arrow?.classList.remove("expanded");
  }
  header?.addEventListener("click", () => {
    const isExpanded = body.classList.toggle("expanded");
    arrow.classList.toggle("expanded", isExpanded);
    localStorage.setItem("pty-win-sessions-expanded", isExpanded);
  });
})();

// Folders panel collapse toggle
(() => {
  const header = document.getElementById("folders-panel-header");
  const body = document.getElementById("folder-tree");
  const arrow = header?.querySelector(".arrow");
  const stored = localStorage.getItem("pty-win-folders-expanded");
  if (stored === "false") {
    body?.classList.remove("expanded");
    arrow?.classList.remove("expanded");
  }
  header?.addEventListener("click", (e) => {
    if (e.target.closest(".panel-actions")) return; // don't toggle when clicking buttons
    const isExpanded = body.classList.toggle("expanded");
    arrow.classList.toggle("expanded", isExpanded);
    localStorage.setItem("pty-win-folders-expanded", isExpanded);
  });
})();

// ===== Session Recreation =====

let recreationInProgress = false;

async function recreateOrphanedSessions(names) {
  if (recreationInProgress) return;
  recreationInProgress = true;

  const mainEl = document.getElementById("main");
  const charW = 7.6, charH = 18;
  const availW = (mainEl?.clientWidth || 800) - 4;
  const availH = (mainEl?.clientHeight || 600) - 35 - 26 - 22 - 4;
  const cols = Math.max(80, Math.floor(availW / charW));
  const rows = Math.max(24, Math.floor(availH / charH));

  for (const name of names) {
    const meta = state.sessionMeta.get(name);
    if (!meta) continue;

    try {
      const isClaude = !meta.command || meta.command === "claude";
      const body = { workingDir: meta.workingDir, cols, rows };
      if (meta.command && meta.command !== "claude") body.command = meta.command;
      if (isClaude) body.args = ["--continue"];

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.warn(`Failed to recreate session "${name}":`, await res.text());
        pruneFailedSession(name);
      }
      // Success: server will broadcast updated sessions list, triggering re-render
    } catch (err) {
      console.warn(`Error recreating session "${name}":`, err);
      pruneFailedSession(name);
    }
  }

  recreationInProgress = false;
}

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

/** Open a folder as a session, optionally forcing a new workspace */
async function openFolder(folderPath, folderName, command, newWorkspace = false) {
  const baseName = folderName || folderPath.split(/[/\\]/).filter(Boolean).pop();
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
    const mainEl = document.getElementById("main");
    const charW = 7.6, charH = 18; // approximate character dimensions for Consolas 13px
    const availW = (mainEl?.clientWidth || 800) - 4; // minus pane borders
    const availH = (mainEl?.clientHeight || 600) - 35 - 26 - 22 - 4; // minus tabbar, topbar, statusbar, borders
    const cols = Math.max(80, Math.floor(availW / charW));
    const rows = Math.max(24, Math.floor(availH / charH));

    const body = { workingDir: folderPath, cols, rows };
    if (command) body.command = command;
    else body.command = getDefaultAiCommand();

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

    const data = await res.json();

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
    let ws = newWorkspace ? createWorkspace(baseName) : getOrCreateActiveWorkspace();
    addSessionToWorkspace(ws.id, baseName);
    switchToWorkspace(ws.id);
    renderActiveWorkspace();
    focusPane(baseName);
    updateWorkspaceTabName(ws);
  } catch (err) {
    alert("Failed to create session");
  }
}

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
    ws.lastFocusedPane = groupName;
    switchToWorkspace(ws.id);
  } else {
    // Not in any workspace — tile into active workspace
    const activeWs = getOrCreateActiveWorkspace();
    addSessionToWorkspace(activeWs.id, groupName);
    activeWs.lastFocusedPane = groupName;
    switchToWorkspace(activeWs.id);
    updateWorkspaceTabName(activeWs);
  }
}

/** Update workspace tab name based on its sessions */
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

function showContextMenu(e, path) {
  e.preventDefault();
  e.stopPropagation();
  state.ctxTarget = path;

  const menu = document.getElementById("context-menu");
  const isFav = state.favorites.includes(path);

  menu.querySelector('[data-action="fav-add"]').style.display = isFav ? "none" : "";
  menu.querySelector('[data-action="fav-remove"]').style.display = isFav ? "" : "none";

  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
  menu.classList.remove("hidden");
}

document.addEventListener("click", () => {
  document.getElementById("context-menu").classList.add("hidden");
});

document.getElementById("context-menu").addEventListener("click", async (e) => {
  const action = e.target.closest(".ctx-item")?.dataset.action;
  if (!action || !state.ctxTarget) return;

  const path = state.ctxTarget;
  const name = path.split(/[/\\]/).filter(Boolean).pop();

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
      } catch (err) { alert("Failed to create folder: " + err.message); }
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
  }

  document.getElementById("context-menu").classList.add("hidden");
});

// ===== Quick-Open (Ctrl+P) =====

function openQuickOpen() {
  const overlay = document.getElementById("quick-open");
  const input = document.getElementById("quick-open-input");
  overlay.classList.remove("hidden");
  input.value = "";
  input.focus();
  renderQuickOpenResults("");
}

function closeQuickOpen() {
  document.getElementById("quick-open").classList.add("hidden");
}

function renderQuickOpenResults(query) {
  const container = document.getElementById("quick-open-results");
  container.innerHTML = "";

  const q = query.toLowerCase();
  const matches = state.visitedFolders
    .filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
    .slice(0, 20);

  for (let i = 0; i < matches.length; i++) {
    const f = matches[i];
    const row = document.createElement("div");
    row.className = `qo-result ${i === 0 ? "selected" : ""}`;
    row.dataset.idx = String(i);

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

document.getElementById("quick-open-input").addEventListener("input", (e) => {
  renderQuickOpenResults(e.target.value);
});

document.getElementById("quick-open-input").addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeQuickOpen(); return; }
  if (e.key === "Enter") {
    const selected = document.querySelector(".qo-result.selected");
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

document.getElementById("quick-open").addEventListener("click", (e) => {
  if (e.target === document.getElementById("quick-open")) closeQuickOpen();
});

// ===== Sidebar Toggle =====

function toggleSidebar() {
  state.sidebarVisible = !state.sidebarVisible;
  document.getElementById("sidebar").classList.toggle("hidden", !state.sidebarVisible);
  document.getElementById("sidebar-strip").classList.toggle("hidden", state.sidebarVisible);
  // Refit terminals
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (ws?.layout) requestAnimationFrame(() => fitAllTerminals(ws.layout));
}

document.getElementById("btn-collapse").onclick = toggleSidebar;
document.getElementById("btn-expand").onclick = toggleSidebar;

function refreshTree() { state.folderCache.clear(); renderTree(); }
document.getElementById("btn-refresh").onclick = refreshTree;

document.getElementById("btn-collapse-all").onclick = () => {
  state.expandedPaths.clear();
  saveExpandedPaths();
  renderTree();
};

// Sidebar resize handle
(() => {
  const handle = document.getElementById("sidebar-resize-handle");
  const sidebar = document.getElementById("sidebar");
  if (!handle || !sidebar) return;

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (e) => {
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

document.getElementById("btn-add-root").onclick = () => {
  const path = prompt("Enter folder path to add as root:");
  if (path && !state.favorites.includes(path)) {
    state.favorites.push(path);
    saveFavorites();
    state.expandedPaths.add(path);
    renderTree();
  }
};

// ===== Workspaces =====

function createWorkspace(name) {
  const id = `ws-${nextWorkspaceId++}`;
  const ws = { id, name: name || `Workspace ${nextWorkspaceId - 1}`, layout: null };
  state.workspaces.push(ws);
  renderTabs();
  return ws;
}

function switchToWorkspace(id) {
  // Save focused pane for current workspace
  if (state.activeWorkspaceId) {
    const prevWs = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    if (prevWs) prevWs.lastFocusedPane = state.focusedPane;
  }

  state.activeWorkspaceId = id;
  state.isDashboard = false;

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
    focusPane(state.focusedPane);
    // Terminal DOM needs a frame to be ready for keyboard focus
    requestAnimationFrame(() => {
      const pg = state.paneGroups.get(state.focusedPane);
      const name = pg ? (pg.activeType === "pwsh" ? pg.pwsh : pg.claude) : state.focusedPane;
      const entry = state.terminals.get(name || state.focusedPane);
      if (entry) entry.term.focus();
    });
  }
}

function switchToDashboard() {
  state.activeWorkspaceId = null;
  state.isDashboard = true;
  renderTabs();
  renderDashboard();
}

function findWorkspaceContaining(sessionName) {
  for (const ws of state.workspaces) {
    if (ws.layout && treeContains(ws.layout, sessionName)) return ws;
  }
  return null;
}

function treeContains(node, sessionName) {
  if (node.type === "leaf") return node.session === sessionName;
  return treeContains(node.children[0], sessionName) || treeContains(node.children[1], sessionName);
}

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
  const tabsEl = document.getElementById("tabs");
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
    close.onclick = (e) => { e.stopPropagation(); removeWorkspace(ws.id); };
    tab.appendChild(close);

    // Single-click delayed to allow double-click to cancel it
    let clickTimer = null;
    tab.onclick = () => {
      if (clickTimer) return; // already pending
      clickTimer = setTimeout(() => {
        clickTimer = null;
        switchToWorkspace(ws.id);
      }, 250);
    };

    // Double-click to rename
    label.ondblclick = (e) => {
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
      input.onkeydown = (ev) => {
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
  tabsEl.appendChild(addBtn);
}

// ===== Tiling =====

function addSessionToWorkspace(workspaceId, sessionName) {
  const ws = state.workspaces.find((w) => w.id === workspaceId);
  if (!ws) return;

  // Collect existing sessions + new one, rebuild balanced layout
  const existing = ws.layout ? getLeafList(ws.layout) : [];
  existing.push(sessionName);
  ws.layout = buildBalancedTree(existing);
}

/** Build a balanced binary tree from a list of session names */
function buildBalancedTree(sessions) {
  if (sessions.length === 0) return null;
  if (sessions.length === 1) return { type: "leaf", session: sessions[0] };

  const mid = Math.ceil(sessions.length / 2);
  const left = sessions.slice(0, mid);
  const right = sessions.slice(mid);

  // Top-level: vertical split (rows). Within rows: horizontal split (columns).
  const direction = sessions.length <= 2 ? "h" : "v";
  return {
    type: "split",
    direction,
    ratio: mid / sessions.length,
    children: [buildBalancedTree(left), buildBalancedTree(right)],
  };
}

function countLeaves(node) {
  if (node.type === "leaf") return 1;
  return countLeaves(node.children[0]) + countLeaves(node.children[1]);
}

function removeSessionFromLayout(node, sessionName) {
  if (!node) return null;
  if (node.type === "leaf") return node.session === sessionName ? null : node;
  const left = removeSessionFromLayout(node.children[0], sessionName);
  const right = removeSessionFromLayout(node.children[1], sessionName);
  if (!left && !right) return null;
  if (!left) return right;
  if (!right) return left;
  return { ...node, children: [left, right] };
}

function renderActiveWorkspace() {
  const area = document.getElementById("workspace-area");
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

function setupDragHandle(handle, node, container) {
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    handle.classList.add("dragging");
    document.body.style.cursor = node.direction === "h" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    const startPos = node.direction === "h" ? e.clientX : e.clientY;
    const startRatio = node.ratio;
    const totalSize = node.direction === "h" ? container.offsetWidth : container.offsetHeight;

    const onMove = (e) => {
      const delta = (node.direction === "h" ? e.clientX : e.clientY) - startPos;
      node.ratio = Math.max(0.15, Math.min(0.85, startRatio + delta / totalSize));
      const children = container.querySelectorAll(":scope > .split-child");
      if (children[0]) children[0].style.flex = `${node.ratio} 0 0%`;
      if (children[1]) children[1].style.flex = `${1 - node.ratio} 0 0%`;
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

function createPane(groupName) {
  // Resolve which session to show via pane group
  const pg = state.paneGroups.get(groupName);
  const activeType = pg?.activeType || "claude";
  const activeSessionName = activeType === "pwsh" ? (pg?.pwsh || groupName) : (pg?.claude || groupName);
  const info = state.sessions.get(activeSessionName);
  const hasBoth = pg?.claude && pg?.pwsh;

  const pane = document.createElement("div");
  pane.className = `pane ${groupName === state.focusedPane ? "focused" : ""} ${info?.status === "dead" ? "dead" : ""}`;
  pane.dataset.session = groupName;
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

  const identity = info?.emcomIdentity ? `<span class="pane-identity">@${info.emcomIdentity}</span>` : "";
  topbar.innerHTML = `
    <span class="pane-name">${groupName}</span>
    ${toggleHtml}
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

  topbar.querySelector(".pane-close").onclick = (e) => {
    e.stopPropagation();
    killSession(activeSessionName);
  };

  topbar.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showPaneContextMenu(e, groupName);
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
  statusbar.innerHTML = `
    <span class="status-dot ${status}"></span>
    <span class="pane-status-label">${status}</span>
    <span class="pane-unread ${unread > 0 ? "show" : ""}">${unread}</span>
  `;
  pane.appendChild(statusbar);

  // Create or reattach xterm for the active session
  let entry = ensureTerminal(activeSessionName);

  // Fit terminal and explicitly notify server of new dimensions
  const fitAndSync = () => {
    try {
      entry.fitAddon.fit();
      const { cols, rows } = entry.term;
      state.ws?.send(JSON.stringify({ type: "resize", session: activeSessionName, payload: { cols, rows } }));
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
    fitAndSync();
    setTimeout(fitAndSync, 150);

    if (!entry.resizeObserver) {
      entry.resizeObserver = new ResizeObserver(fitAndSync);
      entry.resizeObserver.observe(termArea);
    } else {
      entry.resizeObserver.disconnect();
      entry.resizeObserver.observe(termArea);
    }
  });

  return pane;
}

function ensureTerminal(sessionName) {
  let entry = state.terminals.get(sessionName);
  if (entry) return entry;

  const term = new window.Terminal({
    theme: TERM_THEME,
    fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: true,
    allowProposedApi: true,
  });

  const fitAddon = new window.FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new window.WebLinksAddon.WebLinksAddon());

  term.onData((data) => {
    state.ws?.send(JSON.stringify({ type: "input", session: sessionName, payload: data }));
  });

  term.onResize(({ cols, rows }) => {
    state.ws?.send(JSON.stringify({ type: "resize", session: sessionName, payload: { cols, rows } }));
  });

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;
    if (e.ctrlKey && e.shiftKey) {
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

function switchPaneType(groupName, type) {
  const pg = state.paneGroups.get(groupName);
  if (!pg) return;
  pg.activeType = type;
  renderActiveWorkspace();
  focusPane(groupName);
}

function showAiPicker(e, folderPath, folderName) {
  const menu = document.getElementById("pane-context-menu");
  menu.innerHTML = "";
  menu.classList.remove("hidden");
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  for (let i = 0; i < state.aiPresets.length; i++) {
    const preset = state.aiPresets[i];
    const isDefault = i === state.aiDefaultIndex;
    const item = document.createElement("div");
    item.className = "ctx-item ai-picker-item";
    item.innerHTML = `<span class="default-star">${isDefault ? "\u2605" : ""}</span> ${preset.name} <span class="ai-icon">${preset.icon}</span>`;
    item.onclick = () => {
      menu.classList.add("hidden");
      openFolder(folderPath, folderName, preset.command);
    };
    item.oncontextmenu = (ev) => {
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

  const close = (ev) => {
    if (!menu.contains(ev.target)) {
      menu.classList.add("hidden");
      document.removeEventListener("mousedown", close);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}

function showPaneContextMenu(e, groupName) {
  const menu = document.getElementById("pane-context-menu");
  menu.innerHTML = "";
  menu.classList.remove("hidden");
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  const currentWs = findWorkspaceContaining(groupName);

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
  const close = (ev) => {
    if (!menu.contains(ev.target)) {
      menu.classList.add("hidden");
      document.removeEventListener("mousedown", close);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}

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
    if (dot) dot.className = `status-dot ${info.status}`;
    if (label) label.textContent = info.status;
    if (unread) {
      unread.textContent = String(info.unreadCount);
      unread.classList.toggle("show", info.unreadCount > 0);
    }
    pane.classList.toggle("dead", info.status === "dead");
  });
}

function focusPane(groupName) {
  state.focusedPane = groupName;
  document.querySelectorAll(".pane").forEach((p) => {
    p.classList.toggle("focused", p.dataset.session === groupName);
  });
  // Update sessions panel highlight
  document.querySelectorAll(".session-row").forEach((r) => r.classList.remove("active"));
  document.querySelector(`.session-row[data-group="${groupName}"]`)?.classList.add("active");
  // Focus the active session's terminal
  const pg = state.paneGroups.get(groupName);
  const activeSessionName = pg ? (pg.activeType === "pwsh" ? pg.pwsh : pg.claude) : groupName;
  const entry = state.terminals.get(activeSessionName || groupName);
  if (entry) entry.term.focus();
}

function truncatePath(p) {
  if (!p) return "";
  const parts = p.replace(/\\/g, "/").split("/");
  if (parts.length <= 3) return p;
  return ".../" + parts.slice(-2).join("/");
}

// ===== Navigation =====

function getLeafList(node, list = []) {
  if (!node) return list;
  if (node.type === "leaf") { list.push(node.session); return list; }
  getLeafList(node.children[0], list);
  getLeafList(node.children[1], list);
  return list;
}

function navigatePanes(arrowKey) {
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (!ws?.layout) return;
  const leaves = getLeafList(ws.layout);
  if (!leaves.length) return;
  const idx = leaves.indexOf(state.focusedPane);
  const newIdx = (arrowKey === "ArrowRight" || arrowKey === "ArrowDown")
    ? (idx + 1) % leaves.length
    : (idx - 1 + leaves.length) % leaves.length;
  focusPane(leaves[newIdx]);
}

function resizeFocused(arrowKey) {
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (!ws?.layout || ws.layout.type !== "split") return;
  const splitNode = findParentSplit(ws.layout, state.focusedPane);
  if (!splitNode) return;
  const delta = 0.05;
  splitNode.ratio = (arrowKey === "ArrowRight" || arrowKey === "ArrowDown")
    ? Math.min(0.85, splitNode.ratio + delta)
    : Math.max(0.15, splitNode.ratio - delta);
  renderActiveWorkspace();
}

function findParentSplit(node, sessionName) {
  if (node.type === "leaf") return null;
  for (const child of node.children) {
    if (child.type === "leaf" && child.session === sessionName) return node;
    const found = findParentSplit(child, sessionName);
    if (found) return found;
  }
  return null;
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

async function killSession(sessionName) {
  try {
    await fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: "DELETE" });
  } catch {}

  // Determine group — only remove tiling leaf if no sibling alive
  const groupName = sessionName.replace(/~pwsh$/, "");
  const siblingName = sessionName.endsWith("~pwsh") ? groupName : groupName + "~pwsh";
  const siblingAlive = state.sessions.has(siblingName) && state.sessions.get(siblingName).status !== "dead";

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

function autoRemoveDeadSession(sessionName) {
  // Check it's still dead (not restarted)
  const s = state.sessions.get(sessionName);
  if (!s || s.status !== "dead") return;

  // Delete from server so the name can be reused
  fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: "DELETE" }).catch(() => {});

  const groupName = sessionName.replace(/~pwsh$/, "");
  const siblingName = sessionName.endsWith("~pwsh") ? groupName : groupName + "~pwsh";
  const siblingAlive = state.sessions.has(siblingName) && state.sessions.get(siblingName).status !== "dead";

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
  const area = document.getElementById("workspace-area");
  area.innerHTML = "";

  const dash = document.createElement("div");
  dash.className = "dashboard active";
  area.appendChild(dash);

  if (state.sessions.size === 0) {
    dash.innerHTML = `
      <div class="dashboard-empty">
        No sessions running.<br><br>
        Use the folder browser or press <kbd>Ctrl+P</kbd> to open a folder.
      </div>
    `;
    return;
  }

  for (const [name, info] of state.sessions) {
    const card = document.createElement("div");
    card.className = "dashboard-card";
    const unread = info.unreadCount || 0;
    card.innerHTML = `
      <div class="dashboard-card-header">
        <span class="status-dot ${info.status}"></span>
        <span class="dashboard-card-name">${name}</span>
        <span class="dashboard-card-identity">${info.emcomIdentity ? "@" + info.emcomIdentity : info.command}</span>
        <span class="dashboard-card-badge ${unread > 0 ? "show" : ""}">${unread}</span>
      </div>
      <div class="dashboard-card-preview" id="preview-${CSS.escape(name)}">Loading...</div>
    `;
    card.onclick = () => focusExistingSession(name);
    dash.appendChild(card);
    loadSnapshot(name);
  }
}

async function loadSnapshot(sessionName) {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/snapshot?lines=8`);
    const data = await res.json();
    const el = document.getElementById(`preview-${CSS.escape(sessionName)}`);
    if (el) el.textContent = data.lines.join("\n") || "(no output yet)";
  } catch {}
}

// ===== Modal =====

function openModal() {
  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("m-path").value = "";
  document.getElementById("m-cmd").value = "claude";
  document.getElementById("m-path").focus();
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

document.getElementById("m-cancel").onclick = closeModal;
document.getElementById("m-create").onclick = () => {
  const path = document.getElementById("m-path").value.trim();
  const cmd = document.getElementById("m-cmd").value.trim() || undefined;
  if (!path) { alert("Path is required."); return; }
  closeModal();
  openFolder(path, null, cmd);
};
document.getElementById("modal-overlay").onclick = (e) => {
  if (e.target === document.getElementById("modal-overlay")) closeModal();
};
document.getElementById("m-path").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("m-create").click();
  if (e.key === "Escape") closeModal();
});

// ===== Global keyboard shortcuts =====

document.addEventListener("keydown", (e) => {
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
state.expandedPaths = loadExpandedPaths();
// Auto-expand favorites that haven't been explicitly collapsed
for (const f of state.favorites) {
  if (!state.expandedPaths.has(f) && state.expandedPaths.size === 0) {
    state.expandedPaths.add(f);
  }
}

// Restore sidebar width
const savedWidth = loadSidebarWidth();
document.getElementById("sidebar").style.width = `${savedWidth}px`;

// Restore workspaces (layouts referencing sessions — terminals reconnect via WS)
const savedWs = loadWorkspaces();
if (savedWs) {
  state.workspaces = savedWs.workspaces || [];
  state.activeWorkspaceId = savedWs.activeWorkspaceId || null;
  state.isDashboard = savedWs.isDashboard !== false;
  nextWorkspaceId = savedWs.nextId || 1;
}
state.sessionMeta = loadSessionMeta();

renderTabs();
if (state.isDashboard) renderDashboard();
else renderActiveWorkspace();
connect();
