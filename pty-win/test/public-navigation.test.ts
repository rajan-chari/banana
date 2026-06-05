// @vitest-environment happy-dom
//
// Tests for the navigation selector module (Phase 9a-B).
//
// The selector decouples readers from the backing fields. Until Phase 9b-E
// drops the `isDashboard` field, the selector prefers an explicit boolean
// over deriving from activeWorkspaceId — proving the safe-to-introduce-now
// promise that Phase 9a-B made.

import { describe, it, expect } from "vitest";
import { isDashboardMode } from "../public/lib/navigation.js";

describe("isDashboardMode", () => {
  it("returns true when isDashboard is explicitly true", () => {
    expect(isDashboardMode({ isDashboard: true })).toBe(true);
    expect(isDashboardMode({ isDashboard: true, activeWorkspaceId: "ws-7" })).toBe(true);
  });

  it("returns false when isDashboard is explicitly false", () => {
    expect(isDashboardMode({ isDashboard: false })).toBe(false);
    expect(isDashboardMode({ isDashboard: false, activeWorkspaceId: null })).toBe(false);
  });

  it("falls back to activeWorkspaceId === null when isDashboard is missing", () => {
    // dashboard mode = no active workspace
    expect(isDashboardMode({ activeWorkspaceId: null })).toBe(true);
    expect(isDashboardMode({})).toBe(true);
    expect(isDashboardMode({ activeWorkspaceId: undefined })).toBe(true);
    // workspace mode = has an active workspace
    expect(isDashboardMode({ activeWorkspaceId: "ws-1" })).toBe(false);
  });

  it("preserves the existing semantic on the joint state shape used by app.js", () => {
    // After switchToWorkspace: isDashboard=false, activeWorkspaceId set
    expect(isDashboardMode({ isDashboard: false, activeWorkspaceId: "ws-1" })).toBe(false);
    // After switchToDashboard: isDashboard=true, activeWorkspaceId=null
    expect(isDashboardMode({ isDashboard: true, activeWorkspaceId: null })).toBe(true);
  });

  it("treats non-boolean isDashboard as missing and derives from activeWorkspaceId", () => {
    // Defensive: if someone (or a stale persisted blob) sets the field to a non-boolean
    // truthy/falsy value, we don't want to silently honor it as the truth. The selector
    // requires `typeof isDashboard === "boolean"` before trusting it.
    expect(isDashboardMode({ isDashboard: "true", activeWorkspaceId: "ws-1" } as any)).toBe(false);
    expect(isDashboardMode({ isDashboard: 0, activeWorkspaceId: null } as any)).toBe(true);
    expect(isDashboardMode({ isDashboard: null, activeWorkspaceId: "ws-2" } as any)).toBe(false);
  });
});
