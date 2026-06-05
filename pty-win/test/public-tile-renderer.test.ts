// Tile renderer extracted from app.js.
//
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTileRenderer } from "../public/lib/tile-renderer.js";

beforeEach(() => {
  document.body.innerHTML = '<div id="workspace-area"></div>';
});

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

function fakePane(name: string): HTMLElement {
  const p = document.createElement("div");
  p.className = "pane";
  p.dataset["session"] = name;
  return p;
}

function mkDeps(overrides: any = {}): any {
  const state = overrides.state || {
    workspaces: [],
    activeWorkspaceId: null,
    sessions: new Map(), activePaneTypes: new Map(),
    terminals: new Map(),
  };
  return {
    state,
    workspaces: {
      active: () => state.activeWorkspaceId
        ? (state.workspaces.find((w: any) => w.id === state.activeWorkspaceId) || null)
        : null,
    },
    byId,
    createPane: overrides.createPane || ((name: string) => fakePane(name)),
    win: overrides.win || { requestAnimationFrame: (cb: () => void) => { cb(); return 1; } },
  };
}

describe("createTileRenderer - renderActiveWorkspace", () => {
  it("renders the empty-workspace placeholder when no active layout exists", () => {
    const t = createTileRenderer(mkDeps());
    t.renderActiveWorkspace();
    const placeholder = document.querySelector(".dashboard.active .dashboard-empty");
    expect(placeholder).toBeTruthy();
  });

  it("renders a single leaf as a single pane in the workspace container", () => {
    const ws = { id: "ws1", layout: { type: "leaf", session: "a" } };
    const t = createTileRenderer(mkDeps({
      state: { workspaces: [ws], activeWorkspaceId: "ws1", sessions: new Map(), activePaneTypes: new Map(), terminals: new Map() },
    }));
    t.renderActiveWorkspace();
    const container = document.querySelector(".workspace.active");
    expect(container).toBeTruthy();
    expect(container?.querySelectorAll(".pane").length).toBe(1);
    expect(container?.querySelector(".pane")?.getAttribute("data-session")).toBe("a");
  });

  it("renders a horizontal split with two leaf panes and a drag handle", () => {
    const layout = {
      type: "split", direction: "h", ratio: 0.6,
      children: [{ type: "leaf", session: "a" }, { type: "leaf", session: "b" }],
    };
    const ws = { id: "ws1", layout };
    const t = createTileRenderer(mkDeps({
      state: { workspaces: [ws], activeWorkspaceId: "ws1", sessions: new Map(), activePaneTypes: new Map(), terminals: new Map() },
    }));
    t.renderActiveWorkspace();
    const split = document.querySelector(".split-container");
    expect(split).toBeTruthy();
    expect(split instanceof HTMLElement && split.style.flexDirection).toBe("row");
    const children = split?.querySelectorAll(":scope > .split-child");
    expect(children?.length).toBe(2);
    const handle = split?.querySelector(":scope > .drag-handle");
    expect(handle).toBeTruthy();
    expect(handle?.classList.contains("vertical")).toBe(false);
    const panes = document.querySelectorAll(".pane");
    expect(panes.length).toBe(2);
    expect(panes[0].getAttribute("data-session")).toBe("a");
    expect(panes[1].getAttribute("data-session")).toBe("b");
  });

  it("uses column flex direction and 'vertical' handle class for vertical splits", () => {
    const layout = {
      type: "split", direction: "v", ratio: 0.5,
      children: [{ type: "leaf", session: "a" }, { type: "leaf", session: "b" }],
    };
    const ws = { id: "ws1", layout };
    const t = createTileRenderer(mkDeps({
      state: { workspaces: [ws], activeWorkspaceId: "ws1", sessions: new Map(), activePaneTypes: new Map(), terminals: new Map() },
    }));
    t.renderActiveWorkspace();
    const split = document.querySelector(".split-container");
    expect(split instanceof HTMLElement && split.style.flexDirection).toBe("column");
    expect(document.querySelector(".drag-handle")?.classList.contains("vertical")).toBe(true);
  });

  it("clears the workspace area between renders", () => {
    const t = createTileRenderer(mkDeps({
      state: {
        workspaces: [{ id: "ws1", layout: { type: "leaf", session: "a" } }],
        activeWorkspaceId: "ws1", sessions: new Map(), activePaneTypes: new Map(), terminals: new Map(),
      },
    }));
    t.renderActiveWorkspace();
    expect(document.querySelectorAll(".pane").length).toBe(1);
    t.renderActiveWorkspace();
    // Should still be exactly one pane — not two
    expect(document.querySelectorAll(".pane").length).toBe(1);
  });

  it("invokes createPane callback once per leaf", () => {
    const createPane = vi.fn().mockImplementation((name: string) => fakePane(name));
    const layout = {
      type: "split", direction: "h", ratio: 0.5,
      children: [
        { type: "leaf", session: "a" },
        { type: "split", direction: "v", ratio: 0.5, children: [
          { type: "leaf", session: "b" },
          { type: "leaf", session: "c" },
        ] },
      ],
    };
    const t = createTileRenderer(mkDeps({
      state: { workspaces: [{ id: "ws1", layout }], activeWorkspaceId: "ws1", sessions: new Map(), activePaneTypes: new Map(), terminals: new Map() },
      createPane,
    }));
    t.renderActiveWorkspace();
    expect(createPane).toHaveBeenCalledTimes(3);
    expect(createPane.mock.calls.map((c: any[]) => c[0])).toEqual(["a", "b", "c"]);
  });
});

