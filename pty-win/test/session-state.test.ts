import { describe, it, expect } from "vitest";
import {
  initialState,
  onData,
  onExit,
  onHookStop,
  onHookPromptSubmit,
  onHookNotify,
  onForceIdle,
  onHeuristicIdle,
  type SessionState,
  type SideEffect,
} from "../src/session-state.js";

function state(overrides: Partial<SessionState> = {}): SessionState {
  return { ...initialState(), ...overrides };
}

function hasEffect(effects: SideEffect[], type: string): boolean {
  return effects.some((e) => e.type === type);
}

function getEffect<T extends SideEffect>(effects: SideEffect[], type: string): T | undefined {
  return effects.find((e) => e.type === type) as T | undefined;
}

describe("initialState", () => {
  it("starts in 'starting' status", () => {
    expect(initialState().status).toBe("starting");
  });

  it("has no pending messages or checkpoints", () => {
    const s = initialState();
    expect(s.pendingMessages).toBe(false);
    expect(s.pendingCheckpoint).toBeNull();
  });
});

describe("onData", () => {
  it("transitions starting → busy", () => {
    const { state: next, effects } = onData(state({ status: "starting" }));
    expect(next.status).toBe("busy");
    expect(hasEffect(effects, "set-status")).toBe(true);
  });

  it("transitions idle → busy", () => {
    const { state: next, effects } = onData(state({ status: "idle" }));
    expect(next.status).toBe("busy");
    expect(hasEffect(effects, "set-status")).toBe(true);
  });

  it("stays busy when already busy (no effect)", () => {
    const { state: next, effects } = onData(state({ status: "busy" }));
    expect(next.status).toBe("busy");
    expect(effects.length).toBe(0);
  });

  it("updates lastOutputTime", () => {
    const before = Date.now();
    const { state: next } = onData(state({ lastOutputTime: 0 }));
    expect(next.lastOutputTime).toBeGreaterThanOrEqual(before);
  });
});

describe("onExit", () => {
  it("transitions any status to dead", () => {
    for (const status of ["starting", "busy", "idle"] as const) {
      const { state: next } = onExit(state({ status }));
      expect(next.status).toBe("dead");
    }
  });
});

describe("onHookStop", () => {
  it("transitions busy → idle", () => {
    const { state: next, effects } = onHookStop(state({ status: "busy" }));
    expect(next.status).toBe("idle");
    expect(hasEffect(effects, "set-status")).toBe(true);
  });

  it("does nothing when dead", () => {
    const { state: next, effects } = onHookStop(state({ status: "dead" }));
    expect(next.status).toBe("dead");
    expect(effects.length).toBe(0);
  });

  it("triggers startup kick if pending", () => {
    const { state: next, effects } = onHookStop(
      state({ status: "busy", needsStartupKick: true, isResumedSession: false })
    );
    expect(next.needsStartupKick).toBe(false);
    expect(next.status).toBe("busy"); // stays busy after kick
    expect(hasEffect(effects, "inject-startup-kick")).toBe(true);
    const kick = getEffect(effects, "inject-startup-kick") as any;
    expect(kick.resumed).toBe(false);
  });

  it("triggers resume kick if resumed session", () => {
    const { effects } = onHookStop(
      state({ status: "busy", needsStartupKick: true, isResumedSession: true })
    );
    const kick = getEffect(effects, "inject-startup-kick") as any;
    expect(kick.resumed).toBe(true);
  });

  it("triggers emcom injection when messages pending", () => {
    const { effects } = onHookStop(state({ status: "busy", pendingMessages: true }));
    expect(hasEffect(effects, "inject-emcom")).toBe(true);
  });

  it("triggers checkpoint when pending and no delay active", () => {
    const { effects } = onHookStop(
      state({ status: "busy", pendingCheckpoint: "light", checkpointStartDelay: false })
    );
    expect(hasEffect(effects, "schedule-checkpoint")).toBe(true);
    const cp = getEffect(effects, "schedule-checkpoint") as any;
    expect(cp.kind).toBe("light");
  });

  it("skips checkpoint when delay is active", () => {
    const { effects } = onHookStop(
      state({ status: "busy", pendingCheckpoint: "full", checkpointStartDelay: true })
    );
    expect(hasEffect(effects, "schedule-checkpoint")).toBe(false);
  });

  it("emcom takes priority over checkpoint", () => {
    const { effects } = onHookStop(
      state({ status: "busy", pendingMessages: true, pendingCheckpoint: "full" })
    );
    expect(hasEffect(effects, "inject-emcom")).toBe(true);
    expect(hasEffect(effects, "schedule-checkpoint")).toBe(false);
  });

  it("stamps checkpoint time when checkpoint was in flight", () => {
    const { state: next, effects } = onHookStop(
      state({ status: "busy", checkpointInFlight: true })
    );
    expect(next.checkpointInFlight).toBe(false);
    expect(next.lastCheckpointTime).toBeGreaterThan(0);
    expect(hasEffect(effects, "stamp-checkpoint-time")).toBe(true);
  });
});

