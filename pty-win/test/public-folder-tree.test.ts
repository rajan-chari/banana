// Folder-tree pure helpers.
//
// Companion to tracker e0ca3757 / 8eb3a993 Phase 3.
//
// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
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
} from "../public/lib/folder-tree.js";
import type { SessionInfo } from "../public/lib/folder-tree.js";

// Real normalization used in app.js: lowercase + forward slashes + trim trailing slash.
const norm = (p: string | undefined | null): string => {
  if (!p) return "";
  return p.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
};

function s(partial: Partial<SessionInfo> & { name: string }): SessionInfo {
  return { status: "idle", ...partial } as SessionInfo;
}

describe("isFolderRunning", () => {
  it("returns false when sessions is empty", () => {
    expect(isFolderRunning(new Map(), "C:/repo/x", norm)).toBe(false);
  });

  it("returns true when one live session matches the folder path", () => {
    const sessions = new Map<string, SessionInfo>([
      ["alice", s({ name: "alice", workingDir: "C:\\repo\\alice" })],
    ]);
    expect(isFolderRunning(sessions, "C:/repo/alice", norm)).toBe(true);
  });

  it("normalizes paths before comparing (case + slashes + trailing slash)", () => {
    const sessions = new Map<string, SessionInfo>([
      ["alice", s({ name: "alice", workingDir: "C:\\Repo\\Alice\\" })],
    ]);
    expect(isFolderRunning(sessions, "c:/repo/alice", norm)).toBe(true);
  });

  it("ignores dead sessions even if their path matches", () => {
    const sessions = new Map<string, SessionInfo>([
      ["alice", s({ name: "alice", status: "dead", workingDir: "C:/repo/alice" })],
    ]);
    expect(isFolderRunning(sessions, "C:/repo/alice", norm)).toBe(false);
  });

  it("returns false when only sessions in other directories exist", () => {
    const sessions = new Map<string, SessionInfo>([
      ["alice", s({ name: "alice", workingDir: "C:/elsewhere/alice" })],
      ["other", s({ name: "other", workingDir: "C:/somewhere/else" })],
    ]);
    expect(isFolderRunning(sessions, "C:/repo/alice", norm)).toBe(false);
  });

  it("does NOT match a same-basename session rooted elsewhere", () => {
    // basename "alice" appears in path, but the actual workingDir is different
    const sessions = new Map<string, SessionInfo>([
      ["alice", s({ name: "alice", workingDir: "D:/projects/alice" })],
    ]);
    expect(isFolderRunning(sessions, "C:/repo/alice", norm)).toBe(false);
  });

  it("skips sessions with empty/missing workingDir", () => {
    const sessions = new Map<string, SessionInfo>([
      ["x", s({ name: "x", workingDir: "" })],
      ["y", s({ name: "y" })],
    ]);
    expect(isFolderRunning(sessions, "C:/anything", norm)).toBe(false);
  });
});

describe("buildRunningUnreadSets", () => {
  it("returns empty sets for empty input", () => {
    const { running, unread } = buildRunningUnreadSets(new Map(), norm);
    expect(running.size).toBe(0);
    expect(unread.size).toBe(0);
  });

  it("collects normalized paths for live sessions only", () => {
    const sessions = new Map<string, SessionInfo>([
      ["a", s({ name: "a", workingDir: "C:\\repo\\a" })],
      ["b", s({ name: "b", status: "dead", workingDir: "C:\\repo\\b" })],
      ["c", s({ name: "c", status: "busy", workingDir: "C:\\repo\\c" })],
    ]);
    const { running } = buildRunningUnreadSets(sessions, norm);
    expect([...running].sort()).toEqual(["c:/repo/a", "c:/repo/c"]);
  });

  it("collects normalized paths for sessions with unread > 0 (regardless of status)", () => {
    const sessions = new Map<string, SessionInfo>([
      ["a", s({ name: "a", workingDir: "C:/a", unreadCount: 3 })],
      ["b", s({ name: "b", workingDir: "C:/b", unreadCount: 0 })],
      ["c", s({ name: "c", status: "dead", workingDir: "C:/c", unreadCount: 5 })],
    ]);
    const { unread } = buildRunningUnreadSets(sessions, norm);
    expect([...unread].sort()).toEqual(["c:/a", "c:/c"]);
  });

  it("skips sessions with no workingDir", () => {
    const sessions = new Map<string, SessionInfo>([
      ["x", s({ name: "x", unreadCount: 99 })],
      ["y", s({ name: "y", workingDir: "" })],
    ]);
    const { running, unread } = buildRunningUnreadSets(sessions, norm);
    expect(running.size).toBe(0);
    expect(unread.size).toBe(0);
  });

  it("collapses multiple sessions in same dir into one entry per set", () => {
    const sessions = new Map<string, SessionInfo>([
      ["a", s({ name: "a", workingDir: "C:/repo", unreadCount: 1 })],
      ["a~pwsh", s({ name: "a~pwsh", workingDir: "C:/repo", unreadCount: 2 })],
    ]);
    const { running, unread } = buildRunningUnreadSets(sessions, norm);
    expect([...running]).toEqual(["c:/repo"]);
    expect([...unread]).toEqual(["c:/repo"]);
  });
});

