// Pure-helper tests for pane-context-menu.js (tracker cx-10).
//
// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import {
  resolveResumeMenuState,
  makeCtxItem,
  makeCtxSeparator,
  makeCtxHeader,
} from "../public/lib/pane-context-menu.js";

const AI_CMDS = ["claude", "agency cc", "agency cp", "copilot", "pi"];

describe("resolveResumeMenuState", () => {
  it("shows + enables resume for a dead AI session with a workingDir", () => {
    const r = resolveResumeMenuState(
      { status: "dead", command: "claude", workingDir: "C:/repo/x" },
      AI_CMDS,
    );
    expect(r).toEqual({ show: true, canResume: true, workingDir: "C:/repo/x" });
  });

  it("shows but DISABLES resume for a dead AI session missing workingDir", () => {
    const r = resolveResumeMenuState({ status: "dead", command: "claude" }, AI_CMDS);
    expect(r.show).toBe(true);
    expect(r.canResume).toBe(false);
    expect(r.workingDir).toBeNull();
  });

  it("shows but disables resume when no Claude session exists at all", () => {
    const r = resolveResumeMenuState(null, AI_CMDS);
    expect(r).toEqual({ show: true, canResume: false, workingDir: null });
    const r2 = resolveResumeMenuState(undefined, AI_CMDS);
    expect(r2).toEqual({ show: true, canResume: false, workingDir: null });
  });

  it("shows but disables resume for a dead non-AI session (e.g. pwsh)", () => {
    const r = resolveResumeMenuState(
      { status: "dead", command: "pwsh", workingDir: "C:/repo/x" },
      AI_CMDS,
    );
    // isNoAi catches this (status === dead), so show=true, but isDeadAi=false so canResume=false
    expect(r.show).toBe(true);
    expect(r.canResume).toBe(false);
    expect(r.workingDir).toBeNull();
  });

  it("hides resume for a live AI session", () => {
    const r = resolveResumeMenuState(
      { status: "idle", command: "claude", workingDir: "C:/repo/x" },
      AI_CMDS,
    );
    expect(r).toEqual({ show: false, canResume: false, workingDir: null });
  });

  it("hides resume for a busy AI session", () => {
    const r = resolveResumeMenuState(
      { status: "busy", command: "claude", workingDir: "C:/repo/x" },
      AI_CMDS,
    );
    expect(r.show).toBe(false);
  });

  it("accepts both Set and iterable for aiCommands", () => {
    const set = new Set(AI_CMDS);
    expect(resolveResumeMenuState({ status: "dead", command: "claude", workingDir: "x" }, set)).toEqual({
      show: true, canResume: true, workingDir: "x",
    });
  });

  it("handles dead session with no command (treats as non-AI dead)", () => {
    const r = resolveResumeMenuState({ status: "dead" }, AI_CMDS);
    expect(r.show).toBe(true);
    expect(r.canResume).toBe(false);
  });
});

describe("makeCtxItem", () => {
  it("creates a ctx-item div with the given label", () => {
    const item = makeCtxItem("Hello", null);
    expect(item.tagName).toBe("DIV");
    expect(item.className).toBe("ctx-item");
    expect(item.textContent).toBe("Hello");
    expect(item.onclick).toBeNull();
  });

  it("wires the onclick handler when provided", () => {
    const cb = vi.fn();
    const item = makeCtxItem("Click", cb);
    item.onclick?.(new MouseEvent("click") as unknown as PointerEvent);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("appends an extra class when provided", () => {
    const item = makeCtxItem("Disabled", null, "ctx-disabled");
    expect(item.className).toBe("ctx-item ctx-disabled");
  });

  it("omits extra class when empty string passed", () => {
    const item = makeCtxItem("X", null, "");
    expect(item.className).toBe("ctx-item");
  });
});

describe("makeCtxSeparator", () => {
  it("creates a ctx-sep div", () => {
    const sep = makeCtxSeparator();
    expect(sep.tagName).toBe("DIV");
    expect(sep.className).toBe("ctx-sep");
    expect(sep.textContent).toBe("");
  });
});

describe("makeCtxHeader", () => {
  it("creates a ctx-header div with the given label", () => {
    const header = makeCtxHeader("Move to");
    expect(header.tagName).toBe("DIV");
    expect(header.className).toBe("ctx-header");
    expect(header.textContent).toBe("Move to");
  });
});
