// @ts-check
// localStorage read/write helpers.
//
// Each loader returns the parsed value or a safe default; each saver writes
// from state. All keys use the "pty-win-" prefix. Second module extracted
// in the app.js modularization (tracker 8eb3a993).

import { state } from "./state.js";

export function loadFavorites() {
  try {
    const raw = localStorage.getItem("pty-win-favorites");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveFavorites() {
  localStorage.setItem("pty-win-favorites", JSON.stringify(state.favorites));
}

export function loadPinnedFolders() {
  try {
    const raw = localStorage.getItem("pty-win-pinned");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function savePinnedFolders() {
  localStorage.setItem("pty-win-pinned", JSON.stringify(state.pinnedFolders));
}

export function loadExpandedPaths() {
  try {
    const raw = localStorage.getItem("pty-win-expanded");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

export function saveExpandedPaths() {
  localStorage.setItem("pty-win-expanded", JSON.stringify([...state.expandedPaths]));
}

export function loadSidebarWidth() {
  try {
    const w = localStorage.getItem("pty-win-sidebar-width");
    return w ? parseInt(w, 10) : 220;
  } catch { return 220; }
}

/** @param {number} w */
export function saveSidebarWidth(w) {
  localStorage.setItem("pty-win-sidebar-width", String(w));
}

export function saveWorkspaces() {
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
    nextId: state.nextWorkspaceId,
  }));
}

export function loadWorkspaces() {
  try {
    const raw = localStorage.getItem("pty-win-workspaces");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function loadSessionMeta() {
  try {
    const raw = localStorage.getItem("pty-win-session-meta");
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw)));
  } catch { return new Map(); }
}

export function saveSessionMeta() {
  /** @type {Record<string, any>} */
  const obj = {};
  for (const [name, meta] of state.sessionMeta) obj[name] = meta;
  localStorage.setItem("pty-win-session-meta", JSON.stringify(obj));
}
