// Pure-helper tests for session-heuristic.ts (tracker cx-07).
// The class itself (timer + side effects) is exercised by the
// public-app-smoke test; this file pins the once-per-minute log
// throttle and the log-line format which are easy to regress.

import { describe, it, expect } from "vitest";
import { shouldLogStartupProgress, formatStartupKickLog } from "../src/session-heuristic.js";

describe("shouldLogStartupProgress", () => {
  it("returns false at quietMs=0", () => {
    expect(shouldLogStartupProgress(0)).toBe(false);
  });

  it("returns false for the first minute of waiting", () => {
    expect(shouldLogStartupProgress(1_000)).toBe(false);
    expect(shouldLogStartupProgress(30_000)).toBe(false);
    expect(shouldLogStartupProgress(59_999)).toBe(false);
  });

  it("returns true the first time quietMs crosses 60_000 within the prior 1s tick", () => {
    // crossing happens when floor(q/60k) increments compared to floor((q-1000)/60k)
    expect(shouldLogStartupProgress(60_000)).toBe(true);
    expect(shouldLogStartupProgress(60_500)).toBe(true);
    expect(shouldLogStartupProgress(60_999)).toBe(true);
  });

  it("returns false again for the next 59 seconds", () => {
    expect(shouldLogStartupProgress(61_000)).toBe(false);
    expect(shouldLogStartupProgress(119_999)).toBe(false);
  });

  it("returns true again at the 2-minute boundary", () => {
    expect(shouldLogStartupProgress(120_000)).toBe(true);
    expect(shouldLogStartupProgress(120_500)).toBe(true);
  });

  it("guards against negative quietMs (clock skew)", () => {
    expect(shouldLogStartupProgress(-1)).toBe(false);
    expect(shouldLogStartupProgress(-60_000)).toBe(false);
  });
});

describe("formatStartupKickLog", () => {
  it("includes session name, glyph flag, quietMs, and buffer length", () => {
    const msg = formatStartupKickLog("milo", 123_456, true, 4096);
    expect(msg).toBe("[milo] waiting for startup kick: glyph=true, quiet=123456ms, bufLen=4096");
  });

  it("reports glyph=false when promptVisible is false", () => {
    const msg = formatStartupKickLog("repo-x", 60_000, false, 0);
    expect(msg).toBe("[repo-x] waiting for startup kick: glyph=false, quiet=60000ms, bufLen=0");
  });
});