describe("resolveFolderSessions", () => {
  it("returns nulls when no sessions exist for the folder name", () => {
    const out = resolveFolderSessions(new Map(), "alice", "C:/repo/alice", norm);
    expect(out.sessionInfo).toBe(null);
    expect(out.sessionMatchesPath).toBe(false);
    expect(out.pwshInfo).toBe(null);
    expect(out.pwshMatchesPath).toBe(false);
  });

  it("returns claude session and matches path when names+paths align", () => {
    const sessions = new Map<string, SessionInfo>([
      ["alice", s({ name: "alice", workingDir: "C:\\repo\\alice" })],
    ]);
    const out = resolveFolderSessions(sessions, "alice", "C:/repo/alice", norm);
    expect(out.sessionInfo).not.toBeNull();
    expect(out.sessionMatchesPath).toBe(true);
    expect(out.pwshInfo).toBeNull();
    expect(out.pwshMatchesPath).toBe(false);
  });

  it("returns pwsh session and matches path when only pwsh exists", () => {
    const sessions = new Map<string, SessionInfo>([
      ["alice~pwsh", s({ name: "alice~pwsh", workingDir: "C:/repo/alice" })],
    ]);
    const out = resolveFolderSessions(sessions, "alice", "C:/repo/alice", norm);
    expect(out.sessionInfo).toBeNull();
    expect(out.pwshInfo).not.toBeNull();
    expect(out.pwshMatchesPath).toBe(true);
  });

  it("returns both when both exist", () => {
    const sessions = new Map<string, SessionInfo>([
      ["alice", s({ name: "alice", workingDir: "C:/repo/alice" })],
      ["alice~pwsh", s({ name: "alice~pwsh", workingDir: "C:/repo/alice" })],
    ]);
    const out = resolveFolderSessions(sessions, "alice", "C:/repo/alice", norm);
    expect(out.sessionInfo).not.toBeNull();
    expect(out.pwshInfo).not.toBeNull();
    expect(out.sessionMatchesPath).toBe(true);
    expect(out.pwshMatchesPath).toBe(true);
  });

  it("returns the session but matchesPath=false when name matches but path doesn't", () => {
    // The basename-collision case: there's a session called "alice" but it's
    // rooted in a different directory. The session info is still returned
    // (the original inline code reads `.status` and `.command` from it for
    // some paths), but the path-match flag is false.
    const sessions = new Map<string, SessionInfo>([
      ["alice", s({ name: "alice", workingDir: "D:/projects/alice" })],
    ]);
    const out = resolveFolderSessions(sessions, "alice", "C:/repo/alice", norm);
    expect(out.sessionInfo).not.toBeNull();
    expect(out.sessionMatchesPath).toBe(false);
  });

  it("returns matchesPath=false when session has empty workingDir", () => {
    const sessions = new Map<string, SessionInfo>([
      ["alice", s({ name: "alice", workingDir: "" })],
    ]);
    const out = resolveFolderSessions(sessions, "alice", "C:/repo/alice", norm);
    expect(out.sessionInfo).not.toBeNull();
    expect(out.sessionMatchesPath).toBe(false);
  });
});

// ============== Round 23: renderTree helpers =================

describe("folderCountText", () => {
  it("returns empty string when no favorites", () => {
    expect(folderCountText([])).toBe("");
  });

  it("returns parenthesised count when favorites present", () => {
    expect(folderCountText(["a"])).toBe("(1)");
    expect(folderCountText(["a", "b", "c"])).toBe("(3)");
  });
});