describe("createTileRenderer - fitAllTerminals", () => {
  it("calls fitAddon.fit for each leaf in the tree", () => {
    const fitA = vi.fn();
    const fitB = vi.fn();
    const terminals = new Map([
      ["a", { fitAddon: { fit: fitA } }],
      ["b", { fitAddon: { fit: fitB } }],
    ]);
    const t = createTileRenderer(mkDeps({
      state: { workspaces: [], activeWorkspaceId: null, sessions: new Map(), activePaneTypes: new Map(), terminals },
    }));
    const layout = {
      type: "split", direction: "h", ratio: 0.5,
      children: [{ type: "leaf", session: "a" }, { type: "leaf", session: "b" }],
    };
    t.fitAllTerminals(layout);
    expect(fitA).toHaveBeenCalledTimes(1);
    expect(fitB).toHaveBeenCalledTimes(1);
  });

  it("resolves the active pane-group sub-session before lookup", () => {
    const fit = vi.fn();
    const terminals = new Map([
      ["a~pwsh", { fitAddon: { fit } }],
    ]);
    const sessions = new Map<string, any>([
      ["a", { status: "idle", group: "a" }],
      ["a~pwsh", { status: "idle", group: "a" }],
    ]);
    const activePaneTypes = new Map<string, "claude"|"pwsh">([["a", "pwsh"]]);
    const t = createTileRenderer(mkDeps({
      state: { workspaces: [], activeWorkspaceId: null, sessions, activePaneTypes, terminals },
    }));
    t.fitAllTerminals({ type: "leaf", session: "a" });
    expect(fit).toHaveBeenCalledTimes(1);
  });

  it("is a no-op on null input", () => {
    const t = createTileRenderer(mkDeps());
    expect(() => t.fitAllTerminals(null)).not.toThrow();
  });

  it("swallows errors thrown by fitAddon.fit (does not propagate)", () => {
    const fit = vi.fn(() => { throw new Error("xterm not ready"); });
    const terminals = new Map([["a", { fitAddon: { fit } }]]);
    const t = createTileRenderer(mkDeps({
      state: { workspaces: [], activeWorkspaceId: null, sessions: new Map(), activePaneTypes: new Map(), terminals },
    }));
    expect(() => t.fitAllTerminals({ type: "leaf", session: "a" })).not.toThrow();
  });
});

describe("createTileRenderer - drag handle resize", () => {
  it("attaches a mousedown listener that adjusts ratio on subsequent mousemove", () => {
    const layout = {
      type: "split", direction: "h", ratio: 0.5,
      children: [{ type: "leaf", session: "a" }, { type: "leaf", session: "b" }],
    };
    const ws = { id: "ws1", layout };
    const t = createTileRenderer(mkDeps({
      state: { workspaces: [ws], activeWorkspaceId: "ws1", sessions: new Map(), activePaneTypes: new Map(), terminals: new Map() },
    }));
    t.renderActiveWorkspace();
    const handle = document.querySelector(".drag-handle") as HTMLElement;
    const split = handle.parentElement as HTMLElement;
    // Stub container size and pretend handle is horizontal
    Object.defineProperty(split, "offsetWidth", { configurable: true, value: 1000 });
    handle.dispatchEvent(new MouseEvent("mousedown", { clientX: 500, clientY: 0, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 700, clientY: 0, bubbles: true }));
    expect(layout.ratio).toBeCloseTo(0.7, 5);
    expect(handle.classList.contains("dragging")).toBe(true);
    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 700, clientY: 0, bubbles: true }));
    expect(handle.classList.contains("dragging")).toBe(false);
  });

  it("clamps ratio to [0.15, 0.85]", () => {
    const layout = {
      type: "split", direction: "h", ratio: 0.5,
      children: [{ type: "leaf", session: "a" }, { type: "leaf", session: "b" }],
    };
    const ws = { id: "ws1", layout };
    const t = createTileRenderer(mkDeps({
      state: { workspaces: [ws], activeWorkspaceId: "ws1", sessions: new Map(), activePaneTypes: new Map(), terminals: new Map() },
    }));
    t.renderActiveWorkspace();
    const handle = document.querySelector(".drag-handle") as HTMLElement;
    const split = handle.parentElement as HTMLElement;
    Object.defineProperty(split, "offsetWidth", { configurable: true, value: 1000 });
    handle.dispatchEvent(new MouseEvent("mousedown", { clientX: 500, bubbles: true }));
    // Drag way past the right edge
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 5000, bubbles: true }));
    expect(layout.ratio).toBe(0.85);
    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 5000, bubbles: true }));
  });
});
