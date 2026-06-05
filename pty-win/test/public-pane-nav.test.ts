// Pane nav — characterization tests for navigatePanes (Ctrl+Arrow)
// and resizeFocused (Ctrl+Shift+Arrow). Phase 4e extraction.
//
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPaneNav } from "../public/lib/pane-nav.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

function mkNav(stateOver: any = {}) {
  const state: any = {
    workspaces: [
      { id: "w1", layout: { type: "split", direction: "h", ratio: 0.5, children: [
        { type: "leaf", name: "a" }, { type: "leaf", name: "b" },
      ]}},
    ],
    activeWorkspaceId: "w1",
    focusedPane: "a",
    ...stateOver,
  };
  const workspaces = {
    active: () => state.activeWorkspaceId
      ? (state.workspaces.find((w: any) => w.id === state.activeWorkspaceId) || null)
      : null,
  };
  const focusPane = vi.fn();
  const renderActiveWorkspace = vi.fn();
  const layout = {
    getLeafList: vi.fn((tree: any): string[] => {
      if (!tree) return [];
      if (tree.type === "leaf") return [tree.name];
      return tree.children.flatMap((c: any) => layout.getLeafList(c));
    }),
    findParentSplit: vi.fn((tree: any, name: string): any => {
      if (!tree || tree.type !== "split") return null;
      if (tree.children.some((c: any) => c.type === "leaf" && c.name === name)) return tree;
      for (const c of tree.children) {
        const r = layout.findParentSplit(c, name);
        if (r) return r;
      }
      return null;
    }),
  };
  const nav = createPaneNav({ state, workspaces, layout, focusPane, renderActiveWorkspace });
  return { nav, state, focusPane, renderActiveWorkspace, layout };
}

describe("createPaneNav - navigatePanes", () => {
  it("ArrowRight moves focus to next leaf", () => {
    const { nav, focusPane } = mkNav();
    nav.navigatePanes("ArrowRight");
    expect(focusPane).toHaveBeenCalledWith("b");
  });

  it("ArrowDown also moves to next (same as Right)", () => {
    const { nav, focusPane } = mkNav();
    nav.navigatePanes("ArrowDown");
    expect(focusPane).toHaveBeenCalledWith("b");
  });

  it("ArrowLeft moves to previous (wraps from first to last)", () => {
    const { nav, focusPane } = mkNav();
    nav.navigatePanes("ArrowLeft");
    expect(focusPane).toHaveBeenCalledWith("b"); // wrap-around
  });

  it("ArrowUp also moves to previous", () => {
    const { nav, focusPane } = mkNav({ focusedPane: "b" });
    nav.navigatePanes("ArrowUp");
    expect(focusPane).toHaveBeenCalledWith("a");
  });

  it("wraps forward from last to first", () => {
    const { nav, focusPane } = mkNav({ focusedPane: "b" });
    nav.navigatePanes("ArrowRight");
    expect(focusPane).toHaveBeenCalledWith("a");
  });

  it("no-ops when active workspace not found", () => {
    const { nav, focusPane } = mkNav({ activeWorkspaceId: "nope" });
    nav.navigatePanes("ArrowRight");
    expect(focusPane).not.toHaveBeenCalled();
  });

  it("no-ops when workspace has no layout", () => {
    const { nav, focusPane } = mkNav({
      workspaces: [{ id: "w1", layout: null }],
    });
    nav.navigatePanes("ArrowRight");
    expect(focusPane).not.toHaveBeenCalled();
  });

  it("no-ops when no leaves", () => {
    const { nav, focusPane } = mkNav({
      workspaces: [{ id: "w1", layout: { type: "split", direction: "h", ratio: 0.5, children: [] }}],
    });
    nav.navigatePanes("ArrowRight");
    expect(focusPane).not.toHaveBeenCalled();
  });

  it("no-ops when no focused pane", () => {
    const { nav, focusPane } = mkNav({ focusedPane: null });
    nav.navigatePanes("ArrowRight");
    expect(focusPane).not.toHaveBeenCalled();
  });
});

describe("createPaneNav - resizeFocused", () => {
  it("ArrowRight grows the parent split ratio by 0.05", () => {
    const { nav, state, renderActiveWorkspace } = mkNav();
    nav.resizeFocused("ArrowRight");
    expect(state.workspaces[0].layout.ratio).toBeCloseTo(0.55, 5);
    expect(renderActiveWorkspace).toHaveBeenCalled();
  });

  it("ArrowDown also grows", () => {
    const { nav, state } = mkNav();
    nav.resizeFocused("ArrowDown");
    expect(state.workspaces[0].layout.ratio).toBeCloseTo(0.55, 5);
  });

  it("ArrowLeft shrinks the parent split ratio by 0.05", () => {
    const { nav, state } = mkNav();
    nav.resizeFocused("ArrowLeft");
    expect(state.workspaces[0].layout.ratio).toBeCloseTo(0.45, 5);
  });

  it("ArrowUp also shrinks", () => {
    const { nav, state } = mkNav();
    nav.resizeFocused("ArrowUp");
    expect(state.workspaces[0].layout.ratio).toBeCloseTo(0.45, 5);
  });

  it("clamps grow at 0.85", () => {
    const { nav, state } = mkNav({
      workspaces: [{ id: "w1", layout: { type: "split", direction: "h", ratio: 0.84, children: [
        { type: "leaf", name: "a" }, { type: "leaf", name: "b" },
      ]}}],
    });
    nav.resizeFocused("ArrowRight");
    expect(state.workspaces[0].layout.ratio).toBe(0.85);
  });

  it("clamps shrink at 0.15", () => {
    const { nav, state } = mkNav({
      workspaces: [{ id: "w1", layout: { type: "split", direction: "h", ratio: 0.16, children: [
        { type: "leaf", name: "a" }, { type: "leaf", name: "b" },
      ]}}],
    });
    nav.resizeFocused("ArrowLeft");
    expect(state.workspaces[0].layout.ratio).toBe(0.15);
  });

  it("no-ops when workspace layout is not a split (single pane)", () => {
    const { nav, renderActiveWorkspace } = mkNav({
      workspaces: [{ id: "w1", layout: { type: "leaf", name: "a" }}],
    });
    nav.resizeFocused("ArrowRight");
    expect(renderActiveWorkspace).not.toHaveBeenCalled();
  });

  it("no-ops when no focused pane", () => {
    const { nav, renderActiveWorkspace } = mkNav({ focusedPane: null });
    nav.resizeFocused("ArrowRight");
    expect(renderActiveWorkspace).not.toHaveBeenCalled();
  });

  it("no-ops when no parent split found for focused pane", () => {
    const { nav, renderActiveWorkspace } = mkNav({ focusedPane: "ghost" });
    nav.resizeFocused("ArrowRight");
    expect(renderActiveWorkspace).not.toHaveBeenCalled();
  });

  it("no-ops when active workspace not found", () => {
    const { nav, renderActiveWorkspace } = mkNav({ activeWorkspaceId: "nope" });
    nav.resizeFocused("ArrowRight");
    expect(renderActiveWorkspace).not.toHaveBeenCalled();
  });
});
