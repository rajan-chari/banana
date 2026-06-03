import { describe, it, expect } from "vitest";
import { SessionHookController, type HookSessionStatus } from "../src/session-hooks.js";

function makeController(initialStatus: HookSessionStatus = "busy") {
  let status = initialStatus;
  const statusChanges: HookSessionStatus[] = [];
  const idleReasons: string[] = [];
  const emittedStatusChanges: number[] = [];
  const logs: string[] = [];

  const controller = new SessionHookController({
    sessionName: "test-session",
    getStatus: () => status,
    setStatus: (nextStatus) => {
      status = nextStatus;
      statusChanges.push(nextStatus);
    },
    maybeFireOnIdle: (reason) => idleReasons.push(reason),
    emitStatusChange: () => emittedStatusChanges.push(Date.now()),
    log: (message) => logs.push(message),
  });

  return {
    controller,
    get status() { return status; },
    statusChanges,
    idleReasons,
    emittedStatusChanges,
    logs,
  };
}

describe("SessionHookController", () => {
  it("marks startup sessions for a startup kick and moves starting sessions to busy", () => {
    const harness = makeController("starting");

    harness.controller.hookSessionStart("startup");

    expect(harness.status).toBe("busy");
    expect(harness.controller.getNeedsStartupKick()).toBe(true);
    expect(harness.controller.consumeStartupKick()).toEqual({ needed: true, isResumed: false });
    expect(harness.controller.getNeedsStartupKick()).toBe(false);
  });

  it("marks resumed sessions distinctly", () => {
    const harness = makeController("starting");

    harness.controller.hookSessionStart("resume");

    expect(harness.controller.consumeStartupKick()).toEqual({ needed: true, isResumed: true });
  });

  it("does not request a kick for clear or compact session-start hooks", () => {
    for (const source of ["clear", "compact"]) {
      const harness = makeController("starting");

      harness.controller.hookSessionStart(source);

      expect(harness.controller.getNeedsStartupKick()).toBe(false);
      expect(harness.status).toBe("starting");
    }
  });

  it("uses startup grace timeout as the fallback kick path for Claude sessions", () => {
    const harness = makeController("starting");

    harness.controller.onStartupGraceTimeout(true, true);

    expect(harness.status).toBe("busy");
    expect(harness.controller.consumeStartupKick()).toEqual({ needed: true, isResumed: true });
  });

  it("hookStop marks idle, records the hook time, and fires idle handling", () => {
    const harness = makeController("busy");

    harness.controller.hookStop();

    expect(harness.status).toBe("idle");
    expect(harness.controller.getLastHookStopTime()).toBeGreaterThan(0);
    expect(harness.idleReasons).toEqual(["hook:stop"]);
  });

  it("hookPromptSubmit clears dirty input and cancels pending startup kick", () => {
    const harness = makeController("idle");
    harness.controller.onStartupGraceTimeout(true, false);
    harness.controller.markUserInput("hello");

    harness.controller.hookPromptSubmit();

    expect(harness.status).toBe("busy");
    expect(harness.controller.getInputBoxDirty()).toBe(false);
    expect(harness.controller.getNeedsStartupKick()).toBe(false);
    expect(harness.controller.getLastHookPromptSubmitTime()).toBeGreaterThan(0);
  });

  it("tracks dirty input only for printable user input", () => {
    const harness = makeController("idle");

    harness.controller.markUserInput("\x1b[A");
    expect(harness.controller.getInputBoxDirty()).toBe(false);

    harness.controller.markUserInput("a");
    expect(harness.controller.getInputBoxDirty()).toBe(true);

    harness.controller.clearInputDirty();
    expect(harness.controller.getInputBoxDirty()).toBe(false);
    expect(harness.idleReasons).toContain("user-cleared-input");
  });

  it("permission prompts surface pending permission until real user input or idle", () => {
    const harness = makeController("busy");

    harness.controller.hookNotify("permission_prompt");
    expect(harness.controller.getPendingPermission()).toBe(true);
    expect(harness.emittedStatusChanges).toHaveLength(1);

    harness.controller.markUserInput("\x1b[I");
    expect(harness.controller.getPendingPermission()).toBe(true);

    harness.controller.markUserInput("1");
    expect(harness.controller.getPendingPermission()).toBe(false);
    expect(harness.emittedStatusChanges).toHaveLength(2);
  });

  it("idle notifications clear permission, set idle if needed, and fire idle handling", () => {
    const harness = makeController("busy");
    harness.controller.hookNotify("permission_prompt");

    harness.controller.hookNotify("idle_prompt");

    expect(harness.status).toBe("idle");
    expect(harness.controller.getPendingPermission()).toBe(false);
    expect(harness.controller.getLastHookNotifyType()).toBe("idle_prompt");
    expect(harness.idleReasons).toContain("hook:notify(idle)");
  });

  it("ignores hook events once dead", () => {
    const harness = makeController("dead");

    harness.controller.hookStop();
    harness.controller.hookPromptSubmit();
    harness.controller.hookNotify("idle_prompt");

    expect(harness.statusChanges).toEqual([]);
    expect(harness.idleReasons).toEqual([]);
  });
});