describe("buildTreeRowActionsOpts", () => {
  const base = {
    workingDir: "C:/repo/alice",
    folderName: "alice",
    cached: null,
    sessionInfo: null,
    sessionMatchesPath: false,
    pwshInfo: null,
    pwshMatchesPath: false,
  };

  it("returns all-empty/false when nothing matches and no cache", () => {
    const out = buildTreeRowActionsOpts(base);
    expect(out.identityName).toBeNull();
    expect(out.unreadCount).toBe(0);
    expect(out.workingDir).toBe("C:/repo/alice");
    expect(out.folderName).toBe("alice");
    expect(out.claudeAlive).toBe(false);
    expect(out.pwshAlive).toBe(false);
    expect(out.claudeCommand).toBeNull();
    expect(out.isClaudeReady).toBe(false);
    expect(out.hasIdentity).toBe(false);
  });

  it("prefers cached identityName over session identity", () => {
    const session = { name: "alice", status: "idle", emcomIdentity: "session-id" } as SessionInfo;
    const out = buildTreeRowActionsOpts({
      ...base,
      cached: { identityName: "cached-id", isClaudeReady: true, hasIdentity: true },
      sessionInfo: session,
      sessionMatchesPath: true,
    });
    expect(out.identityName).toBe("cached-id");
    expect(out.isClaudeReady).toBe(true);
    expect(out.hasIdentity).toBe(true);
  });

  it("falls back to session identity when no cached identity", () => {
    const session = { name: "alice", status: "idle", emcomIdentity: "session-id" } as SessionInfo;
    const out = buildTreeRowActionsOpts({
      ...base,
      sessionInfo: session,
      sessionMatchesPath: true,
    });
    expect(out.identityName).toBe("session-id");
  });

  it("ignores session info when sessionMatchesPath=false", () => {
    const session = {
      name: "alice", status: "idle", emcomIdentity: "session-id",
      unreadCount: 5, command: "claude",
    } as SessionInfo;
    const out = buildTreeRowActionsOpts({
      ...base,
      sessionInfo: session,
      sessionMatchesPath: false,
    });
    expect(out.identityName).toBeNull();
    expect(out.unreadCount).toBe(0);
    expect(out.claudeAlive).toBe(false);
    expect(out.claudeCommand).toBeNull();
  });

  it("computes claudeAlive=true when matched and not dead", () => {
    const session = { name: "alice", status: "idle" } as SessionInfo;
    const out = buildTreeRowActionsOpts({
      ...base,
      sessionInfo: session,
      sessionMatchesPath: true,
    });
    expect(out.claudeAlive).toBe(true);
  });

  it("computes claudeAlive=false when matched but dead", () => {
    const session = { name: "alice", status: "dead" } as SessionInfo;
    const out = buildTreeRowActionsOpts({
      ...base,
      sessionInfo: session,
      sessionMatchesPath: true,
    });
    expect(out.claudeAlive).toBe(false);
  });

  it("computes pwshAlive analogously", () => {
    const pwsh = { name: "alice~pwsh", status: "idle" } as SessionInfo;
    const out = buildTreeRowActionsOpts({
      ...base,
      pwshInfo: pwsh,
      pwshMatchesPath: true,
    });
    expect(out.pwshAlive).toBe(true);
  });

  it("returns unread count from matched session", () => {
    const session = { name: "alice", status: "idle", unreadCount: 7 } as SessionInfo;
    const out = buildTreeRowActionsOpts({
      ...base,
      sessionInfo: session,
      sessionMatchesPath: true,
    });
    expect(out.unreadCount).toBe(7);
  });

  it("returns claudeCommand from matched session", () => {
    const session = { name: "alice", status: "idle", command: "claude" } as SessionInfo;
    const out = buildTreeRowActionsOpts({
      ...base,
      sessionInfo: session,
      sessionMatchesPath: true,
    });
    expect(out.claudeCommand).toBe("claude");
  });
});

describe("applyFolderInfoToTreeLabel", () => {
  function makeLabel(): HTMLElement {
    const label = document.createElement("div");
    const slot = document.createElement("span");
    slot.className = "indicator-slot";
    const indC = document.createElement("span");
    indC.className = "indicator claude-ready hidden-placeholder";
    const indI = document.createElement("span");
    indI.className = "indicator identity hidden-placeholder";
    slot.appendChild(indC);
    slot.appendChild(indI);
    label.appendChild(slot);
    const idTag = document.createElement("span");
    idTag.className = "identity-tag hidden-placeholder";
    label.appendChild(idTag);
    return label;
  }

  it("unhides claude-ready indicator when isClaudeReady=true", () => {
    const label = makeLabel();
    applyFolderInfoToTreeLabel(label, { isClaudeReady: true, hasIdentity: false });
    const indC = label.querySelector(".indicator.claude-ready") as HTMLElement;
    expect(indC.classList.contains("hidden-placeholder")).toBe(false);
    expect(indC.title).toBe("Has CLAUDE.md");
  });

  it("leaves claude-ready hidden when isClaudeReady=false", () => {
    const label = makeLabel();
    applyFolderInfoToTreeLabel(label, { isClaudeReady: false, hasIdentity: false });
    const indC = label.querySelector(".indicator.claude-ready") as HTMLElement;
    expect(indC.classList.contains("hidden-placeholder")).toBe(true);
  });

  it("unhides identity indicator and sets title with identity name", () => {
    const label = makeLabel();
    applyFolderInfoToTreeLabel(label, { isClaudeReady: false, hasIdentity: true, identityName: "alice" });
    const indI = label.querySelector(".indicator.identity") as HTMLElement;
    expect(indI.classList.contains("hidden-placeholder")).toBe(false);
    expect(indI.title).toBe("Identity: alice");
  });

  it("falls back to 'yes' when hasIdentity but no name provided", () => {
    const label = makeLabel();
    applyFolderInfoToTreeLabel(label, { isClaudeReady: false, hasIdentity: true });
    const indI = label.querySelector(".indicator.identity") as HTMLElement;
    expect(indI.title).toBe("Identity: yes");
  });

  it("populates identity-tag pill when identityName provided", () => {
    const label = makeLabel();
    applyFolderInfoToTreeLabel(label, { isClaudeReady: false, hasIdentity: true, identityName: "alice" });
    const idTag = label.querySelector(".identity-tag") as HTMLElement;
    expect(idTag.textContent).toBe("alice");
    expect(idTag.classList.contains("hidden-placeholder")).toBe(false);
  });

  it("leaves identity-tag untouched when no identityName", () => {
    const label = makeLabel();
    applyFolderInfoToTreeLabel(label, { isClaudeReady: false, hasIdentity: false });
    const idTag = label.querySelector(".identity-tag") as HTMLElement;
    expect(idTag.textContent).toBe("");
    expect(idTag.classList.contains("hidden-placeholder")).toBe(true);
  });

  it("is a no-op when label has no indicator-slot or identity-tag", () => {
    const label = document.createElement("div");
    expect(() => applyFolderInfoToTreeLabel(label, { isClaudeReady: true, hasIdentity: true, identityName: "x" })).not.toThrow();
  });
});

