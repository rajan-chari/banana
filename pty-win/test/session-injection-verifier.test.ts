import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyInjectionAfter, type InjectionSnapshot } from "../src/session-injection-verifier.js";

const snapshot: InjectionSnapshot = {
  screen: "prompt",
  why: "test",
  injectText: "hello",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("verifyInjectionAfter", () => {
  it("re-sends submit when prompt-submit hook is missing for hook-backed commands", () => {
    vi.useFakeTimers();
    const relayWrite = vi.fn();
    const log = vi.fn();

    verifyInjectionAfter({
      source: "startup-kick",
      snapshot,
      sessionName: "claude-session",
      submitKey: "\r",
      getLastHookPromptSubmitTime: () => 0,
      relayWrite,
      log,
      retryOnMissingPromptSubmit: true,
    });

    vi.advanceTimersByTime(5_000);

    expect(relayWrite).toHaveBeenCalledWith("\r", "recover:startup-kick");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("re-sending SUBMIT (retry 1/2)"));
  });

  it("does not re-send submit when prompt-submit hooks are unreliable for the command", () => {
    vi.useFakeTimers();
    const relayWrite = vi.fn();
    const log = vi.fn();
    const onGiveUp = vi.fn();
    const onUnverified = vi.fn();

    verifyInjectionAfter({
      source: "startup-kick",
      snapshot,
      sessionName: "agency-cp-session",
      submitKey: "\r",
      getLastHookPromptSubmitTime: () => 0,
      relayWrite,
      log,
      onGiveUp,
      onUnverified,
      retryOnMissingPromptSubmit: false,
    });

    vi.advanceTimersByTime(5_000);

    expect(relayWrite).not.toHaveBeenCalled();
    expect(onGiveUp).not.toHaveBeenCalled();
    expect(onUnverified).toHaveBeenCalledWith(snapshot, "startup-kick");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("not re-sending SUBMIT"));
  });
});
