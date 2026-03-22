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
};

let nextWorkspaceId = 1;

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

        // Prune workspace layouts: remove leaves for sessions that no longer exist
        for (const ws of state.workspaces) {
          if (!ws.layout) continue;
          const leaves = getLeafList(ws.layout);
          const alive = leaves.filter((n) => serverNames.has(n));
          if (alive.length < leaves.length) {
            ws.layout = buildBalancedTree(alive);
            updateWorkspaceTabName(ws);
          }
        }

        refreshTreeRunningState();
        if (state.isDashboard) renderDashboard();
        else renderActiveWorkspace();
        break;
      }
      case "status": {
        const s = state.sessions.get(msg.session);
        if (s) {
          s.status = msg.payload.status;
          s.unreadCount = msg.payload.unreadCount;
          updatePaneStatus(msg.session);
          refreshTreeRunningState();
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
          s.unreadCount = (s.unreadCount || 0) + msg.payload.count;
          updatePaneStatus(msg.session);
          refreshTreeRunningState();
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

  for (const rootPath of state.favorites) {
    const rootName = rootPath.split(/[/\\]/).filter(Boolean).pop() || rootPath;
    const rootEl = document.createElement("div");
    rootEl.className = "tree-root";

    const label = document.createElement("div");
    label.className = "tree-root-label";
    const expanded = state.expandedPaths.has(rootPath);
    label.innerHTML = `<span class="arrow ${expanded ? "expanded" : ""}"></span> ${rootName.toUpperCase()}`;
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
    const sessionRunning = state.sessions.has(entry.name);
    if (sessionRunning) row.classList.add("running");

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

    // Indicators
    if (entry.hasIdentity) {
      const ind = document.createElement("span");
      ind.className = "indicator identity";
      ind.textContent = "\u25cf";
      ind.title = `Identity: ${entry.identityName || "yes"}`;
      row.appendChild(ind);
    }
    if (entry.isClaudeReady) {
      const ind = document.createElement("span");
      ind.className = "indicator claude-ready";
      ind.textContent = "\u25c6";
      ind.title = "Has CLAUDE.md";
      row.appendChild(ind);
    }

    // Unread dot
    const sessionInfo = state.sessions.get(entry.name);
    const unreadDot = document.createElement("span");
    unreadDot.className = `unread-dot ${sessionInfo?.unreadCount > 0 ? "show" : ""}`;
    row.appendChild(unreadDot);

    // Play button (hover reveal)
    const playBtn = document.createElement("button");
    playBtn.className = "play-btn";
    playBtn.innerHTML = "&#9654;";
    playBtn.title = "Open session";
    playBtn.onclick = (e) => {
      e.stopPropagation();
      openFolder(entry.path, entry.name);
    };
    row.appendChild(playBtn);

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

function refreshTreeRunningState() {
  document.querySelectorAll(".tree-node").forEach((node) => {
    const nameEl = node.querySelector(".folder-name");
    if (!nameEl) return;
    const name = nameEl.textContent;
    const session = state.sessions.get(name);
    node.classList.toggle("running", !!session && session.status !== "dead");
  });
}

function cssId(path) {
  return path.replace(/[^a-zA-Z0-9]/g, "_");
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
  const name = folderName || folderPath.split(/[/\\]/).filter(Boolean).pop();

  // If session exists and alive, just focus it
  const existing = state.sessions.get(name);
  if (existing && existing.status !== "dead") {
    focusExistingSession(name);
    return;
  }

  // If dead session with same name exists, clean it up first
  if (existing && existing.status === "dead") {
    await fetch(`/api/sessions/${encodeURIComponent(name)}`, { method: "DELETE" }).catch(() => {});
    state.sessions.delete(name);
    const entry = state.terminals.get(name);
    if (entry) {
      entry.resizeObserver?.disconnect();
      entry.term.dispose();
      entry.wrapperEl?.remove();
      state.terminals.delete(name);
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

    // Always tile into the active workspace (or create one if none)
    let ws = newWorkspace ? createWorkspace(data.name) : getOrCreateActiveWorkspace();
    addSessionToWorkspace(ws.id, data.name);
    switchToWorkspace(ws.id);
    renderActiveWorkspace();
    focusPane(data.name);
    updateWorkspaceTabName(ws);
  } catch (err) {
    alert("Failed to create session");
  }
}

function focusExistingSession(name) {
  // Find workspace containing this session
  const ws = findWorkspaceContaining(name);
  if (ws) {
    switchToWorkspace(ws.id);
    focusPane(name);
  } else {
    // Not in any workspace — tile into active workspace
    const activeWs = getOrCreateActiveWorkspace();
    addSessionToWorkspace(activeWs.id, name);
    switchToWorkspace(activeWs.id);
    renderActiveWorkspace();
    focusPane(name);
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

document.getElementById("context-menu").addEventListener("click", (e) => {
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
  state.activeWorkspaceId = id;
  state.isDashboard = false;
  renderTabs();
  renderActiveWorkspace();
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
    const entry = state.terminals.get(node.session);
    if (entry) { try { entry.fitAddon.fit(); } catch {} }
    return;
  }
  fitAllTerminals(node.children[0]);
  fitAllTerminals(node.children[1]);
}

// ===== Panes =====

function createPane(sessionName) {
  const info = state.sessions.get(sessionName);

  const pane = document.createElement("div");
  pane.className = `pane ${sessionName === state.focusedPane ? "focused" : ""} ${info?.status === "dead" ? "dead" : ""}`;
  pane.dataset.session = sessionName;
  pane.addEventListener("mousedown", () => focusPane(sessionName));

  // Top bar
  const topbar = document.createElement("div");
  topbar.className = "pane-topbar";
  const identity = info?.emcomIdentity ? `<span class="pane-identity">@${info.emcomIdentity}</span>` : "";
  topbar.innerHTML = `
    <span class="pane-name">${sessionName}</span>
    ${identity}
    <span class="pane-cwd" title="${info?.workingDir || ""}">${truncatePath(info?.workingDir || "")}</span>
    <span class="pane-close" title="Kill session">&times;</span>
  `;
  topbar.querySelector(".pane-close").onclick = (e) => {
    e.stopPropagation();
    killSession(sessionName);
  };
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

  // Create or reattach xterm
  let entry = state.terminals.get(sessionName);
  if (!entry) {
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

    // Create a persistent wrapper that survives re-renders
    const wrapperEl = document.createElement("div");
    wrapperEl.style.position = "absolute";
    wrapperEl.style.inset = "0";

    entry = { term, fitAddon, opened: false, wrapperEl };
    state.terminals.set(sessionName, entry);
  }

  // Fit terminal and explicitly notify server of new dimensions
  const fitAndSync = () => {
    try {
      entry.fitAddon.fit();
      // Always send resize to server — onResize may not fire if dims unchanged
      const { cols, rows } = entry.term;
      state.ws?.send(JSON.stringify({ type: "resize", session: sessionName, payload: { cols, rows } }));
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
    // Safety net: fit again after layout fully settles
    setTimeout(fitAndSync, 150);

    // ResizeObserver ensures fit() fires when layout settles
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

function updatePaneStatus(sessionName) {
  const info = state.sessions.get(sessionName);
  if (!info) return;
  document.querySelectorAll(`.pane[data-session="${sessionName}"]`).forEach((pane) => {
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

function focusPane(sessionName) {
  state.focusedPane = sessionName;
  document.querySelectorAll(".pane").forEach((p) => {
    p.classList.toggle("focused", p.dataset.session === sessionName);
  });
  const entry = state.terminals.get(sessionName);
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

  // Remove from all workspaces
  for (const ws of state.workspaces) {
    ws.layout = removeSessionFromLayout(ws.layout, sessionName);
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
  if (state.focusedPane === sessionName) state.focusedPane = null;

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

  // Remove from all workspaces and rebalance
  for (const ws of state.workspaces) {
    if (ws.layout && treeContains(ws.layout, sessionName)) {
      const leaves = getLeafList(ws.layout).filter((n) => n !== sessionName);
      ws.layout = buildBalancedTree(leaves);
      updateWorkspaceTabName(ws);
    }
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
  if (state.focusedPane === sessionName) {
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

document.getElementById("btn-new-workspace").onclick = () => {
  const ws = createWorkspace(null);
  switchToWorkspace(ws.id);
};

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

renderTabs();
if (state.isDashboard) renderDashboard();
else renderActiveWorkspace();
connect();
