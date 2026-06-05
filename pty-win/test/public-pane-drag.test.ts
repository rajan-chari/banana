// Pane drag-to-reorder runtime.
//
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPaneDrag } from "../public/lib/pane-drag.js";

beforeEach(() => {
  document.body.innerHTML = "";
  document.body.className = "";
});

interface State {
  workspaces: Array<{ id: string; layout: any }>;
  activeWorkspaceId: string | null;
}

function makeWorkspacesPort(s: State) {
  return {
    active: () => s.activeWorkspaceId
      ? (s.workspaces.find((w) => w.id === s.activeWorkspaceId) || null)
      : null,
  };
}

function mkDeps(overrides: Partial<{
  state: State;
  getLeafList: ReturnType<typeof vi.fn>;
  removeSessionFromLayout: ReturnType<typeof vi.fn>;
  treeContains: ReturnType<typeof vi.fn>;
  insertAdjacentToPane: ReturnType<typeof vi.fn>;
  saveWorkspaces: ReturnType<typeof vi.fn>;
  setWorkspaceLayout: ReturnType<typeof vi.fn>;
  renderActiveWorkspace: ReturnType<typeof vi.fn>;
}> = {}): any {
  const state = overrides.state || {
    workspaces: [{ id: "ws1", layout: { type: "leaf", session: "a" } }],
    activeWorkspaceId: "ws1",
  };
  return {
    state,
    workspaces: makeWorkspacesPort(state),
    getLeafList: overrides.getLeafList || vi.fn().mockReturnValue([{ session: "a" }, { session: "b" }]),
    removeSessionFromLayout: overrides.removeSessionFromLayout || vi.fn().mockReturnValue({ type: "leaf", session: "b" }),
    treeContains: overrides.treeContains || vi.fn().mockReturnValue(true),
    insertAdjacentToPane: overrides.insertAdjacentToPane || vi.fn().mockReturnValue({ type: "split", direction: "h" }),
    saveWorkspaces: overrides.saveWorkspaces || vi.fn(),
    setWorkspaceLayout: overrides.setWorkspaceLayout || vi.fn((ws: any, tree: any) => { ws.layout = tree; }),
    renderActiveWorkspace: overrides.renderActiveWorkspace || vi.fn(),
  };
}

function makePaneEl(session: string, rect: { left: number; top: number; width: number; height: number }) {
  const el = document.createElement("div");
  el.className = "pane";
  el.dataset["session"] = session;
  el.getBoundingClientRect = () => ({
    left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}),
  });
  document.body.appendChild(el);
  return el;
}

function mkMouse(type: string, x: number, y: number, button = 0): MouseEvent {
  const ev = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true });
  return ev;
}

describe("createPaneDrag - startPaneDrag", () => {
  it("no-ops when workspace has fewer than 2 panes", () => {
    const deps = mkDeps({ getLeafList: vi.fn().mockReturnValue([{ session: "a" }]) });
    const drag = createPaneDrag(deps);
    const e = mkMouse("mousedown", 50, 50);
    const prev = e.defaultPrevented;
    drag.startPaneDrag(e, "a");
    expect(e.defaultPrevented).toBe(prev);
    expect(document.body.classList.contains("pane-dragging")).toBe(false);
    expect(drag._state.active).toBe(false);
  });

  it("activates drag, creates ghost, and shows drop zones for other panes", () => {
    makePaneEl("a", { left: 0, top: 0, width: 100, height: 100 });
    makePaneEl("b", { left: 200, top: 0, width: 100, height: 100 });
    const drag = createPaneDrag(mkDeps());
    drag.startPaneDrag(mkMouse("mousedown", 10, 10), "a");
    expect(drag._state.active).toBe(true);
    expect(drag._state.session).toBe("a");
    expect(document.body.classList.contains("pane-dragging")).toBe(true);
    expect(document.querySelector(".pane-drag-ghost")).toBeTruthy();
    const zones = document.querySelectorAll(".pane-drop-zone");
    expect(zones.length).toBe(4); // top/bottom/left/right for the OTHER pane only
    zones.forEach((z) => {
      expect(z instanceof HTMLElement && z.dataset["session"]).toBe("b");
    });
  });

  it("excludes the dragged pane from drop zones", () => {
    makePaneEl("a", { left: 0, top: 0, width: 100, height: 100 });
    makePaneEl("b", { left: 200, top: 0, width: 100, height: 100 });
    makePaneEl("c", { left: 400, top: 0, width: 100, height: 100 });
    const drag = createPaneDrag(mkDeps());
    drag.startPaneDrag(mkMouse("mousedown", 10, 10), "a");
    const sessions = Array.from(document.querySelectorAll(".pane-drop-zone")).map(
      (z) => z instanceof HTMLElement ? z.dataset["session"] : null,
    );
    expect(sessions).not.toContain("a");
    expect(sessions).toContain("b");
    expect(sessions).toContain("c");
  });

  it("calls preventDefault on the mousedown event", () => {
    makePaneEl("a", { left: 0, top: 0, width: 100, height: 100 });
    makePaneEl("b", { left: 200, top: 0, width: 100, height: 100 });
    const drag = createPaneDrag(mkDeps());
    const ev = mkMouse("mousedown", 10, 10);
    const spy = vi.spyOn(ev, "preventDefault");
    drag.startPaneDrag(ev, "a");
    expect(spy).toHaveBeenCalled();
  });
});

