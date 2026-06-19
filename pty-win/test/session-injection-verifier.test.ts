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
    const writeSubmit = vi.fn();
    const log = vi.fn();

    verifyInjectionAfter({
      source: "startup-kick",
      snapshot,
      sessionName: "claude-session",
      submitKey: "\r",
      getLastHookPromptSubmitTime: () => 0,
      writeSubmit,
      log,
      retryOnMissingPromptSubmit: true,
    });

    vi.advanceTimersByTime(5_000);

    expect(writeSubmit).toHaveBeenCalledWith("\r", "recover:startup-kick");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("re-sending SUBMIT (retry 1/2)"));
  });

  it("does not re-send submit when prompt-submit hooks are unreliable for the command", () => {
    vi.useFakeTimers();
    const writeSubmit = vi.fn();
    const log = vi.fn();
    const onGiveUp = vi.fn();
    const onUnverified = vi.fn();

    verifyInjectionAfter({
      source: "startup-kick",
      snapshot,
      sessionName: "agency-cp-session",
      submitKey: "\r",
      getLastHookPromptSubmitTime: () => 0,
      writeSubmit,
      log,
      onGiveUp,
      onUnverified,
      retryOnMissingPromptSubmit: false,
    });

    vi.advanceTimersByTime(5_000);

    expect(writeSubmit).not.toHaveBeenCalled();
    expect(onGiveUp).not.toHaveBeenCalled();
    expect(onUnverified).toHaveBeenCalledWith(snapshot, "startup-kick");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("not re-sending SUBMIT"));
  });

  it("does not re-send visible text for unreliable hooks unless recovery is enabled", () => {
    vi.useFakeTimers();
    const writeSubmit = vi.fn();
    const log = vi.fn();
    const onUnverified = vi.fn();

    verifyInjectionAfter({
      source: "emcom-auto",
      snapshot,
      sessionName: "agency-cp-session",
      submitKey: "\r",
      getLastHookPromptSubmitTime: () => 0,
      writeSubmit,
      getCurrentScreen: () => `prompt area still contains ${snapshot.injectText}`,
      log,
      onUnverified,
      retryOnMissingPromptSubmit: false,
    });

    vi.advanceTimersByTime(5_000);

    expect(writeSubmit).not.toHaveBeenCalled();
    expect(onUnverified).toHaveBeenCalledWith(snapshot, "emcom-auto");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("not re-sending SUBMIT"));
  });

  it("re-sends submit for unreliable hooks when visible-text recovery is enabled", () => {
    vi.useFakeTimers();
    const writeSubmit = vi.fn();
    const log = vi.fn();
    const onUnverified = vi.fn();

    verifyInjectionAfter({
      source: "startup-kick",
      snapshot,
      sessionName: "agency-cp-session",
      submitKey: "\r",
      getLastHookPromptSubmitTime: () => 0,
      writeSubmit,
      getCurrentScreen: () => `prompt area still contains ${snapshot.injectText}`,
      log,
      onUnverified,
      retryOnMissingPromptSubmit: false,
      retryVisibleTextOnMissingPromptSubmit: true,
    });

    vi.advanceTimersByTime(5_000);

    expect(writeSubmit).toHaveBeenCalledWith("\r", "recover:startup-kick");
    expect(onUnverified).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("injected text is still visible"));
  });
});
