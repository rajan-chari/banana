// Tests for pure helpers extracted from src/server/shutdown.ts.
// The timer-driven and IO phases (sendStaggeredSavePrompts,
// waitForSessionsIdle, persistShutdownSnapshot, terminateAllSessions)
// stay module-private — we only test the data-shaping helpers, which
// is where the bug-risk lives.

import { describe, it, expect } from "vitest";
import {
  AI_COMMANDS,
  shutdownPrompt,
  collectActiveAiSessions,
  groupSessionsByRepo,
  buildSessionLabel,
  collectCostsData,
} from "../src/server/shutdown.js";

// PtySession stand-in. collectActiveAiSessions and collectCostsData only
// touch .getInfo(), so we can fake it without instantiating the real class.
type FakeSession = {
  getInfo: () => {
    status: string;
    command: string;
    costUsd: number;
    emcomIdentity?: string | null;
  };
};

function mk(status: string, command: string, costUsd = 0, emcomIdentity: string | null = null): FakeSession {
  return { getInfo: () => ({ status, command, costUsd, emcomIdentity }) };
}

// Coerce our fake Map into the real signature for the call site. The
// helpers only use the Map iteration + .getInfo() contract.
function asSessions(entries: Array<[string, FakeSession]>): Map<string, never> {
  return new Map(entries) as unknown as Map<string, never>;
}

describe("AI_COMMANDS", () => {
  it("includes the supported AI CLI commands", () => {
    expect(AI_COMMANDS).toEqual(["claude", "agency cc", "agency cp", "copilot", "pi"]);
  });
});

describe("shutdownPrompt", () => {
  it("formats the timestamp + tag and contains the urgent shutdown hint", () => {
    const fixed = new Date(2026, 5, 4, 16, 8);
    const out = shutdownPrompt(fixed);
    expect(out).toContain("[2026-06-04 16:08 pty-win:shutdown:urgent:urgent]");
    expect(out).toContain("Server shutting down");
    expect(out).toContain("tracker.md and briefing.md");
  });

  it("zero-pads month, day, hour, minute", () => {
    const out = shutdownPrompt(new Date(2026, 0, 1, 1, 5));
    expect(out).toContain("[2026-01-01 01:05 ");
  });
});

describe("collectActiveAiSessions", () => {
  it("keeps AI sessions in non-dead status", () => {
    const sessions = asSessions([
      ["a", mk("idle", "claude")],
      ["b", mk("busy", "copilot")],
      ["c", mk("starting", "agency cc")],
    ]);
    const out = collectActiveAiSessions(sessions);
    expect(out.map(([n]) => n)).toEqual(["a", "b", "c"]);
  });

  it("drops dead sessions even if AI", () => {
    const sessions = asSessions([
      ["dead-ai", mk("dead", "claude")],
      ["live-ai", mk("idle", "claude")],
    ]);
    expect(collectActiveAiSessions(sessions).map(([n]) => n)).toEqual(["live-ai"]);
  });

  it("drops non-AI commands even if live", () => {
    const sessions = asSessions([
      ["shell", mk("idle", "pwsh")],
      ["bash", mk("busy", "bash")],
      ["claude", mk("idle", "claude")],
    ]);
    expect(collectActiveAiSessions(sessions).map(([n]) => n)).toEqual(["claude"]);
  });

  it("accepts a custom command list", () => {
    const sessions = asSessions([
      ["a", mk("idle", "foo")],
      ["b", mk("idle", "bar")],
    ]);
    expect(collectActiveAiSessions(sessions, ["foo"]).map(([n]) => n)).toEqual(["a"]);
  });

  it("returns empty array for empty input", () => {
    expect(collectActiveAiSessions(asSessions([]))).toEqual([]);
  });
});

describe("groupSessionsByRepo", () => {
  it("groups sessions by their repo root", () => {
    const repoRoots = new Map([
      ["a", "C:/repo1"],
      ["b", "C:/repo1"],
      ["c", "C:/repo2"],
    ]);
    const pairs: Array<[string, string]> = [["a", "A"], ["b", "B"], ["c", "C"]];
    const groups = groupSessionsByRepo(pairs, repoRoots);
    expect(groups.size).toBe(2);
    expect(groups.get("C:/repo1")?.map(([n]) => n)).toEqual(["a", "b"]);
    expect(groups.get("C:/repo2")?.map(([n]) => n)).toEqual(["c"]);
  });

  it("falls back to __solo_<name> for sessions without a known root", () => {
    const groups = groupSessionsByRepo(
      [["solo1", "x"], ["solo2", "y"]],
      new Map(),
    );
    expect([...groups.keys()].sort()).toEqual(["__solo_solo1", "__solo_solo2"]);
    expect(groups.get("__solo_solo1")?.length).toBe(1);
  });

  it("mixes known + unknown repos correctly", () => {
    const groups = groupSessionsByRepo(
      [["a", 1], ["b", 2], ["c", 3]],
      new Map([["a", "C:/r"], ["b", "C:/r"]]),
    );
    expect(groups.get("C:/r")?.length).toBe(2);
    expect(groups.get("__solo_c")?.length).toBe(1);
  });
});

describe("buildSessionLabel", () => {
  it("returns name when identity is missing", () => {
    expect(buildSessionLabel("alpha")).toBe("alpha");
    expect(buildSessionLabel("alpha", null)).toBe("alpha");
    expect(buildSessionLabel("alpha", undefined)).toBe("alpha");
    expect(buildSessionLabel("alpha", "")).toBe("alpha");
  });

  it("prefixes identity with @ when present", () => {
    expect(buildSessionLabel("alpha", "moss")).toBe("alpha (@moss)");
  });
});

describe("collectCostsData", () => {
  it("collects positive costs from live sessions", () => {
    const sessions = asSessions([
      ["a", mk("idle", "claude", 1.5)],
      ["b", mk("busy", "claude", 2.25)],
    ]);
    expect(collectCostsData(sessions, new Map())).toEqual({ a: 1.5, b: 2.25 });
  });

  it("skips zero-cost sessions from live map", () => {
    const sessions = asSessions([
      ["a", mk("idle", "claude", 0)],
      ["b", mk("busy", "claude", 0.5)],
    ]);
    expect(collectCostsData(sessions, new Map())).toEqual({ b: 0.5 });
  });

  it("falls back to savedCosts for sessions absent or zero in live map", () => {
    const sessions = asSessions([
      ["a", mk("idle", "claude", 0)],
    ]);
    const savedCosts = new Map([
      ["a", 3.0],
      ["b", 4.0],
    ]);
    expect(collectCostsData(sessions, savedCosts)).toEqual({ a: 3.0, b: 4.0 });
  });

  it("prefers live cost over savedCosts when both > 0", () => {
    const sessions = asSessions([
      ["a", mk("idle", "claude", 1.0)],
    ]);
    const savedCosts = new Map([["a", 99.0]]);
    expect(collectCostsData(sessions, savedCosts)).toEqual({ a: 1.0 });
  });

  it("returns empty object when both inputs empty", () => {
    expect(collectCostsData(asSessions([]), new Map())).toEqual({});
  });
});