describe("buildChildRowActionsOpts", () => {
  const entry = { name: "alice", path: "C:/repo/alice", hasIdentity: true, identityName: "Alice", isClaudeReady: true };

  it("uses entry-side identity/claude-ready flags directly", () => {
    const opts = buildChildRowActionsOpts(entry, {
      sessionInfo: null, sessionMatchesPath: false, pwshInfo: null, pwshMatchesPath: false,
    });
    expect(opts.identityName).toBe("Alice");
    expect(opts.isClaudeReady).toBe(true);
    expect(opts.hasIdentity).toBe(true);
    expect(opts.workingDir).toBe("C:/repo/alice");
    expect(opts.folderName).toBe("alice");
  });

  it("returns null identityName when entry.hasIdentity is false", () => {
    const opts = buildChildRowActionsOpts(
      { ...entry, hasIdentity: false },
      { sessionInfo: null, sessionMatchesPath: false, pwshInfo: null, pwshMatchesPath: false },
    );
    expect(opts.identityName).toBeNull();
  });

  it("returns null identityName when hasIdentity is true but identityName is empty", () => {
    const opts = buildChildRowActionsOpts(
      { ...entry, hasIdentity: true, identityName: "" },
      { sessionInfo: null, sessionMatchesPath: false, pwshInfo: null, pwshMatchesPath: false },
    );
    expect(opts.identityName).toBeNull();
  });

  it("reports claudeAlive + unread/command only when sessionMatchesPath is true", () => {
    const info = s({ name: "alice", status: "idle", workingDir: "C:/repo/alice", unreadCount: 4, command: "claude" });
    const matched = buildChildRowActionsOpts(entry, {
      sessionInfo: info, sessionMatchesPath: true, pwshInfo: null, pwshMatchesPath: false,
    });
    expect(matched.claudeAlive).toBe(true);
    expect(matched.unreadCount).toBe(4);
    expect(matched.claudeCommand).toBe("claude");

    const unmatched = buildChildRowActionsOpts(entry, {
      sessionInfo: info, sessionMatchesPath: false, pwshInfo: null, pwshMatchesPath: false,
    });
    expect(unmatched.claudeAlive).toBe(false);
    expect(unmatched.unreadCount).toBe(0);
    expect(unmatched.claudeCommand).toBeNull();
  });

  it("claudeAlive is false when matched session is dead", () => {
    const dead = s({ name: "alice", status: "dead", workingDir: "C:/repo/alice" });
    const opts = buildChildRowActionsOpts(entry, {
      sessionInfo: dead, sessionMatchesPath: true, pwshInfo: null, pwshMatchesPath: false,
    });
    expect(opts.claudeAlive).toBe(false);
  });

  it("pwshAlive mirrors claude path-match + alive rules", () => {
    const pwsh = s({ name: "alice~pwsh", status: "busy", workingDir: "C:/repo/alice" });
    const opts = buildChildRowActionsOpts(entry, {
      sessionInfo: null, sessionMatchesPath: false, pwshInfo: pwsh, pwshMatchesPath: true,
    });
    expect(opts.pwshAlive).toBe(true);
  });

  it("undefined unreadCount on matched info falls back to 0", () => {
    const info = s({ name: "alice", workingDir: "C:/repo/alice" });
    const opts = buildChildRowActionsOpts(entry, {
      sessionInfo: info, sessionMatchesPath: true, pwshInfo: null, pwshMatchesPath: false,
    });
    expect(opts.unreadCount).toBe(0);
  });
});

