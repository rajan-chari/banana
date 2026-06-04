// Pure-resolver tests for key-shortcuts.js (tracker cx-09).

import { describe, it, expect } from "vitest";
import { resolveCtrlShiftKeyAction } from "../public/lib/key-shortcuts.js";

describe("resolveCtrlShiftKeyAction", () => {
  it("maps Space to clear-input-dirty", () => {
    expect(resolveCtrlShiftKeyAction(" ")).toEqual({ type: "clearInputDirty" });
  });

  it("maps D and d to switch-to-dashboard", () => {
    expect(resolveCtrlShiftKeyAction("D")).toEqual({ type: "switchToDashboard" });
    expect(resolveCtrlShiftKeyAction("d")).toEqual({ type: "switchToDashboard" });
  });

  it("maps W and w to close-focused-pane", () => {
    expect(resolveCtrlShiftKeyAction("W")).toEqual({ type: "closeFocusedPane" });
    expect(resolveCtrlShiftKeyAction("w")).toEqual({ type: "closeFocusedPane" });
  });

  it("maps B and b to toggle-sidebar", () => {
    expect(resolveCtrlShiftKeyAction("B")).toEqual({ type: "toggleSidebar" });
    expect(resolveCtrlShiftKeyAction("b")).toEqual({ type: "toggleSidebar" });
  });

  it("swallows H and V (browser shortcut conflicts) as noop", () => {
    for (const k of ["H", "h", "V", "v"]) {
      expect(resolveCtrlShiftKeyAction(k)).toEqual({ type: "noop" });
    }
  });

  it("maps 1-9 to switchWorkspace with zero-based index", () => {
    for (let i = 1; i <= 9; i++) {
      expect(resolveCtrlShiftKeyAction(String(i))).toEqual({ type: "switchWorkspace", index: i - 1 });
    }
  });

  it("does not match 0 as switchWorkspace", () => {
    expect(resolveCtrlShiftKeyAction("0")).toEqual({ type: "passthrough" });
  });

  it("does not interpret multi-char digit-like keys as workspace switches", () => {
    // Defensive: a key like "10" (synthetic) must not parseInt to 9 and fire
    expect(resolveCtrlShiftKeyAction("10")).toEqual({ type: "passthrough" });
  });

  it("maps each arrow key to resize with the matching direction", () => {
    for (const d of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const) {
      expect(resolveCtrlShiftKeyAction(d)).toEqual({ type: "resize", direction: d });
    }
  });

  it("returns passthrough for unmapped keys", () => {
    for (const k of ["A", "Tab", "Escape", "F1", "Enter"]) {
      expect(resolveCtrlShiftKeyAction(k)).toEqual({ type: "passthrough" });
    }
  });
});