describe("createPaneDrag - mousemove highlight", () => {
  it("highlights a drop zone whose rect contains the cursor", () => {
    makePaneEl("a", { left: 0, top: 0, width: 100, height: 100 });
    makePaneEl("b", { left: 200, top: 0, width: 100, height: 100 });
    const drag = createPaneDrag(mkDeps());
    drag.startPaneDrag(mkMouse("mousedown", 10, 10), "a");
    // Stub bounding rects for the drop zones to deterministic boxes
    const zones = Array.from(document.querySelectorAll(".pane-drop-zone")) as HTMLElement[];
    const target = zones[0];
    target.getBoundingClientRect = () => ({
      left: 250, top: 25, right: 280, bottom: 75, width: 30, height: 50, x: 250, y: 25, toJSON: () => ({}),
    });
    zones.slice(1).forEach((z, i) => {
      z.getBoundingClientRect = () => ({
        left: 500 + i * 100, top: 0, right: 510, bottom: 10, width: 10, height: 10, x: 500, y: 0, toJSON: () => ({}),
      });
    });
    document.dispatchEvent(mkMouse("mousemove", 260, 50));
    expect(target.classList.contains("active")).toBe(true);
    expect(drag._state.currentTarget?.session).toBe("b");
  });

  it("clears currentTarget when cursor is outside all zones", () => {
    makePaneEl("a", { left: 0, top: 0, width: 100, height: 100 });
    makePaneEl("b", { left: 200, top: 0, width: 100, height: 100 });
    const drag = createPaneDrag(mkDeps());
    drag.startPaneDrag(mkMouse("mousedown", 10, 10), "a");
    const zones = Array.from(document.querySelectorAll(".pane-drop-zone")) as HTMLElement[];
    zones.forEach((z) => {
      z.getBoundingClientRect = () => ({
        left: 500, top: 0, right: 510, bottom: 10, width: 10, height: 10, x: 500, y: 0, toJSON: () => ({}),
      });
    });
    document.dispatchEvent(mkMouse("mousemove", 0, 0));
    expect(drag._state.currentTarget).toBe(null);
    zones.forEach((z) => expect(z.classList.contains("active")).toBe(false));
  });
});

