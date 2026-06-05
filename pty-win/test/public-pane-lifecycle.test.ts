// Pane lifecycle — characterization tests cover killSession,
// closeFocusedPane, showDirtyWarning, autoRemoveDeadSession, plus
// the internal removeGroupFromAllWorkspaces / disposeTerminalEntry /
// refocusAfterPaneRemoval helpers. Phase 4d extraction; these tests
// define the contract going forward.
//
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPaneLifecycle } from "../public/lib/pane-lifecycle.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

function mkTerminalEntry() {
  return {
    term: { dispose: vi.fn() },
    resizeObserver: { disconnect: vi.fn() },
    wrapperEl: Object.assign(document.createElement("div"), { remove: vi.fn() }),
  };
}

function mkState(over: any = {}) {
  return {
    sessions: new Map<string, any>([
      ["a", { status: "idle" }],
      ["a~pwsh", { status: "idle" }],
      ["b", { status: "dead" }],
    ]),
    sessionMeta: new Map<string, any>([
      ["a", { workingDir: "/tmp/a" }],
      ["b", { workingDir: "/tmp/b" }],
    ]),
    paneGroups: new Map<string, any>([
      ["a", { activeType: "claude", claude: "a", pwsh: "a~pwsh" }],
      ["b", { activeType: "claude", claude: "b" }],
    ]),
    terminals: new Map<string, any>([
      ["a", mkTerminalEntry()],
      ["a~pwsh", mkTerminalEntry()],
      ["b", mkTerminalEntry()],
    ]),
    workspaces: [
      { id: "w1", layout: { type: "leaf", name: "a" } },
      { id: "w2", layout: { type: "split", direction: "h", ratio: 0.5, children: [
        { type: "leaf", name: "a" }, { type: "leaf", name: "b" },
      ]}},
    ],
    activeWorkspaceId: "w1",
    focusedPane: "a",
    isDashboard: false,
    ...over,
  };
}

function mkDeps(stateOver: any = {}) {
  const state = mkState(stateOver);
  const fetchFn = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
  // Non-synchronous shim: capture the callback but DO NOT invoke it. Tests
  // that need the callback can pull it from setTimeoutFn.mock.calls.
  const setTimeoutFn = vi.fn((_cb: any, _ms: number) => 1 as any) as any;

  const layout = {
    removeSessionFromLayout: vi.fn((tree: any, name: string) => {
      if (!tree) return null;
      if (tree.type === "leaf") return tree.name === name ? null : tree;
      const children = tree.children
        .map((c: any) => layout.removeSessionFromLayout(c, name))
        .filter(Boolean);
      if (children.length === 0) return null;
      if (children.length === 1) return children[0];
      return { ...tree, children };
    }),
    getLeafList: vi.fn((tree: any): string[] => {
      if (!tree) return [];
      if (tree.type === "leaf") return [tree.name];
      return tree.children.flatMap((c: any) => layout.getLeafList(c));
    }),
    buildBalancedTree: vi.fn((leaves: string[]) => {
      if (leaves.length === 0) return null;
      if (leaves.length === 1) return { type: "leaf", name: leaves[0] };
      return { type: "split", direction: "h", ratio: 0.5,
        children: leaves.map((n) => ({ type: "leaf", name: n })) };
    }),
    treeContains: vi.fn((tree: any, name: string): boolean => {
      if (!tree) return false;
      if (tree.type === "leaf") return tree.name === name;
      return tree.children.some((c: any) => layout.treeContains(c, name));
    }),
  };

  const helpers = {
    saveSessionMeta: vi.fn(),
    escapeHtml: vi.fn((s: string) => s.replace(/&/g, "&amp;")),
    rebuildPaneGroups: vi.fn(),
    refreshTreeRunningState: vi.fn(),
    updateWorkspaceTabName: vi.fn(),
  };
  const views = {
    renderActiveWorkspace: vi.fn(),
    renderTabs: vi.fn(),
    renderDashboard: vi.fn(),
  };

  const lc = createPaneLifecycle({
    state, doc: document, env: { fetch: fetchFn as any, setTimeout: setTimeoutFn },
    layout, helpers, views,
  });
  return { lc, state, fetchFn, setTimeoutFn, layout, helpers, views };
}

