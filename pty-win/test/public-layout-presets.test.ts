// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LAYOUT_PRESETS, createLayoutPresets } from "../public/lib/layout-presets.js";

function getLeafList(node: any): string[] {
  if (!node) return [];
  if (node.type === "leaf") return [node.session];
  return [...getLeafList(node.children[0]), ...getLeafList(node.children[1])];
}

function mkPresets(overrides: any = {}) {
  document.body.innerHTML = `<div id="pane-context-menu" class="hidden"></div>`;
  const helpers = {
    getLeafList,
    saveWorkspaces: vi.fn(),
    setWorkspaceLayout: vi.fn((ws: any, tree: any) => { ws.layout = tree; }),
    ...overrides.helpers,
  };
  const actions = {
    renderActiveWorkspace: vi.fn(),
    ...overrides.actions,
  };
  const setTimeoutFn = vi.fn((_cb: () => void, _ms: number) => 1 as any);
  const env = { setTimeout: setTimeoutFn };
  const lp = createLayoutPresets({
    byId: (id: string) => document.getElementById(id),
    doc: document,
    env: env as any,
    helpers,
    actions,
  });
  return { lp, helpers, actions, env, setTimeoutFn };
}

describe("LAYOUT_PRESETS table", () => {
  it("contains six presets in the expected order", () => {
    expect(LAYOUT_PRESETS.map((p) => p.name)).toEqual([
      "Auto (balanced)",
      "2 Columns",
      "3 Columns",
      "2 Top + 1 Bottom",
      "1 Top + 2 Bottom",
      "Large Left + Stack",
    ]);
  });

  it("declares minimum session counts", () => {
    expect(LAYOUT_PRESETS.map((p) => p.min)).toEqual([1, 2, 3, 3, 3, 3]);
  });

  it("Auto (balanced) builds a single leaf for one session", () => {
    const tree = LAYOUT_PRESETS[0].build(["a"]);
    expect(tree).toEqual({ type: "leaf", session: "a" });
  });

  it("2 Columns produces a horizontal split with two leaves", () => {
    const tree = LAYOUT_PRESETS[1].build(["a", "b"]);
    expect(tree.type).toBe("split");
    expect(tree.direction).toBe("h");
    expect(tree.ratio).toBe(0.5);
    expect(getLeafList(tree)).toEqual(["a", "b"]);
  });

  it("3 Columns nests two horizontal splits with three leaves", () => {
    const tree = LAYOUT_PRESETS[2].build(["a", "b", "c"]);
    expect(tree.direction).toBe("h");
    expect(getLeafList(tree)).toEqual(["a", "b", "c"]);
  });

  it("2 Top + 1 Bottom produces a vertical outer split", () => {
    const tree = LAYOUT_PRESETS[3].build(["a", "b", "c"]);
    expect(tree.direction).toBe("v");
    expect(getLeafList(tree)).toEqual(["a", "b", "c"]);
  });

  it("1 Top + 2 Bottom produces a vertical outer split with a horizontal child", () => {
    const tree = LAYOUT_PRESETS[4].build(["a", "b", "c"]);
    expect(tree.direction).toBe("v");
    expect(tree.children[0]).toEqual({ type: "leaf", session: "a" });
    expect(tree.children[1].direction).toBe("h");
    expect(getLeafList(tree)).toEqual(["a", "b", "c"]);
  });

  it("Large Left + Stack uses ratio 0.6 for the left pane", () => {
    const tree = LAYOUT_PRESETS[5].build(["a", "b", "c"]);
    expect(tree.direction).toBe("h");
    expect(tree.ratio).toBe(0.6);
    expect(tree.children[0]).toEqual({ type: "leaf", session: "a" });
  });
});

