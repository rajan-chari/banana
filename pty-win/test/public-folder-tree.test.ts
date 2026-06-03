// Folder-tree pure helpers.
//
// Companion to tracker e0ca3757 / 8eb3a993 Phase 3.

import { describe, it, expect } from "vitest";
import {
  isFolderRunning,
  buildRunningUnreadSets,
  resolveFolderSessions,
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
