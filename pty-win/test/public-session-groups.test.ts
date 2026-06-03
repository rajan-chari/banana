// Session-group derivation — pure functions.
//
// Companion to tracker e0ca3757 / 8eb3a993 Phase 3.

import { describe, it, expect } from "vitest";
import {
  buildSessionGroups,
  computeGroupStatus,
  computeGroupUnread,
  getActiveSessionName,
} from "../public/lib/session-groups.js";
import type {
  PaneGroup,
  SessionInfo,
  ActiveSessionGroup,
} from "../public/lib/session-groups.js";

function s(partial: Partial<SessionInfo> & { name: string }): SessionInfo {
  return { status: "idle", ...partial } as SessionInfo;
}

describe("buildSessionGroups", () => {
  it("returns empty when paneGroups is empty", () => {
    expect(buildSessionGroups(new Map(), new Map())).toEqual([]);
  });

  it("includes a group with one live claude session", () => {
    const sessions = new Map<string, SessionInfo>([
      ["alice", s({ name: "alice", status: "idle", workingDir: "C:/repo/alice" })],
    ]);
    const pg: PaneGroup = { claude: "alice", pwsh: null, activeType: "claude" };
    const out = buildSessionGroups(new Map([["alice", pg]]), sessions);
    expect(out).toHaveLength(1);
    expect(out[0].group).toBe("alice");
    expect(out[0].claudeAlive).toBe(true);
    expect(out[0].pwshAlive).toBe(false);
    expect(out[0].workingDir).toBe("C:/repo/alice");
    expect(out[0].pg).toBe(pg);
  });

  it("includes a group with only a live pwsh session", () => {
    const sessions = new Map<string, SessionInfo>([
      ["alice~pwsh", s({ name: "alice~pwsh", workingDir: "C:/repo/alice" })],
    ]);
    const pg: PaneGroup = { claude: "alice", pwsh: "alice~pwsh", activeType: "pwsh" };
    const out = buildSessionGroups(new Map([["alice", pg]]), sessions);
    expect(out).toHaveLength(1);
    expect(out[0].claudeAlive).toBe(false);
    expect(out[0].pwshAlive).toBe(true);
    expect(out[0].workingDir).toBe("C:/repo/alice");
  });

  it("excludes groups where both members are dead", () => {
    const sessions = new Map<string, SessionInfo>([
      ["alice", s({ name: "alice", status: "dead", workingDir: "C:/repo/a" })],
      ["alice~pwsh", s({ name: "alice~pwsh", status: "dead", workingDir: "C:/repo/a" })],
    ]);
    const pg: PaneGroup = { claude: "alice", pwsh: "alice~pwsh", activeType: "claude" };
    expect(buildSessionGroups(new Map([["alice", pg]]), sessions)).toEqual([]);
  });

  it("excludes groups whose members are missing from sessions Map", () => {
    const pg: PaneGroup = { claude: "ghost", pwsh: "ghost~pwsh", activeType: "claude" };
    expect(buildSessionGroups(new Map([["ghost", pg]]), new Map())).toEqual([]);
  });

  it("uses claude.workingDir when both claude and pwsh are alive", () => {
    const sessions = new Map<string, SessionInfo>([
      ["alice", s({ name: "alice", workingDir: "C:/from-claude" })],
      ["alice~pwsh", s({ name: "alice~pwsh", workingDir: "C:/from-pwsh" })],
    ]);
    const pg: PaneGroup = { claude: "alice", pwsh: "alice~pwsh", activeType: "claude" };
    const out = buildSessionGroups(new Map([["alice", pg]]), sessions);
    expect(out[0].workingDir).toBe("C:/from-claude");
  });

  it("preserves iteration order of paneGroups", () => {
    const sessions = new Map<string, SessionInfo>([
      ["a", s({ name: "a", workingDir: "C:/a" })],
      ["b", s({ name: "b", workingDir: "C:/b" })],
      ["c", s({ name: "c", workingDir: "C:/c" })],
    ]);
    const paneGroups = new Map<string, PaneGroup>([
      ["b", { claude: "b", pwsh: null, activeType: "claude" }],
      ["c", { claude: "c", pwsh: null, activeType: "claude" }],
      ["a", { claude: "a", pwsh: null, activeType: "claude" }],
    ]);
    const out = buildSessionGroups(paneGroups, sessions);
    expect(out.map((g: ActiveSessionGroup) => g.group)).toEqual(["b", "c", "a"]);
  });

  it("treats pg.claude=null and pg.pwsh=null as no-session", () => {
    const pg: PaneGroup = { claude: null, pwsh: null, activeType: "claude" };
    expect(buildSessionGroups(new Map([["empty", pg]]), new Map())).toEqual([]);
  });
});