describe("createPaneLifecycle - closeFocusedPane", () => {
  it("removes the focused pane from the active workspace and re-focuses next leaf", () => {
    const { lc, state, views } = mkDeps({
      activeWorkspaceId: "w2", focusedPane: "a",
    });
    lc.closeFocusedPane();
    const ws = state.workspaces.find((w: any) => w.id === "w2")!;
    expect(ws.layout).toEqual({ type: "leaf", name: "b" });
    expect(state.focusedPane).toBe("b");
    expect(views.renderActiveWorkspace).toHaveBeenCalled();
  });

  it("no-ops when no focused pane", () => {
    const { lc, views } = mkDeps({ focusedPane: null });
    lc.closeFocusedPane();
    expect(views.renderActiveWorkspace).not.toHaveBeenCalled();
  });

  it("no-ops when active workspace not found", () => {
    const { lc, views } = mkDeps({ activeWorkspaceId: "nope" });
    lc.closeFocusedPane();
    expect(views.renderActiveWorkspace).not.toHaveBeenCalled();
  });

  it("clears focusedPane to null when workspace becomes empty", () => {
    const { lc, state } = mkDeps({ activeWorkspaceId: "w1", focusedPane: "a" });
    lc.closeFocusedPane();
    expect(state.focusedPane).toBeNull();
  });
});

describe("createPaneLifecycle - killSession", () => {
  it("DELETEs via fetch with encoded session name", async () => {
    const { lc, fetchFn } = mkDeps();
    await lc.killSession("a~pwsh");
    expect(fetchFn).toHaveBeenCalledWith("/api/sessions/a~pwsh", { method: "DELETE" });
  });

  it("when sibling alive, switches activeType (does NOT remove from layouts)", async () => {
    const { lc, state } = mkDeps();
    await lc.killSession("a"); // kill claude, pwsh sibling alive
    expect(state.paneGroups.get("a")!.activeType).toBe("pwsh");
    // layout should still contain 'a'
    const ws = state.workspaces.find((w: any) => w.id === "w2")!;
    expect(JSON.stringify(ws.layout)).toContain("\"a\"");
  });

  it("when no sibling, removes group from ALL workspaces", async () => {
    const { lc, state } = mkDeps();
    await lc.killSession("b");
    for (const ws of state.workspaces) {
      expect(JSON.stringify(ws.layout || "")).not.toContain("\"b\"");
    }
  });

  it("disposes terminal entry (dispose + observer disconnect + wrapper remove)", async () => {
    const { lc, state } = mkDeps();
    const entry = state.terminals.get("a~pwsh")!;
    await lc.killSession("a~pwsh");
    expect(entry.term.dispose).toHaveBeenCalled();
    expect(entry.resizeObserver!.disconnect).toHaveBeenCalled();
    expect(entry.wrapperEl!.remove).toHaveBeenCalled();
    expect(state.terminals.has("a~pwsh")).toBe(false);
  });

  it("deletes from sessions + sessionMeta and persists", async () => {
    const { lc, state, helpers } = mkDeps();
    await lc.killSession("a~pwsh");
    expect(state.sessions.has("a~pwsh")).toBe(false);
    expect(helpers.saveSessionMeta).toHaveBeenCalled();
  });

  it("clears focusedPane only when killing the focused group and no sibling alive", async () => {
    const { lc, state } = mkDeps({ focusedPane: "b" });
    await lc.killSession("b");
    expect(state.focusedPane).toBeNull();
  });

  it("does NOT clear focusedPane when sibling is alive", async () => {
    const { lc, state } = mkDeps({ focusedPane: "a" });
    await lc.killSession("a"); // pwsh still alive
    expect(state.focusedPane).toBe("a");
  });

  it("triggers rebuildPaneGroups, refreshTreeRunningState, render, renderTabs", async () => {
    const { lc, helpers, views } = mkDeps();
    await lc.killSession("a~pwsh");
    expect(helpers.rebuildPaneGroups).toHaveBeenCalled();
    expect(helpers.refreshTreeRunningState).toHaveBeenCalled();
    expect(views.renderActiveWorkspace).toHaveBeenCalled();
    expect(views.renderTabs).toHaveBeenCalled();
  });

  it("swallows fetch errors so cleanup still proceeds", async () => {
    const { lc, state, fetchFn } = mkDeps();
    fetchFn.mockRejectedValueOnce(new Error("network"));
    await lc.killSession("a~pwsh");
    expect(state.sessions.has("a~pwsh")).toBe(false);
  });
});

describe("createPaneLifecycle - showDirtyWarning", () => {
  it("appends a .dirty-toast div to body with the folder name", () => {
    const { lc, helpers } = mkDeps();
    lc.showDirtyWarning("a", "/tmp/myproject");
    const toast = document.querySelector(".dirty-toast")!;
    expect(toast).toBeTruthy();
    expect(toast.innerHTML).toContain("myproject");
    expect(helpers.escapeHtml).toHaveBeenCalledWith("myproject");
    expect(helpers.escapeHtml).toHaveBeenCalledWith("a");
  });

  it("uses raw path when no segment found", () => {
    const { lc } = mkDeps();
    lc.showDirtyWarning("x", "weird");
    const toast = document.querySelector(".dirty-toast")!;
    expect(toast.innerHTML).toContain("weird");
  });

  it("clicking the toast removes it", () => {
    const { lc } = mkDeps();
    lc.showDirtyWarning("a", "/tmp/p");
    const toast = document.querySelector(".dirty-toast")! as HTMLElement;
    toast.click();
    expect(document.querySelector(".dirty-toast")).toBeNull();
  });

  it("schedules a 30s auto-dismiss via env.setTimeout", () => {
    const { lc, setTimeoutFn } = mkDeps();
    lc.showDirtyWarning("a", "/tmp/p");
    expect(setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 30000);
  });
});

