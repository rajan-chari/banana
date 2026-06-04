// Folder-tree pure helpers.
//
// Companion to tracker e0ca3757 / 8eb3a993 Phase 3.
//
// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import {
  isFolderRunning,
  buildRunningUnreadSets,
  resolveFolderSessions,
  folderCountText,
  buildTreeRowActionsOpts,
  applyFolderInfoToTreeLabel,
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