describe("onHookPromptSubmit", () => {
  it("transitions idle → busy", () => {
    const { state: next } = onHookPromptSubmit(state({ status: "idle" }));
    expect(next.status).toBe("busy");
  });

  it("transitions starting → busy", () => {
    const { state: next } = onHookPromptSubmit(state({ status: "starting" }));
    expect(next.status).toBe("busy");
  });

  it("does nothing when dead", () => {
    const { effects } = onHookPromptSubmit(state({ status: "dead" }));
    expect(effects.length).toBe(0);
  });

  it("resets busy tracking", () => {
    const { state: next } = onHookPromptSubmit(state({ status: "idle" }));
    expect(next.busyStartTime).toBeGreaterThan(0);
    expect(next.busyTimeoutSaved).toBe(false);
  });
});

describe("onHookNotify", () => {
  it("idle_prompt confirms idle and injects emcom", () => {
    const { state: next, effects } = onHookNotify(
      state({ status: "busy", pendingMessages: true }),
      "idle_prompt"
    );
    expect(next.status).toBe("idle");
    expect(hasEffect(effects, "inject-emcom")).toBe(true);
  });

  it("idle_prompt no-ops if already idle", () => {
    const { effects } = onHookNotify(
      state({ status: "idle", pendingMessages: false }),
      "idle_prompt"
    );
    expect(hasEffect(effects, "set-status")).toBe(false);
  });

  it("permission_prompt does nothing", () => {
    const { state: next, effects } = onHookNotify(
      state({ status: "busy" }),
      "permission_prompt"
    );
    expect(next.status).toBe("busy");
    expect(effects.length).toBe(0);
  });

  it("does nothing when dead", () => {
    const { effects } = onHookNotify(state({ status: "dead" }), "idle_prompt");
    expect(effects.length).toBe(0);
  });
});

describe("onForceIdle", () => {
  it("transitions busy → idle", () => {
    const { state: next } = onForceIdle(state({ status: "busy" }));
    expect(next.status).toBe("idle");
  });

  it("triggers emcom when messages pending", () => {
    const { effects } = onForceIdle(state({ status: "busy", pendingMessages: true }));
    expect(hasEffect(effects, "inject-emcom")).toBe(true);
  });

  it("stamps checkpoint time when in-flight", () => {
    const { state: next, effects } = onForceIdle(
      state({ status: "busy", checkpointInFlight: true })
    );
    expect(next.checkpointInFlight).toBe(false);
    expect(hasEffect(effects, "stamp-checkpoint-time")).toBe(true);
  });
});

describe("onHeuristicIdle", () => {
  it("transitions busy → idle", () => {
    const { state: next } = onHeuristicIdle(state({ status: "busy" }));
    expect(next.status).toBe("idle");
  });

  it("no-ops when not busy", () => {
    for (const status of ["idle", "starting", "dead"] as const) {
      const { effects } = onHeuristicIdle(state({ status }));
      expect(effects.length).toBe(0);
    }
  });

  it("triggers startup kick if pending", () => {
    const { state: next, effects } = onHeuristicIdle(
      state({ status: "busy", needsStartupKick: true })
    );
    expect(next.needsStartupKick).toBe(false);
    expect(hasEffect(effects, "inject-startup-kick")).toBe(true);
    expect(next.status).toBe("busy"); // stays busy after kick
  });

  it("triggers emcom over checkpoint", () => {
    const { effects } = onHeuristicIdle(
      state({ status: "busy", pendingMessages: true, pendingCheckpoint: "full" })
    );
    expect(hasEffect(effects, "inject-emcom")).toBe(true);
    expect(hasEffect(effects, "schedule-checkpoint")).toBe(false);
  });

  it("triggers checkpoint when no messages", () => {
    const { effects } = onHeuristicIdle(
      state({ status: "busy", pendingCheckpoint: "full" })
    );
    expect(hasEffect(effects, "schedule-checkpoint")).toBe(true);
  });
});

describe("state machine invariants", () => {
  it("dead is absorbing — no transition leaves dead", () => {
    const dead = state({ status: "dead" });
    expect(onData(dead).state.status).toBe("dead"); // data still updates lastOutputTime but doesn't change dead
    expect(onHookStop(dead).state.status).toBe("dead");
    expect(onHookPromptSubmit(dead).state.status).toBe("dead");
    expect(onHookNotify(dead, "idle_prompt").state.status).toBe("dead");
  });

  it("startup kick clears needsStartupKick and stays busy", () => {
    const s = state({ status: "busy", needsStartupKick: true });
    const r1 = onHookStop(s);
    expect(r1.state.needsStartupKick).toBe(false);
    expect(r1.state.status).toBe("busy");
    // Second call should not inject kick again
    const r2 = onHookStop(r1.state);
    expect(hasEffect(r2.effects, "inject-startup-kick")).toBe(false);
    expect(r2.state.status).toBe("idle");
  });

  it("full lifecycle: starting → busy → idle → busy → idle → dead", () => {
    let s = state({ status: "starting" });
    // Data arrives → busy
    s = onData(s).state;
    expect(s.status).toBe("busy");
    // Hook stop → idle
    s = onHookStop(s).state;
    expect(s.status).toBe("idle");
    // Prompt submit → busy
    s = onHookPromptSubmit(s).state;
    expect(s.status).toBe("busy");
    // Hook stop → idle
    s = onHookStop(s).state;
    expect(s.status).toBe("idle");
    // Exit → dead
    s = onExit(s).state;
    expect(s.status).toBe("dead");
  });
});
