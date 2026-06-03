import { afterEach, describe, it, expect, vi } from "vitest";
import { SessionCheckpointController, type CheckpointType } from "../src/session-checkpoint.js";
import type { SessionStatus } from "../src/session-state.js";

function makeController(options: {
  command?: string;
  status?: SessionStatus;
  checkpointOffsetMs?: number;
  lastOutputTime?: number;
  costUsd?: number;
} = {}) {
  let status = options.status ?? "idle";
  let lastOutputTime = options.lastOutputTime ?? Date.now();
  let costUsd = options.costUsd ?? 0;
  const injected: Array<{ type: CheckpointType; prompt: string }> = [];
  const logs: string[] = [];

  const controller = new SessionCheckpointController({
    sessionName: "test-session",
    command: options.command ?? "claude",
    checkpointOffsetMs: options.checkpointOffsetMs ?? 0,
    getStatus: () => status,
    getLastOutputTime: () => lastOutputTime,
    getCostUsd: () => costUsd,
    onInject: (type, prompt) => injected.push({ type, prompt }),
    log: (message) => logs.push(message),
  });

  return {
    controller,
    injected,
    logs,
    setStatus: (nextStatus: SessionStatus) => { status = nextStatus; },
    setLastOutputTime: (nextLastOutputTime: number) => { lastOutputTime = nextLastOutputTime; },
    setCostUsd: (nextCostUsd: number) => { costUsd = nextCostUsd; },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionCheckpointController", () => {
  it("trigger injects immediately while idle", () => {
    const harness = makeController({ status: "idle" });

    const result = harness.controller.trigger("light");

    expect(result).toEqual({ injected: true });
    expect(harness.injected).toHaveLength(1);
    expect(harness.injected[0].type).toBe("light");
    expect(harness.injected[0].prompt).toContain("Checkpoint (light");
    expect(harness.controller.getState().checkpointInFlight).toBe(true);
    expect(harness.controller.getState().pendingCheckpoint).toBeNull();
  });

  it("trigger queues while busy and injects when the session becomes idle", () => {
    const harness = makeController({ status: "busy" });

    const result = harness.controller.trigger("full");
    expect(result).toEqual({ injected: false, reason: "session is busy, queued as pending" });
    expect(harness.injected).toHaveLength(0);
    expect(harness.controller.getState().pendingCheckpoint).toBe("full");

    harness.setStatus("idle");
    harness.controller.onSessionIdle();

    expect(harness.injected).toHaveLength(1);
    expect(harness.injected[0].type).toBe("full");
    expect(harness.injected[0].prompt).toContain("Full checkpoint");
  });

  it("adds current session cost to checkpoint prompts when cost is non-zero", () => {
    const harness = makeController({ status: "idle", costUsd: 1.234 });

    harness.controller.trigger("light");

    expect(harness.injected[0].prompt).toContain("Session cost: $1.23.");
  });

  it("onSessionIdle stamps completed checkpoint time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));
    const harness = makeController({ status: "idle" });

    harness.controller.trigger("light");
    expect(harness.controller.getState().checkpointInFlight).toBe(true);

    const expectedIdleTime = new Date("2026-06-02T12:01:00Z").getTime();
    vi.setSystemTime(expectedIdleTime);
    harness.controller.onSessionIdle();

    expect(harness.controller.getState().checkpointInFlight).toBe(false);
    expect(harness.controller.getState().lastCheckpointTime).toBe(expectedIdleTime);
  });

  it("start does not arm timers for non-AI commands", () => {
    const harness = makeController({ command: "pwsh" });

    harness.controller.start();

    expect(harness.controller.getState().checkpointLightTimerActive).toBe(false);
    expect(harness.controller.getState().checkpointFullTimerActive).toBe(false);
  });

  it("start arms timers for AI commands and stop clears them", () => {
    const harness = makeController({ command: "claude" });

    harness.controller.start();
    expect(harness.controller.getState().checkpointLightTimerActive).toBe(true);
    expect(harness.controller.getState().checkpointFullTimerActive).toBe(true);

    harness.controller.stop();
    expect(harness.controller.getState().checkpointLightTimerActive).toBe(false);
    expect(harness.controller.getState().checkpointFullTimerActive).toBe(false);
  });

  it("scheduled checkpoints respect stagger offset before injection", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));
    const harness = makeController({
      status: "idle",
      checkpointOffsetMs: 1_000,
      lastOutputTime: Date.now() + 1,
    });

    harness.controller.start();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);

    expect(harness.controller.getState().checkpointStartDelayActive).toBe(true);
    expect(harness.injected).toHaveLength(0);

    vi.advanceTimersByTime(999);
    expect(harness.injected).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(harness.injected).toHaveLength(1);
    expect(harness.injected[0].type).toBe("light");
  });

  it("light timer skips when a full checkpoint is already pending", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));
    const harness = makeController({ status: "busy", lastOutputTime: Date.now() + 1 });

    harness.controller.trigger("full");
    harness.controller.start();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);

    expect(harness.controller.getState().pendingCheckpoint).toBe("full");
    expect(harness.injected).toHaveLength(0);
    expect(harness.logs.some((line) => line.includes("full pending"))).toBe(true);
  });
});