describe("buildChildTreeRow", () => {
  const entry = { name: "alice", path: "C:\\Repo\\Alice" };
  const norm = (p: string | undefined | null): string => {
    if (!p) return "";
    return p.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  };

  it("creates a tree-node div with normalized data-path", () => {
    const row = buildChildTreeRow(entry, 0, false, false, norm);
    expect(row.className).toBe("tree-node");
    expect(row.dataset["path"]).toBe("c:/repo/alice");
  });

  it("adds the running class only when isRunning is true", () => {
    expect(buildChildTreeRow(entry, 0, false, false, norm).classList.contains("running")).toBe(false);
    expect(buildChildTreeRow(entry, 0, false, true, norm).classList.contains("running")).toBe(true);
  });

  it("sets indent width to depth * 8 px", () => {
    const row = buildChildTreeRow(entry, 3, false, false, norm);
    const indent = row.querySelector(".indent") as HTMLElement | null;
    expect(indent).not.toBeNull();
    expect(indent!.style.width).toBe("24px");
  });

  it("marks the arrow as expanded only when isExpanded is true", () => {
    const collapsed = buildChildTreeRow(entry, 0, false, false, norm);
    expect(collapsed.querySelector(".arrow")?.className).toBe("arrow ");
    const expanded = buildChildTreeRow(entry, 0, true, false, norm);
    expect(expanded.querySelector(".arrow")?.className).toBe("arrow expanded");
  });

  it("sets folder-name textContent from entry.name", () => {
    const row = buildChildTreeRow(entry, 0, false, false, norm);
    expect(row.querySelector(".folder-name")?.textContent).toBe("alice");
  });

  it("appends indent, arrow, name in that order", () => {
    const row = buildChildTreeRow(entry, 0, false, false, norm);
    const classes = Array.from(row.children).map((c) => c.className.split(" ")[0]);
    expect(classes).toEqual(["indent", "arrow", "folder-name"]);
  });
});

// ===== createFolderTree factory (Phase 7a) =====

function jsonResponse(body: any) {
  return Promise.resolve({ json: () => Promise.resolve(body) } as any);
}

function mk(overrides: any = {}) {
  document.body.innerHTML = `
    <div id="folder-tree"></div>
    <span class="folder-count"></span>
  `;
  const state: any = {
    folderCache: new Map(),
    visitedFolders: [],
    favorites: [],
    expandedPaths: new Set(),
    folderInfoCache: new Map(),
    sessions: new Map(),
    ...overrides.state,
  };
  const fetchFn = vi.fn(async (url: string) => {
    if (url.startsWith("/api/folders")) return jsonResponse(overrides.children ?? []);
    if (url.startsWith("/api/folder-info")) return jsonResponse(overrides.folderInfo ?? { isClaudeReady: false, hasIdentity: false });
    return jsonResponse({});
  });
  const helpers = {
    normPath: (p: string) => (p || "").toLowerCase(),
    folderCountText: (favs: string[]) => `(${favs.length})`,
    isFolderRunning: vi.fn(() => false),
    resolveFolderSessions: vi.fn(() => ({
      sessionInfo: null, sessionMatchesPath: false, pwshInfo: null, pwshMatchesPath: false,
    })),
    buildTreeRowActionsOpts: vi.fn((args: any) => ({ ...args, kind: "root" })),
    applyFolderInfoToTreeLabel: vi.fn(),
    cssId: (s: string) => s.replace(/[^a-z0-9]/gi, "_"),
    buildChildTreeRow: vi.fn((entry: any, depth: number) => {
      const row = document.createElement("div");
      row.className = "tree-node";
      row.dataset["path"] = entry.path.toLowerCase();
      row.dataset["depth"] = String(depth);
      return row;
    }),
    buildChildRowActionsOpts: vi.fn((entry: any) => ({ workingDir: entry.path, kind: "child" })),
    buildRunningUnreadSets: vi.fn(() => ({ running: new Set<string>(), unread: new Set<string>() })),
    expanded: { toggle: vi.fn((p: string) => { if (state.expandedPaths.has(p)) { state.expandedPaths.delete(p); return false; } state.expandedPaths.add(p); return true; }) },
    ...overrides.helpers,
  };
  const actions = {
    appendRowActions: vi.fn(),
    showContextMenu: vi.fn(),
    ...overrides.actions,
  };
  const ft = createFolderTree({
    state,
    byId: (id: string) => document.getElementById(id),
    doc: document,
    env: { fetchFn: fetchFn as any },
    helpers,
    actions,
  });
  return { ft, state, helpers, actions, fetchFn };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createFolderTree - renderTree empty + count", () => {
  it("renders nothing when favorites is empty, and clears folder-count to (0)", () => {
    const { ft } = mk();
    ft.renderTree();
    expect(document.getElementById("folder-tree")!.children.length).toBe(0);
    expect(document.querySelector(".folder-count")!.textContent).toBe("(0)");
  });

  it("is a no-op when #folder-tree is missing (defensive guard)", () => {
    const { ft } = mk();
    document.getElementById("folder-tree")!.remove();
    expect(() => ft.renderTree()).not.toThrow();
  });
});