describe("createPaneLifecycle - autoRemoveDeadSession", () => {
  it("no-ops when session is missing or not dead", () => {
    const { lc, state, helpers } = mkDeps();
    lc.autoRemoveDeadSession("missing");
    lc.autoRemoveDeadSession("a"); // status: idle
    expect(helpers.rebuildPaneGroups).not.toHaveBeenCalled();
    expect(state.sessions.has("a")).toBe(true);
  });

  it("when dead and no sibling, removes group from all workspaces + disposes term + deletes state", () => {
    const { lc, state } = mkDeps();
    const entry = state.terminals.get("b")!;
    lc.autoRemoveDeadSession("b");
    expect(entry.term.dispose).toHaveBeenCalled();
    expect(state.sessions.has("b")).toBe(false);
    for (const ws of state.workspaces) {
      expect(JSON.stringify(ws.layout || "")).not.toContain("\"b\"");
    }
  });

  it("fires the DELETE fetch (fire-and-forget)", () => {
    const { lc, fetchFn } = mkDeps();
    lc.autoRemoveDeadSession("b");
    expect(fetchFn).toHaveBeenCalledWith("/api/sessions/b", { method: "DELETE" });
  });

  it("when dashboard active, calls renderDashboard instead of renderActiveWorkspace", () => {
    const { lc, views } = mkDeps({ isDashboard: true });
    lc.autoRemoveDeadSession("b");
    expect(views.renderDashboard).toHaveBeenCalled();
    expect(views.renderActiveWorkspace).not.toHaveBeenCalled();
  });

  it("when sibling alive, only switches activeType (does not remove leaf)", () => {
    const { lc, state } = mkDeps({
      sessions: new Map<string, any>([
        ["a", { status: "dead" }],
        ["a~pwsh", { status: "idle" }],
      ]),
      sessionMeta: new Map<string, any>([["a", { workingDir: "/tmp/a" }]]),
      paneGroups: new Map<string, any>([["a", { activeType: "claude", claude: "a", pwsh: "a~pwsh" }]]),
      terminals: new Map<string, any>([["a", mkTerminalEntry()]]),
      workspaces: [{ id: "w1", layout: { type: "leaf", name: "a" } }],
      activeWorkspaceId: "w1",
      focusedPane: "a",
    });
    lc.autoRemoveDeadSession("a");
    expect(state.paneGroups.get("a")!.activeType).toBe("pwsh");
    expect(state.workspaces[0].layout).toEqual({ type: "leaf", name: "a" });
  });
});

describe("createPaneLifecycle - internals", () => {
  it("_disposeTerminalEntry is a no-op when entry is missing", () => {
    const { lc } = mkDeps();
    expect(() => lc._disposeTerminalEntry("nope")).not.toThrow();
  });

  it("_removeGroupFromAllWorkspaces rebalances containing workspaces and updates tab name", () => {
    const { lc, state, helpers } = mkDeps();
    lc._removeGroupFromAllWorkspaces("b");
    const ws2 = state.workspaces.find((w: any) => w.id === "w2")!;
    expect(ws2.layout).toEqual({ type: "leaf", name: "a" });
    expect(helpers.updateWorkspaceTabName).toHaveBeenCalled();
  });

  it("_refocusAfterPaneRemoval picks a remaining leaf when removed pane was focused and no sibling", () => {
    const { lc, state } = mkDeps({
      focusedPane: "removed",
      workspaces: [{ id: "w1", layout: { type: "leaf", name: "a" } }],
      activeWorkspaceId: "w1",
    });
    lc._refocusAfterPaneRemoval("removed", false);
    expect(state.focusedPane).toBe("a");
  });

  it("_refocusAfterPaneRemoval is a no-op when sibling alive", () => {
    const { lc, state } = mkDeps({ focusedPane: "a" });
    lc._refocusAfterPaneRemoval("a", true);
    expect(state.focusedPane).toBe("a");
  });

  it("_refocusAfterPaneRemoval leaves focusedPane null when workspace is now empty", () => {
    const { lc, state } = mkDeps({
      focusedPane: "removed",
      workspaces: [{ id: "w1", layout: null }],
      activeWorkspaceId: "w1",
    });
    lc._refocusAfterPaneRemoval("removed", false);
    expect(state.focusedPane).toBeNull();
  });
});