describe("createLayoutPresets - applyLayoutPreset", () => {
  it("rebuilds the workspace layout, saves, and re-renders", () => {
    const { lp, helpers, actions } = mkPresets();
    const ws: any = {
      layout: {
        type: "split", direction: "h", ratio: 0.5,
        children: [
          { type: "leaf", session: "a" },
          { type: "leaf", session: "b" },
        ],
      },
    };
    lp.applyLayoutPreset(ws, 1); // 2 Columns
    expect(ws.layout.direction).toBe("h");
    expect(ws.layout.ratio).toBe(0.5);
    expect(getLeafList(ws.layout)).toEqual(["a", "b"]);
    expect(helpers.setWorkspaceLayout).toHaveBeenCalledTimes(1);
    expect(actions.renderActiveWorkspace).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when index is out of range", () => {
    const { lp, helpers, actions } = mkPresets();
    const ws: any = { layout: { type: "leaf", session: "a" } };
    const before = ws.layout;
    lp.applyLayoutPreset(ws, 99);
    expect(ws.layout).toBe(before);
    expect(helpers.setWorkspaceLayout).not.toHaveBeenCalled();
    expect(actions.renderActiveWorkspace).not.toHaveBeenCalled();
  });

  it("is a no-op when session count is below the preset minimum", () => {
    const { lp, helpers } = mkPresets();
    const ws: any = { layout: { type: "leaf", session: "a" } };
    const before = ws.layout;
    lp.applyLayoutPreset(ws, 2); // 3 Columns needs 3 sessions
    expect(ws.layout).toBe(before);
    expect(helpers.saveWorkspaces).not.toHaveBeenCalled();
  });
});