describe("createFolderTree - root rendering", () => {
  it("renders one .tree-root per favorite with label, arrow, name", () => {
    const { ft } = mk({ state: { favorites: ["C:/a", "C:/b"] } });
    ft.renderTree();
    const tree = document.getElementById("folder-tree")!;
    expect(tree.querySelectorAll(".tree-root")).toHaveLength(2);
    expect(tree.querySelectorAll(".tree-root-label .arrow")).toHaveLength(2);
    expect(tree.querySelectorAll(".tree-root-label .root-name")[0].textContent).toBe("a");
    expect(tree.querySelectorAll(".tree-root-label .root-name")[1].textContent).toBe("b");
  });

  it("appendRowActions is called for each root with workingDir + kind=root", () => {
    const { ft, actions } = mk({ state: { favorites: ["C:/a"] } });
    ft.renderTree();
    expect(actions.appendRowActions).toHaveBeenCalledTimes(1);
    const ar: any = actions.appendRowActions.mock.calls[0];
    expect(ar[1]).toMatchObject({ workingDir: "C:/a", kind: "root" });
  });

  it("collapsed root: arrow has no .expanded, child container exists empty, no /api/folders fetch", () => {
    const { ft, fetchFn } = mk({ state: { favorites: ["C:/a"] } });
    ft.renderTree();
    const arrow = document.querySelector(".tree-root-label .arrow")!;
    expect(arrow.classList.contains("expanded")).toBe(false);
    const childContainer = document.querySelector(".tree-root > .tree-children")!;
    expect(childContainer.children.length).toBe(0);
    const foldersCalls = fetchFn.mock.calls.filter((c: any) => String(c[0]).startsWith("/api/folders"));
    expect(foldersCalls).toHaveLength(0);
  });

  it("expanded root: arrow has .expanded; loadAndRenderChildren fetches and renders isDir children only", async () => {
    const { ft, fetchFn } = mk({
      state: { favorites: ["C:/a"], expandedPaths: new Set(["C:/a"]) },
      children: [
        { name: "sub1", path: "C:/a/sub1", isDir: true },
        { name: "file.txt", path: "C:/a/file.txt", isDir: false },
        { name: "sub2", path: "C:/a/sub2", isDir: true },
      ],
    });
    ft.renderTree();
    await flush();
    const foldersCalls = fetchFn.mock.calls.filter((c: any) => String(c[0]).startsWith("/api/folders"));
    expect(foldersCalls).toHaveLength(1);
    expect(String(foldersCalls[0][0])).toBe(`/api/folders?path=${encodeURIComponent("C:/a")}`);
    const rows = document.querySelectorAll(".tree-root > .tree-children .tree-node");
    expect(rows).toHaveLength(2);
    expect((rows[0] as HTMLElement).dataset["path"]).toBe("c:/a/sub1");
    expect((rows[1] as HTMLElement).dataset["path"]).toBe("c:/a/sub2");
  });

  it("isFolderRunning=true: nameSpan gets .running class", () => {
    const { ft } = mk({
      state: { favorites: ["C:/a"] },
      helpers: { isFolderRunning: vi.fn(() => true) },
    });
    ft.renderTree();
    expect(document.querySelector(".tree-root-label .root-name")!.classList.contains("running")).toBe(true);
  });
});

describe("createFolderTree - folder-info lazy fetch", () => {
  it("fetches /api/folder-info, populates folderInfoCache, calls applyFolderInfoToTreeLabel", async () => {
    const info = { isClaudeReady: true, hasIdentity: true, identityName: "moss" };
    const { ft, state, helpers, fetchFn } = mk({ state: { favorites: ["C:/a"] }, folderInfo: info });
    ft.renderTree();
    await flush();
    const infoCalls = fetchFn.mock.calls.filter((c: any) => String(c[0]).startsWith("/api/folder-info"));
    expect(infoCalls).toHaveLength(1);
    expect(state.folderInfoCache.get("c:/a")).toEqual(info);
    expect(helpers.applyFolderInfoToTreeLabel).toHaveBeenCalledTimes(1);
  });

  it("skips fetch when folderInfoCache already has normPath(rootPath) key", () => {
    const { ft, fetchFn } = mk({
      state: {
        favorites: ["C:/a"],
        folderInfoCache: new Map([["c:/a", { isClaudeReady: true, hasIdentity: false }]]),
      },
    });
    ft.renderTree();
    const infoCalls = fetchFn.mock.calls.filter((c: any) => String(c[0]).startsWith("/api/folder-info"));
    expect(infoCalls).toHaveLength(0);
  });

  it("stale-label guard: does NOT call applyFolderInfoToTreeLabel when label was detached before fetch resolved", async () => {
    const { ft, state, helpers } = mk({ state: { favorites: ["C:/a"] } });
    ft.renderTree();
    document.getElementById("folder-tree")!.innerHTML = "";
    await flush();
    expect(state.folderInfoCache.get("c:/a")).toBeDefined();
    expect(helpers.applyFolderInfoToTreeLabel).not.toHaveBeenCalled();
  });
});

