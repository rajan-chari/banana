// @ts-check
// Global app state + foundational helpers.
// Imported by app.js and (over time) every other public/lib/* module.
//
// First module extracted as part of the app.js modularization (tracker 8eb3a993).
// Browsers load this via the import graph rooted at <script type="module" src="app.js">.

/** @typedef {{ type: "leaf", session: string }} LeafNode */
/** @typedef {{ type: "split", direction: "h"|"v", ratio: number, children: [TileNode, TileNode] }} SplitNode */
/** @typedef {LeafNode | SplitNode} TileNode */
/** @typedef {{ id: string, name: string, layout: TileNode | null, lastFocusedPane?: string | null, customName?: boolean }} Workspace */
/** @typedef {{ name: string, path: string, isDir?: boolean, hasIdentity?: boolean, identityName?: string | null, isClaudeReady?: boolean }} FolderEntry */
/** @typedef {{ name: string, path: string, identityName?: string | null, isClaudeReady?: boolean, isDir?: boolean }} VisitedFolder */
/** @typedef {{ name: string, command: string, icon: string }} AiPreset */
/** @typedef {{ claude?: string, pwsh?: string, activeType: "claude"|"pwsh" }} PaneGroup */
/** @typedef {{ term: any, fitAddon: any, opened: boolean, wrapperEl: HTMLElement, resizeObserver?: ResizeObserver }} TerminalEntry */
/** @typedef {"starting" | "busy" | "idle" | "dead"} SessionStatus */
/**
 * Mirrors the server's SessionInfo (src/session.ts). Index signature dropped
 * intentionally — every field accessed in browser code must be declared here
 * so typos and stale field names (like hookNotificationType, which is never
 * set server-side) are caught at type-check time.
 * @typedef {{
 *   name: string,
 *   group: string,
 *   command: string,
 *   workingDir?: string,
 *   pid?: number,
 *   status: SessionStatus,
 *   emcomIdentity?: string | null,
 *   unreadCount?: number,
 *   dirtyOnExit?: boolean,
 *   costUsd?: number,
 *   lastActiveMs?: number,
 *   pendingPermission?: boolean
 * }} SessionInfo */
/** @typedef {{ isClaudeReady: boolean, hasIdentity: boolean, identityName?: string | null }} FolderInfo */
/** @typedef {{ workingDir?: string, command?: string | null }} SessionMeta */

/**
 * Tracker work item, as returned by /api/emcom-proxy/tracker.
 *
 * Shape mirrors the emcom tracker JSON API; only `id` is required.
 * Many fields are user-controlled / optional / nullable. If you add a
 * field here, double-check that callers in lib/tracker-render.js,
 * lib/tracker-filters.js, and app.js handle it correctly — this typedef
 * has no index signature so any new field access will be a check error.
 *
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   repo?: string,
 *   number?: string | number,
 *   status?: string,
 *   severity?: string,
 *   assigned_to?: string,
 *   opened_by?: string,
 *   github_author?: string,
 *   created_by?: string,
 *   github_last_commenter?: string,
 *   responders?: string[],
 *   labels?: string[],
 *   created_at?: string,
 *   updated_at?: string,
 *   date_found?: string,
 *   last_github_activity?: string,
 *   blocker?: string,
 *   findings?: string,
 *   decision?: string,
 *   decision_rationale?: string,
 *   notes?: string,
 * }} TrackerItem
 */

/**
 * Single entry in a tracker item's audit history.
 * @typedef {{
 *   field?: string,
 *   new_value?: string,
 *   comment?: string,
 *   changed_at?: string,
 *   changed_by?: string,
 * }} TrackerHistoryEntry
 */

export const state = {
  /** @type {WebSocket | null} */
  ws: null,
  /** @type {Map<string, SessionInfo>} */
  sessions: new Map(),
  /** @type {Workspace[]} */
  workspaces: [],
  /** @type {string | null} */
  activeWorkspaceId: null,
  /** @type {Map<string, TerminalEntry>} */
  terminals: new Map(),
  /** @type {string | null} */
  focusedPane: null,
  /** @type {TrackerItem[]} */
  trackerItems: [],
  trackerDecisionCount: 0,
  sidebarVisible: true,
  /** @type {string[]} */
  favorites: [],          // favorite root paths
  /** @type {Map<string, FolderEntry[]>} */
  folderCache: new Map(),
  /** @type {VisitedFolder[]} */
  visitedFolders: [],     // for quick-open
  /** @type {Set<string>} */
  expandedPaths: new Set(),
  /** @type {string | null} */
  ctxTarget: null,        // path for context menu
  /** @type {Map<string, SessionMeta>} */
  sessionMeta: new Map(), // for recreating sessions after restart
  /** @type {Map<string, "claude"|"pwsh">} */
  activePaneTypes: new Map(),
  /** @type {Map<string, FolderInfo>} */
  folderInfoCache: new Map(),
  /** @type {string[]} */
  pinnedFolders: [],          // paths pinned to Quick Access
  nextWorkspaceId: 1,         // monotonic counter used for new-workspace IDs
  /** @type {AiPreset[]} */
  aiPresets: [
    { name: "Claude", command: "claude", icon: "▶" },
    { name: "Agency CC", command: "agency cc", icon: "A" },
    { name: "Agency CP", command: "agency cp", icon: "CP" },
    { name: "Copilot", command: "copilot", icon: "GH" },
    { name: "Pi", command: "pi", icon: "π" },
  ],
  aiDefaultIndex: parseInt(localStorage.getItem("pty-win-ai-default") || "0") || 0,
};

export function getDefaultAiCommand() {
  return state.aiPresets[state.aiDefaultIndex]?.command || "claude";
}

/** @param {string} cmd */
export function getAiPresetForCommand(cmd) {
  return state.aiPresets.find((p) => p.command === cmd) || { name: cmd, command: cmd, icon: "?" };
}

/**
 * @param {number} index
 * @param {string} [updatedBy]
 */
export function setAiDefault(index, updatedBy = "pty-win-play") {
  state.aiDefaultIndex = index;
  localStorage.setItem("pty-win-ai-default", String(index));
  // Mirror to preferences.json (fire-and-forget). Lets fellow-agents config get/set
  // see the same value the user picked here.
  const preset = state.aiPresets[index];
  if (preset?.command) {
    fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cliPreference: preset.command, updatedBy }),
    }).catch(() => {});
  }
}

/** Fetch the server-side default preference at startup. Picks up changes made
 *  via `fellow-agents config set` or first-run prompt. localStorage acts as a
 *  no-flicker cache that the server value overrides. */
export async function syncAiDefaultFromServer() {
  try {
    const resp = await fetch("/api/preferences");
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.cliPreference) return;
    const idx = state.aiPresets.findIndex((p) => p.command === data.cliPreference);
    if (idx < 0) return; // custom path or unknown — leave localStorage value
    if (idx !== state.aiDefaultIndex) {
      state.aiDefaultIndex = idx;
      localStorage.setItem("pty-win-ai-default", String(idx));
    }
  } catch {
    // Server unreachable — keep localStorage default.
  }
}

export const TERM_THEME = {
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