describe("createLayoutPresets - showLayoutPresetsMenu", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  function makeMouseEvent(target: HTMLElement | null = null): any {
    const ev: any = new Event("click");
    ev.stopPropagation = vi.fn();
    if (target) Object.defineProperty(ev, "target", { value: target });
    return ev;
  }

  it("calls e.stopPropagation, shows the menu, and renders one item per preset", () => {
    const { lp } = mkPresets();
    const ws: any = {
      layout: {
        type: "split", direction: "h", ratio: 0.5,
        children: [
          { type: "leaf", session: "a" },
          { type: "split", direction: "h", ratio: 0.5, children: [
            { type: "leaf", session: "b" }, { type: "leaf", session: "c" },
          ]},
        ],
      },
    };
    const evt = makeMouseEvent();
    lp.showLayoutPresetsMenu(evt, ws);
    expect(evt.stopPropagation).toHaveBeenCalled();
    const menu = document.getElementById("pane-context-menu")!;
    expect(menu.classList.contains("hidden")).toBe(false);
    expect(menu.querySelectorAll(".ctx-item")).toHaveLength(LAYOUT_PRESETS.length);
  });

  it("disables presets whose minimum exceeds current session count", () => {
    const { lp } = mkPresets();
    const ws: any = { layout: { type: "leaf", session: "a" } };
    lp.showLayoutPresetsMenu(makeMouseEvent(), ws);
    const items = document.getElementById("pane-context-menu")!.querySelectorAll(".ctx-item");
    // Auto (min 1) enabled, all others disabled
    expect(items[0].classList.contains("ctx-disabled")).toBe(false);
    expect(items[1].classList.contains("ctx-disabled")).toBe(true);
    expect(items[5].classList.contains("ctx-disabled")).toBe(true);
  });

  it("renders ws with no layout as zero sessions (only Auto disabled since min=1)", () => {
    const { lp } = mkPresets();
    const ws: any = { layout: null };
    lp.showLayoutPresetsMenu(makeMouseEvent(), ws);
    const items = document.getElementById("pane-context-menu")!.querySelectorAll(".ctx-item");
    items.forEach((item) => expect(item.classList.contains("ctx-disabled")).toBe(true));
  });

  it("clicking an enabled item applies the preset and hides the menu", () => {
    const { lp, helpers, actions } = mkPresets();
    const ws: any = {
      layout: {
        type: "split", direction: "h", ratio: 0.5,
        children: [
          { type: "leaf", session: "a" }, { type: "leaf", session: "b" },
        ],
      },
    };
    lp.showLayoutPresetsMenu(makeMouseEvent(), ws);
    const menu = document.getElementById("pane-context-menu")!;
    const items = menu.querySelectorAll(".ctx-item") as NodeListOf<HTMLElement>;
    // 2 Columns is the second item (index 1)
    items[1].click();
    expect(helpers.setWorkspaceLayout).toHaveBeenCalledTimes(1);
    expect(actions.renderActiveWorkspace).toHaveBeenCalledTimes(1);
    expect(menu.classList.contains("hidden")).toBe(true);
  });

  it("clicking a disabled item is a no-op", () => {
    const { lp, helpers } = mkPresets();
    const ws: any = { layout: { type: "leaf", session: "a" } };
    lp.showLayoutPresetsMenu(makeMouseEvent(), ws);
    const items = document.getElementById("pane-context-menu")!.querySelectorAll(".ctx-item") as NodeListOf<HTMLElement>;
    // Disabled items have no onclick — confirm clicking them is silent
    items[1].click();
    expect(helpers.setWorkspaceLayout).not.toHaveBeenCalled();
  });

  it("positions the menu under the target element using its bounding rect", () => {
    const { lp } = mkPresets();
    const target = document.createElement("button");
    Object.defineProperty(target, "getBoundingClientRect", {
      value: () => ({ left: 123, bottom: 45, top: 25, right: 200, width: 77, height: 20, x: 123, y: 25, toJSON: () => ({}) }),
    });
    const ws: any = { layout: { type: "leaf", session: "a" } };
    lp.showLayoutPresetsMenu(makeMouseEvent(target), ws);
    const menu = document.getElementById("pane-context-menu")!;
    expect(menu.style.left).toBe("123px");
    expect(menu.style.top).toBe("47px");
  });

  it("schedules a click-outside listener via env.setTimeout(0)", () => {
    const { lp, setTimeoutFn } = mkPresets();
    const ws: any = { layout: { type: "leaf", session: "a" } };
    lp.showLayoutPresetsMenu(makeMouseEvent(), ws);
    expect(setTimeoutFn).toHaveBeenCalledTimes(1);
    expect(setTimeoutFn.mock.calls[0][1]).toBe(0);
  });

  it("click-outside callback hides the menu and removes the document listener", () => {
    const { lp, setTimeoutFn } = mkPresets();
    const ws: any = { layout: { type: "leaf", session: "a" } };
    lp.showLayoutPresetsMenu(makeMouseEvent(), ws);
    const menu = document.getElementById("pane-context-menu")!;
    // Run the scheduled setup to attach the mousedown listener
    (setTimeoutFn.mock.calls[0][0] as () => void)();
    // Click outside the menu
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    const md = new Event("mousedown");
    Object.defineProperty(md, "target", { value: outside });
    document.dispatchEvent(md);
    expect(menu.classList.contains("hidden")).toBe(true);
    // A second dispatch should not re-trigger (listener removed)
    menu.classList.remove("hidden");
    document.dispatchEvent(md);
    expect(menu.classList.contains("hidden")).toBe(false);
  });

  it("returns silently when #pane-context-menu is missing from the DOM", () => {
    document.body.innerHTML = "";
    const lp = createLayoutPresets({
      byId: (id: string) => document.getElementById(id),
      doc: document,
      env: { setTimeout: vi.fn() as any },
      helpers: { getLeafList, saveWorkspaces: vi.fn(), setWorkspaceLayout: vi.fn((ws: any, tree: any) => { ws.layout = tree; }) },
      actions: { renderActiveWorkspace: vi.fn() },
    });
    expect(() => lp.showLayoutPresetsMenu({ stopPropagation: vi.fn(), target: null } as any, { layout: null } as any)).not.toThrow();
  });
});