describe("createFolderTree - fetchChildren behavior", () => {
  it("caches by RAW path (parity with state.folderCache.delete(rawPath) invalidator)", async () => {
    const { ft, state, fetchFn } = mk({ children: [{ name: "x", path: "C:/Mixed/Case", isDir: true }] });
    await ft.fetchChildren("C:/Mixed/Case");
    expect(state.folderCache.has("C:/Mixed/Case")).toBe(true);
    expect(state.folderCache.has("c:/mixed/case")).toBe(false);
    await ft.fetchChildren("C:/Mixed/Case");
    const foldersCalls = fetchFn.mock.calls.filter((c: any) => String(c[0]).startsWith("/api/folders"));
    expect(foldersCalls).toHaveLength(1);
  });

  it("seeds visitedFolders only for isDir entries that aren't already there", async () => {
    const { ft, state } = mk({
      state: { visitedFolders: [{ path: "C:/already" }] },
      children: [
        { name: "new", path: "C:/new", isDir: true },
        { name: "file", path: "C:/x.txt", isDir: false },
        { name: "already", path: "C:/already", isDir: true },
      ],
    });
    await ft.fetchChildren("C:/root");
    expect(state.visitedFolders.map((v: any) => v.path).sort()).toEqual(["C:/already", "C:/new"]);
  });

  it("swallows fetch failure and returns []", async () => {
    const { ft, fetchFn } = mk();
    fetchFn.mockRejectedValueOnce(new Error("boom"));
    const result = await ft.fetchChildren("C:/dead");
    expect(result).toEqual([]);
  });
});

describe("createFolderTree - loadAndRenderChildren stale guard", () => {
  it("does not render children if the container was detached during the await", async () => {
    let resolveChildren: any;
    const fetchFn = vi.fn(async (url: string) => {
      if (url.startsWith("/api/folders")) {
        return new Promise((res) => {
          resolveChildren = () => res({ json: async () => [{ name: "sub", path: "C:/a/sub", isDir: true }] } as any);
        });
      }
      return { json: async () => ({}) } as any;
    });
    document.body.innerHTML = `<div id="folder-tree"></div><span class="folder-count"></span>`;
    const state: any = {
      folderCache: new Map(), visitedFolders: [], favorites: ["C:/a"],
      expandedPaths: new Set(["C:/a"]),
      folderInfoCache: new Map([["c:/a", { isClaudeReady: false, hasIdentity: false }]]),
      sessions: new Map(),
    };
    const helpers = {
      normPath: (p: string) => (p || "").toLowerCase(),
      folderCountText: () => "(1)",
      isFolderRunning: () => false,
      resolveFolderSessions: () => ({ sessionInfo: null, sessionMatchesPath: false, pwshInfo: null, pwshMatchesPath: false }),
      buildTreeRowActionsOpts: (a: any) => a,
      applyFolderInfoToTreeLabel: vi.fn(),
      cssId: (s: string) => s.replace(/[^a-z0-9]/gi, "_"),
      buildChildTreeRow: vi.fn((entry: any) => {
        const row = document.createElement("div"); row.className = "tree-node"; row.dataset["path"] = entry.path; return row;
      }),
      buildChildRowActionsOpts: () => ({}),
      buildRunningUnreadSets: () => ({ running: new Set<string>(), unread: new Set<string>() }),
      expanded: { toggle: vi.fn() },
    };
    const actions = { appendRowActions: vi.fn(), showContextMenu: vi.fn() };
    const ft = createFolderTree({
      state, byId: (id: string) => document.getElementById(id), doc: document, env: { fetchFn: fetchFn as any }, helpers: helpers as any, actions: actions as any,
    });
    ft.renderTree();
    document.getElementById("folder-tree")!.innerHTML = "";
    resolveChildren();
    await flush();
    expect(helpers.buildChildTreeRow).not.toHaveBeenCalled();
  });
});