describe("computeGroupStatus", () => {
  const aliveIdle = s({ name: "x", status: "idle" });
  const aliveBusy = s({ name: "x", status: "busy" });
  const aliveStart = s({ name: "x", status: "starting" });
  const alivePerm = s({ name: "x", status: "idle", pendingPermission: true });
  const aliveBusyPerm = s({ name: "x", status: "busy", pendingPermission: true });

  it("returns 'idle' when only-idle live sessions", () => {
    expect(computeGroupStatus(aliveIdle, null, true, false)).toBe("idle");
    expect(computeGroupStatus(aliveIdle, aliveIdle, true, true)).toBe("idle");
  });

  it("returns 'busy' when any live session is busy", () => {
    expect(computeGroupStatus(aliveBusy, null, true, false)).toBe("busy");
    expect(computeGroupStatus(aliveIdle, aliveBusy, true, true)).toBe("busy");
  });

  it("returns 'starting' when any live session is starting (no busy)", () => {
    expect(computeGroupStatus(aliveStart, null, true, false)).toBe("starting");
    expect(computeGroupStatus(aliveIdle, aliveStart, true, true)).toBe("starting");
  });

  it("prefers 'busy' over 'starting' when both present", () => {
    expect(computeGroupStatus(aliveBusy, aliveStart, true, true)).toBe("busy");
  });

  it("returns 'permission' when any live session has pendingPermission", () => {
    expect(computeGroupStatus(alivePerm, null, true, false)).toBe("permission");
    expect(computeGroupStatus(aliveIdle, alivePerm, true, true)).toBe("permission");
  });

  it("'permission' overrides 'busy'", () => {
    expect(computeGroupStatus(aliveBusyPerm, null, true, false)).toBe("permission");
    expect(computeGroupStatus(aliveBusy, alivePerm, true, true)).toBe("permission");
  });

  it("ignores pendingPermission on dead sessions (alive flag false)", () => {
    expect(computeGroupStatus(alivePerm, aliveIdle, false, true)).toBe("idle");
  });

  it("ignores status on dead sessions", () => {
    expect(computeGroupStatus(aliveBusy, aliveIdle, false, true)).toBe("idle");
  });

  it("returns 'idle' when both null/dead", () => {
    expect(computeGroupStatus(null, null, false, false)).toBe("idle");
  });
});

describe("computeGroupUnread", () => {
  it("returns 0 when nothing alive", () => {
    expect(computeGroupUnread(null, null, false, false)).toBe(0);
  });

  it("sums claude + pwsh when both alive", () => {
    expect(
      computeGroupUnread(
        s({ name: "x", unreadCount: 3 }),
        s({ name: "y", unreadCount: 5 }),
        true,
        true,
      ),
    ).toBe(8);
  });

  it("treats missing unreadCount as 0", () => {
    expect(
      computeGroupUnread(s({ name: "x" }), s({ name: "y", unreadCount: 4 }), true, true),
    ).toBe(4);
  });

  it("ignores unread on dead sessions", () => {
    expect(
      computeGroupUnread(
        s({ name: "x", unreadCount: 99 }),
        s({ name: "y", unreadCount: 1 }),
        false,
        true,
      ),
    ).toBe(1);
  });
});

describe("getActiveSessionName", () => {
  it("returns pg.pwsh when activeType='pwsh' and pwshAlive", () => {
    const pg: PaneGroup = { claude: "alice", pwsh: "alice~pwsh", activeType: "pwsh" };
    expect(getActiveSessionName(pg, true, true)).toBe("alice~pwsh");
  });

  it("falls back to claude when activeType='pwsh' but pwsh is dead", () => {
    const pg: PaneGroup = { claude: "alice", pwsh: "alice~pwsh", activeType: "pwsh" };
    expect(getActiveSessionName(pg, true, false)).toBe("alice");
  });

  it("returns pg.claude when activeType='claude' and claude alive", () => {
    const pg: PaneGroup = { claude: "alice", pwsh: "alice~pwsh", activeType: "claude" };
    expect(getActiveSessionName(pg, true, true)).toBe("alice");
  });

  it("falls back to pwsh when claude is dead", () => {
    const pg: PaneGroup = { claude: "alice", pwsh: "alice~pwsh", activeType: "claude" };
    expect(getActiveSessionName(pg, false, true)).toBe("alice~pwsh");
  });

  it("returns pg.pwsh even when pwshAlive=false if claude is also dead (matches original fallback)", () => {
    const pg: PaneGroup = { claude: "alice", pwsh: "alice~pwsh", activeType: "claude" };
    expect(getActiveSessionName(pg, false, false)).toBe("alice~pwsh");
  });

  it("returns null when pg.claude and pg.pwsh are both unset", () => {
    const pg: PaneGroup = { claude: null, pwsh: null, activeType: "claude" };
    expect(getActiveSessionName(pg, false, false)).toBe(null);
  });
});
