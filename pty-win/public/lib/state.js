// @ts-check
// Global app state + foundational helpers.
// Imported by app.js and (over time) every other public/lib/* module.
//
// First module extracted as part of the app.js modularization (tracker 8eb3a993).
// Browsers load this via the import graph rooted at <script type="module" src="app.js">.

/** @typedef {{ type: "leaf", session: string }} LeafNode */
/** @typedef {{ type: "split", direction: "h"|"v", ratio: number, children: [TileNode, TileNode] }} SplitNode */
/** @typedef {LeafNode | SplitNode} TileNode */
/** @typedef {{ id: string, name: string, layout: TileNode | null }} Workspace */

export const state = {
  ws: null,
  sessions: new Map(),    // name -> SessionInfo
  workspaces: [],         // Workspace[]
  activeWorkspaceId: null,
  terminals: new Map(),   // sessionName -> { term, fitAddon, opened: boolean }
  focusedPane: null,
  isDashboard: true,
  isDiag: false,
  isTracker: false,
  trackerItems: [],
  trackerDecisionCount: 0,
  sidebarVisible: true,
  favorites: [],          // string[] — favorite root paths
  folderCache: new Map(), // path -> FolderEntry[]
  visitedFolders: [],     // {name, path, identityName?, isClaudeReady}[] for quick-open
  expandedPaths: new Set(),
  ctxTarget: null,        // path for context menu
  sessionMeta: new Map(), // name -> { workingDir, command } for recreating after restart
  paneGroups: new Map(),  // group -> { claude?: name, pwsh?: name, activeType: "claude"|"pwsh" }
  folderInfoCache: new Map(), // normPath(workingDir) -> { isClaudeReady, hasIdentity, identityName }
  pinnedFolders: [],          // string[] — paths pinned to Quick Access
  nextWorkspaceId: 1,         // monotonic counter used for new-workspace IDs
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

export function getAiPresetForCommand(cmd) {
  return state.aiPresets.find((p) => p.command === cmd) || { name: cmd, command: cmd, icon: "?" };
}

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
