// @vitest-environment happy-dom
//
// Tests for the navigation selector module.
//
// Dashboard mode = no active workspace. After Phase 9b-E the selector
// is a single line: `!state.activeWorkspaceId`. These tests pin that
// derivation so any future change to the dashboard concept has to
// touch this file (and you'll notice).

import { describe, it, expect } from "vitest";
import { isDashboardMode } from "../public/lib/navigation.js";

describe("isDashboardMode", () => {
  it("returns true when activeWorkspaceId is null", () => {
    expect(isDashboardMode({ activeWorkspaceId: null })).toBe(true);
  });

  it("returns true when activeWorkspaceId is missing", () => {
    expect(isDashboardMode({})).toBe(true);
    expect(isDashboardMode({ activeWorkspaceId: undefined })).toBe(true);
  });

  it("returns false when activeWorkspaceId references a workspace", () => {
    expect(isDashboardMode({ activeWorkspaceId: "ws-1" })).toBe(false);
    expect(isDashboardMode({ activeWorkspaceId: "ws-7" })).toBe(false);
  });

  it("treats empty-string activeWorkspaceId as dashboard mode (truthiness)", () => {
    // Empty string isn't a real ws id; the store would never produce it, but
    // the selector intentionally collapses all falsy values into dashboard mode
    // so callers don't have to handle each case.
    expect(isDashboardMode({ activeWorkspaceId: "" })).toBe(true);
  });
});