describe("createPaneDrag - mouseup commit", () => {
  it("commits drop by calling layout helpers and renderActiveWorkspace", () => {
    makePaneEl("a", { left: 0, top: 0, width: 100, height: 100 });
    makePaneEl("b", { left: 200, top: 0, width: 100, height: 100 });
    const deps = mkDeps();
    const drag = createPaneDrag(deps);
    drag.startPaneDrag(mkMouse("mousedown", 10, 10), "a");
    // Force a target zone over "b"
    const zone = document.querySelectorAll(".pane-drop-zone")[0] as HTMLElement;
    zone.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, x: 0, y: 0, toJSON: () => ({}),
    });
    document.dispatchEvent(mkMouse("mousemove", 500, 500));
    document.dispatchEvent(mkMouse("mouseup", 500, 500));
    expect(deps.removeSessionFromLayout).toHaveBeenCalledWith(
      { type: "leaf", session: "a" },
      "a",
    );
    expect(deps.insertAdjacentToPane).toHaveBeenCalled();
    expect(deps.setWorkspaceLayout).toHaveBeenCalled();
    expect(deps.renderActiveWorkspace).toHaveBeenCalled();
    expect(drag._state.active).toBe(false);
    expect(document.body.classList.contains("pane-dragging")).toBe(false);
    expect(document.querySelector(".pane-drag-ghost")).toBeFalsy();
    expect(document.querySelector(".pane-drop-zone")).toBeFalsy();
  });

  it("aborts the drop when target is the same as drag source", () => {
    makePaneEl("a", { left: 0, top: 0, width: 100, height: 100 });
    makePaneEl("b", { left: 200, top: 0, width: 100, height: 100 });
    const deps = mkDeps();
    const drag = createPaneDrag(deps);
    drag.startPaneDrag(mkMouse("mousedown", 10, 10), "a");
    // No mousemove → currentTarget stays null
    document.dispatchEvent(mkMouse("mouseup", 500, 500));
    expect(deps.removeSessionFromLayout).not.toHaveBeenCalled();
    expect(deps.insertAdjacentToPane).not.toHaveBeenCalled();
    expect(deps.saveWorkspaces).not.toHaveBeenCalled();
  });

  it("aborts the drop when the pruned tree no longer contains the target", () => {
    makePaneEl("a", { left: 0, top: 0, width: 100, height: 100 });
    makePaneEl("b", { left: 200, top: 0, width: 100, height: 100 });
    const deps = mkDeps({ treeContains: vi.fn().mockReturnValue(false) });
    const drag = createPaneDrag(deps);
    drag.startPaneDrag(mkMouse("mousedown", 10, 10), "a");
    const zone = document.querySelectorAll(".pane-drop-zone")[0] as HTMLElement;
    zone.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, x: 0, y: 0, toJSON: () => ({}),
    });
    document.dispatchEvent(mkMouse("mousemove", 500, 500));
    document.dispatchEvent(mkMouse("mouseup", 500, 500));
    expect(deps.insertAdjacentToPane).not.toHaveBeenCalled();
    expect(deps.saveWorkspaces).not.toHaveBeenCalled();
    expect(deps.renderActiveWorkspace).not.toHaveBeenCalled();
  });
});

describe("createPaneDrag - Escape cancels", () => {
  it("removes ghost, drop zones, body class, and does not commit", () => {
    makePaneEl("a", { left: 0, top: 0, width: 100, height: 100 });
    makePaneEl("b", { left: 200, top: 0, width: 100, height: 100 });
    const deps = mkDeps();
    const drag = createPaneDrag(deps);
    drag.startPaneDrag(mkMouse("mousedown", 10, 10), "a");
    const zone = document.querySelectorAll(".pane-drop-zone")[0] as HTMLElement;
    zone.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, x: 0, y: 0, toJSON: () => ({}),
    });
    document.dispatchEvent(mkMouse("mousemove", 500, 500));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.body.classList.contains("pane-dragging")).toBe(false);
    expect(document.querySelector(".pane-drag-ghost")).toBeFalsy();
    expect(document.querySelector(".pane-drop-zone")).toBeFalsy();
    expect(drag._state.active).toBe(false);
    expect(deps.saveWorkspaces).not.toHaveBeenCalled();
  });

  it("ignores non-Escape keys", () => {
    makePaneEl("a", { left: 0, top: 0, width: 100, height: 100 });
    makePaneEl("b", { left: 200, top: 0, width: 100, height: 100 });
    const drag = createPaneDrag(mkDeps());
    drag.startPaneDrag(mkMouse("mousedown", 10, 10), "a");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(drag._state.active).toBe(true);
    expect(document.body.classList.contains("pane-dragging")).toBe(true);
  });
});

describe("createPaneDrag - dispose mid-drag", () => {
  it("removes active document listeners so subsequent mousemoves do nothing", () => {
    makePaneEl("a", { left: 0, top: 0, width: 100, height: 100 });
    makePaneEl("b", { left: 200, top: 0, width: 100, height: 100 });
    const drag = createPaneDrag(mkDeps());
    drag.startPaneDrag(mkMouse("mousedown", 10, 10), "a");
    drag.dispose();
    // After dispose, subsequent events must not touch state or DOM
    document.dispatchEvent(mkMouse("mousemove", 500, 500));
    document.dispatchEvent(mkMouse("mouseup", 500, 500));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(drag._state.active).toBe(false);
    expect(drag._state.ghostEl).toBe(null);
    expect(document.querySelector(".pane-drag-ghost")).toBeFalsy();
    expect(document.querySelector(".pane-drop-zone")).toBeFalsy();
    expect(document.body.classList.contains("pane-dragging")).toBe(false);
  });

  it("is safe to call when no drag is active", () => {
    const drag = createPaneDrag(mkDeps());
    expect(() => drag.dispose()).not.toThrow();
    expect(drag._state.active).toBe(false);
  });
});
