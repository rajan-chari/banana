import { describe, expect, it } from "vitest";
import {
  buildPromptsResponse,
  buildServerDebugInfo,
  buildTimersInfo,
  groupSessionsByRepoRoot,
} from "../src/debug-routes-helpers.js";
import { SUBMIT } from "../src/session.js";
import type { PtySession } from "../src/session.js";
import type { ServerConfig } from "../src/config.js";

/** Minimal PtySession-shaped fake. */
function fakeSession(state: Record<string, unknown>): PtySession {
  return { getDebugState: () => state } as unknown as PtySession;
}

const config: ServerConfig = {
  rootDirs: ["/r1"],
  port: 3600,
  host: "127.0.0.1",
  name: "x",
  debug: false,
  emcomServer: "http://127.0.0.1:8800",
};

describe("groupSessionsByRepoRoot", () => {
  it("returns {} for empty map", () => {
    expect(groupSessionsByRepoRoot(new Map())).toEqual({});
  });

  it("collects multiple session names per root", () => {
    const m = new Map([
      ["s1", "/r/a"],
      ["s2", "/r/a"],
      ["s3", "/r/b"],
    ]);
    expect(groupSessionsByRepoRoot(m)).toEqual({
      "/r/a": ["s1", "s2"],
      "/r/b": ["s3"],
    });
  });

  it("preserves insertion order of sessions within each root", () => {
    const m = new Map([
      ["z", "/r"],
      ["a", "/r"],
      ["m", "/r"],
    ]);
    expect(groupSessionsByRepoRoot(m)).toEqual({ "/r": ["z", "a", "m"] });
  });
});

describe("buildServerDebugInfo", () => {
  it("constructs the full payload deterministically with injected nowMs", () => {
    const sessions = new Map<string, PtySession>([
      ["s1", fakeSession({})],
      ["s2", fakeSession({})],
    ]);
    const sessionRepoRoots = new Map([
      ["s1", "/r"],
      ["s2", "/r"],
    ]);
    const out = buildServerDebugInfo({
      sessions,
      sessionRepoRoots,
      config,
      costHistoryLength: 7,
      wsClientCount: 3,
      nowMs: 1234,
    });
    expect(out).toEqual({
      serverTime: 1234,
      config: {
        port: 3600,
        host: "127.0.0.1",
        debug: false,
        emcomServer: "http://127.0.0.1:8800",
        rootDirs: ["/r1"],
      },
      sessionCount: 2,
      wsClientCount: 3,
      repoGroups: { "/r": ["s1", "s2"] },
      costHistoryLength: 7,
    });
  });

  it("uses Date.now() when nowMs is not provided", () => {
    const before = Date.now();
    const out = buildServerDebugInfo({
      sessions: new Map(),
      sessionRepoRoots: new Map(),
      config,
      costHistoryLength: 0,
      wsClientCount: 0,
    });
    const after = Date.now();
    expect(out.serverTime).toBeGreaterThanOrEqual(before);
    expect(out.serverTime).toBeLessThanOrEqual(after);
  });

  it("does not leak unrelated config fields", () => {
    const out = buildServerDebugInfo({
      sessions: new Map(),
      sessionRepoRoots: new Map(),
      config: { ...config, name: "leaked-name-should-not-appear" },
      costHistoryLength: 0,
      wsClientCount: 0,
      nowMs: 0,
    });
    expect(out.config).not.toHaveProperty("name");
  });
});

describe("buildPromptsResponse", () => {
  it("includes session name and submit-char metadata", () => {
    const out = buildPromptsResponse("alpha");
    expect(out.session).toBe("alpha");
    expect(out.submitChar).toBe(SUBMIT === "\r" ? "\\r" : "\\n");
    expect(out.submitCharCode).toBe(SUBMIT.charCodeAt(0));
  });

  it("invokes each prompt factory and returns a string for each", () => {
    const out = buildPromptsResponse("s");
    expect(typeof out.emcom).toBe("string");
    expect(typeof out.startupKick).toBe("string");
    expect(typeof out.resumeKick).toBe("string");
    expect(typeof out.checkpointLight).toBe("string");
    expect(typeof out.checkpointFull).toBe("string");
  });

  it("uses the fixed HH:MM placeholder in checkpoint prompts", () => {
    const out = buildPromptsResponse("s");
    expect(out.checkpointLight).toContain("HH:MM");
    expect(out.checkpointFull).toContain("HH:MM");
  });
});

describe("buildTimersInfo", () => {
  it("returns empty sessions map for empty input", () => {
    const out = buildTimersInfo({
      sessions: new Map(),
      sessionRepoRoots: new Map(),
      nowMs: 100,
    });
    expect(out).toEqual({ serverTime: 100, sessions: {} });
  });

  it("projects only the documented timer fields", () => {
    const sessions = new Map([["s1", fakeSession({
      status: "idle",
      quietMs: 1000,
      pendingCheckpoint: false,
      checkpointInFlight: false,
      lastCheckpointTime: 0,
      lastCheckpointAgoMs: 9999,
      checkpointLightTimerActive: true,
      checkpointFullTimerActive: false,
      heuristicTimerActive: true,
      // Fields below should NOT appear in the result.
      somethingElse: "leak-me",
      anotherField: 42,
    })]]);
    const sessionRepoRoots = new Map([["s1", "/r/a"]]);
    const out = buildTimersInfo({ sessions, sessionRepoRoots, nowMs: 5 });
    expect(out.sessions["s1"]).toEqual({
      repoRoot: "/r/a",
      status: "idle",
      quietMs: 1000,
      pendingCheckpoint: false,
      checkpointInFlight: false,
      lastCheckpointTime: 0,
      lastCheckpointAgoMs: 9999,
      checkpointLightTimerActive: true,
      checkpointFullTimerActive: false,
      heuristicTimerActive: true,
    });
  });

  it("maps repoRoot to null when session is not in sessionRepoRoots map", () => {
    const sessions = new Map([["s1", fakeSession({ status: "idle" })]]);
    const out = buildTimersInfo({
      sessions,
      sessionRepoRoots: new Map(),
      nowMs: 0,
    });
    expect((out.sessions["s1"] as { repoRoot: string | null }).repoRoot).toBeNull();
  });
});