describe("createFolderTree - row wiring", () => {
  it("root label.onclick toggles expandedPaths and re-renders", async () => {
    const { ft, state, helpers } = mk({ state: { favorites: ["C:/a"] } });
    ft.renderTree();
    expect(state.expandedPaths.has("C:/a")).toBe(false);
    const label = document.querySelector(".tree-root-label") as HTMLElement;
    await (label.onclick as any)({} as any);
    expect(state.expandedPaths.has("C:/a")).toBe(true);
    expect(helpers.expanded.toggle).toHaveBeenCalledWith("C:/a", { notify: false });
    expect(document.querySelector(".tree-root-label .arrow")!.classList.contains("expanded")).toBe(true);
  });

  it("root label contextmenu → showContextMenu(e, rootPath)", () => {
    const { ft, actions } = mk({ state: { favorites: ["C:/a"] } });
    ft.renderTree();
    const label = document.querySelector(".tree-root-label") as HTMLElement;
    label.dispatchEvent(new Event("contextmenu"));
    expect(actions.showContextMenu).toHaveBeenCalledTimes(1);
    const cm: any = actions.showContextMenu.mock.calls[0];
    expect(cm[1]).toBe("C:/a");
  });

  it("child row dragstart sets pty-win/folder payload with workingDir + folderName", async () => {
    const { ft } = mk({
      state: { favorites: ["C:/a"], expandedPaths: new Set(["C:/a"]) },
      children: [{ name: "sub", path: "C:/a/sub", isDir: true }],
    });
    ft.renderTree();
    await flush();
    const row = document.querySelector(".tree-root > .tree-children .tree-node") as HTMLElement;
    expect((row as any).draggable).toBe(true);
    const evt: any = new Event("dragstart");
    const setData = vi.fn();
    evt.dataTransfer = { setData, effectAllowed: "none" };
    row.dispatchEvent(evt);
    expect(setData).toHaveBeenCalledWith(
      "pty-win/folder",
      JSON.stringify({ workingDir: "C:/a/sub", folderName: "sub" }),
    );
    expect(evt.dataTransfer.effectAllowed).toBe("copy");
  });

  it("child row dragstart with no dataTransfer is a silent no-op", async () => {
    const { ft } = mk({
      state: { favorites: ["C:/a"], expandedPaths: new Set(["C:/a"]) },
      children: [{ name: "sub", path: "C:/a/sub", isDir: true }],
    });
    ft.renderTree();
    await flush();
    const row = document.querySelector(".tree-root > .tree-children .tree-node") as HTMLElement;
    const evt: any = new Event("dragstart");
    evt.dataTransfer = null;
    expect(() => row.dispatchEvent(evt)).not.toThrow();
  });

  it("child row contextmenu → showContextMenu(e, entry.path)", async () => {
    const { ft, actions } = mk({
      state: { favorites: ["C:/a"], expandedPaths: new Set(["C:/a"]) },
      children: [{ name: "sub", path: "C:/a/sub", isDir: true }],
    });
    ft.renderTree();
    await flush();
    const row = document.querySelector(".tree-root > .tree-children .tree-node") as HTMLElement;
    row.dispatchEvent(new Event("contextmenu"));
    const cm: any = actions.showContextMenu.mock.calls[0];
    expect(cm[1]).toBe("C:/a/sub");
  });
});

describe("createFolderTree - refreshTreeRunningState", () => {
  it("toggles .running on .tree-node[data-path] and .show on .unread-dot", () => {
    const { ft, helpers } = mk();
    document.getElementById("folder-tree")!.innerHTML = `
      <div class="tree-node" data-path="c:/r1"><div class="unread-dot"></div></div>
      <div class="tree-node" data-path="c:/r2"><div class="unread-dot"></div></div>
    `;
    helpers.buildRunningUnreadSets.mockReturnValue({
      running: new Set(["c:/r1"]),
      unread: new Set(["c:/r2"]),
    });
    ft.refreshTreeRunningState();
    const n1 = document.querySelector('.tree-node[data-path="c:/r1"]')!;
    const n2 = document.querySelector('.tree-node[data-path="c:/r2"]')!;
    expect(n1.classList.contains("running")).toBe(true);
    expect(n2.classList.contains("running")).toBe(false);
    expect(n1.querySelector(".unread-dot")!.classList.contains("show")).toBe(false);
    expect(n2.querySelector(".unread-dot")!.classList.contains("show")).toBe(true);
  });

  it("toggles .running on .tree-root-label[data-path] .root-name and .unread-dot", () => {
    const { ft, helpers } = mk();
    document.getElementById("folder-tree")!.innerHTML = `
      <div class="tree-root-label" data-path="c:/r1">
        <span class="root-name">r1</span>
        <div class="unread-dot"></div>
      </div>
    `;
    helpers.buildRunningUnreadSets.mockReturnValue({
      running: new Set(["c:/r1"]),
      unread: new Set(["c:/r1"]),
    });
    ft.refreshTreeRunningState();
    expect(document.querySelector(".root-name")!.classList.contains("running")).toBe(true);
    expect(document.querySelector(".unread-dot")!.classList.contains("show")).toBe(true);
  });
});
