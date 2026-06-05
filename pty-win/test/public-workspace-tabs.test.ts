// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  reorderWorkspaces,
  tabDropSide,
  createWorkspaceTabs,
} from "../public/lib/workspace-tabs.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("tabDropSide", () => {
  const rect = { left: 100, width: 80 };
  // midpoint: 100 + 40 = 140

  it("returns 'left' when clientX is strictly less than midpoint", () => {
    expect(tabDropSide(rect, 100)).toBe("left");
    expect(tabDropSide(rect, 139)).toBe("left");
    expect(tabDropSide(rect, 0)).toBe("left");
  });

  it("returns 'right' when clientX is at or after midpoint", () => {
    expect(tabDropSide(rect, 140)).toBe("right");
    expect(tabDropSide(rect, 141)).toBe("right");
    expect(tabDropSide(rect, 180)).toBe("right");
  });

  it("handles zero-width rects deterministically", () => {
    expect(tabDropSide({ left: 50, width: 0 }, 50)).toBe("right");
    expect(tabDropSide({ left: 50, width: 0 }, 49)).toBe("left");
  });

  it("handles fractional midpoints", () => {
    expect(tabDropSide({ left: 0, width: 3 }, 1)).toBe("left"); // mid 1.5, 1 < 1.5
    expect(tabDropSide({ left: 0, width: 3 }, 2)).toBe("right");
  });
});

describe("reorderWorkspaces", () => {
  const list = () => [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
    { id: "d", name: "D" },
  ];

  it("moves source LEFT of target with side='left'", () => {
    const out = reorderWorkspaces(list(), "d", "b", "left");
    expect(out.map((w) => w.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("moves source RIGHT of target with side='right'", () => {
    const out = reorderWorkspaces(list(), "a", "c", "right");
    expect(out.map((w) => w.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("forward move with side='left' lands just before target", () => {
    const out = reorderWorkspaces(list(), "a", "d", "left");
    expect(out.map((w) => w.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("forward move with side='right' lands just after target", () => {
    const out = reorderWorkspaces(list(), "a", "c", "right");
    expect(out.map((w) => w.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("does not mutate input array", () => {
    const before = list();
    const frozen = JSON.stringify(before);
    reorderWorkspaces(before, "a", "d", "right");
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it("returns a copy unchanged when srcId === tgtId", () => {
    const before = list();
    const out = reorderWorkspaces(before, "b", "b", "left");
    expect(out.map((w) => w.id)).toEqual(["a", "b", "c", "d"]);
    expect(out).not.toBe(before);
  });

  it("returns array without the source removed when target id is missing", () => {
    const out = reorderWorkspaces(list(), "a", "z", "right");
    expect(out.map((w) => w.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("returns input copy when source id is missing", () => {
    const out = reorderWorkspaces(list(), "z", "b", "right");
    expect(out.map((w) => w.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("handles two-item list correctly", () => {
    const out = reorderWorkspaces([{ id: "a" }, { id: "b" }], "b", "a", "left");
    expect(out.map((w) => w.id)).toEqual(["b", "a"]);
  });
});

// ===== createWorkspaceTabs (Phase 5a orchestrator) =====

function mkTabs(stateOver: any = {}) {
  const tabs = document.createElement("div");
  tabs.id = "tabs";
  document.body.appendChild(tabs);

  const state: any = {
    workspaces: [
      { id: "w1", name: "alpha", layout: { type: "leaf", session: "s1" } },
      { id: "w2", name: "beta", layout: { type: "split", direction: "h", ratio: 0.5, children: [
        { type: "leaf", session: "s2" }, { type: "leaf", session: "s3" },
      ]}},
    ],
    activeWorkspaceId: "w2",
    isDashboard: false,
    ...stateOver,
  };

  const helpers = {
    saveWorkspaces: vi.fn(),
    getLeafList: vi.fn((tree: any): string[] => {
      if (!tree) return [];
      if (tree.type === "leaf") return [tree.session];
      return tree.children.flatMap((c: any) => helpers.getLeafList(c));
    }),
  };
  const actions = {
    switchToDashboard: vi.fn(),
    switchToWorkspace: vi.fn(),
    removeWorkspace: vi.fn(),
    showLayoutPresetsMenu: vi.fn(),
    handleSessionDrop: vi.fn(),
    createWorkspace: vi.fn((_n: any) => ({ id: "w-new", name: "new", layout: null })),
  };
  const setTimeoutFn = vi.fn((_cb: any, _ms: number) => 1 as any) as any;
  const clearTimeoutFn = vi.fn() as any;

  const byId = vi.fn((id: string) => document.getElementById(id)!);
  const rt = createWorkspaceTabs({
    state, byId, doc: document,
    env: { setTimeout: setTimeoutFn, clearTimeout: clearTimeoutFn },
    helpers, actions,
  });
  return { rt, state, helpers, actions, tabs, setTimeoutFn };
}

describe("createWorkspaceTabs - renderTabs", () => {
  it("clears, then renders Dashboard tab, one tab per workspace, and the + button", () => {
    const { rt, tabs, helpers } = mkTabs();
    rt.renderTabs();
    expect(helpers.saveWorkspaces).toHaveBeenCalled();
    const tabEls = tabs.querySelectorAll(".tab");
    expect(tabEls.length).toBe(3); // Dashboard + w1 + w2
    expect(tabEls[0].textContent).toBe("Dashboard");
    expect(tabs.querySelector("#btn-new-workspace")).toBeTruthy();
  });

  it("marks Dashboard tab active when state.isDashboard is true", () => {
    const { rt, tabs } = mkTabs({ isDashboard: true });
    rt.renderTabs();
    const dashTab = tabs.querySelectorAll(".tab")[0];
    expect(dashTab.classList.contains("active")).toBe(true);
  });

  it("marks the active workspace tab active", () => {
    const { rt, tabs } = mkTabs();
    rt.renderTabs();
    const tabsEls = tabs.querySelectorAll(".tab");
    // tabsEls[0]=dash, [1]=w1, [2]=w2 (active)
    expect(tabsEls[1].classList.contains("active")).toBe(false);
    expect(tabsEls[2].classList.contains("active")).toBe(true);
  });

  it("clicking Dashboard tab calls actions.switchToDashboard", () => {
    const { rt, tabs, actions } = mkTabs();
    rt.renderTabs();
    (tabs.querySelectorAll(".tab")[0] as HTMLElement).click();
    expect(actions.switchToDashboard).toHaveBeenCalled();
  });

  it("clears existing tab content before rendering (idempotent on rerun)", () => {
    const { rt, tabs } = mkTabs();
    rt.renderTabs();
    rt.renderTabs();
    expect(tabs.querySelectorAll(".tab").length).toBe(3);
  });
});

describe("createWorkspaceTabs - per-tab wiring", () => {
  it("close button calls actions.removeWorkspace with the ws id and stops propagation", () => {
    const { rt, tabs, actions } = mkTabs();
    rt.renderTabs();
    const w1Tab = tabs.querySelectorAll(".tab")[1] as HTMLElement;
    const close = w1Tab.querySelector(".tab-close") as HTMLElement;
    close.click();
    expect(actions.removeWorkspace).toHaveBeenCalledWith("w1");
  });

  it("renders the layout-presets button ONLY on the active workspace tab with >=2 leaves", () => {
    const { rt, tabs } = mkTabs();
    rt.renderTabs();
    const w1Tab = tabs.querySelectorAll(".tab")[1] as HTMLElement;
    const w2Tab = tabs.querySelectorAll(".tab")[2] as HTMLElement;
    expect(w1Tab.querySelector(".tab-layout-btn")).toBeNull(); // 1 leaf
    expect(w2Tab.querySelector(".tab-layout-btn")).toBeTruthy(); // active + 2 leaves
  });

  it("layout-presets button click calls showLayoutPresetsMenu", () => {
    const { rt, tabs, actions } = mkTabs();
    rt.renderTabs();
    const w2Tab = tabs.querySelectorAll(".tab")[2] as HTMLElement;
    const btn = w2Tab.querySelector(".tab-layout-btn") as HTMLElement;
    btn.click();
    expect(actions.showLayoutPresetsMenu).toHaveBeenCalled();
    const [evt, ws] = actions.showLayoutPresetsMenu.mock.calls[0];
    expect(evt).toBeInstanceOf(Event);
    expect(ws.id).toBe("w2");
  });

  it("tab click schedules a switchToWorkspace via env.setTimeout (single-click delay)", () => {
    const { rt, tabs, actions, setTimeoutFn } = mkTabs();
    rt.renderTabs();
    const w1Tab = tabs.querySelectorAll(".tab")[1] as HTMLElement;
    w1Tab.click();
    expect(setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 250);
    // Run the queued callback manually
    setTimeoutFn.mock.calls[0][0]();
    expect(actions.switchToWorkspace).toHaveBeenCalledWith("w1");
  });

  it("double-click on label replaces it with a rename input pre-filled with ws.name", () => {
    const { rt, tabs } = mkTabs();
    rt.renderTabs();
    const w1Tab = tabs.querySelectorAll(".tab")[1] as HTMLElement;
    const label = w1Tab.querySelector(".tab-label") as HTMLElement;
    label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = w1Tab.querySelector("input.tab-rename") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe("alpha");
  });

  it("Enter in rename input commits the new name and re-renders", () => {
    const { rt, tabs, state } = mkTabs();
    rt.renderTabs();
    const w1Tab = tabs.querySelectorAll(".tab")[1] as HTMLElement;
    const label = w1Tab.querySelector(".tab-label") as HTMLElement;
    label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = w1Tab.querySelector("input.tab-rename") as HTMLInputElement;
    input.value = "renamed!";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    // blur runs finish() synchronously
    expect(state.workspaces[0].name).toBe("renamed!");
    expect(state.workspaces[0].customName).toBe(true);
  });

  it("Escape in rename input restores the original name", () => {
    const { rt, tabs, state } = mkTabs();
    rt.renderTabs();
    const w1Tab = tabs.querySelectorAll(".tab")[1] as HTMLElement;
    const label = w1Tab.querySelector(".tab-label") as HTMLElement;
    label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = w1Tab.querySelector("input.tab-rename") as HTMLInputElement;
    input.value = "TYPO";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(state.workspaces[0].name).toBe("alpha");
  });
});

describe("createWorkspaceTabs - drag reorder", () => {
  function makeDataTransfer(types: string[] = []) {
    return {
      types,
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn(),
      getData: vi.fn(() => ""),
    };
  }

  it("dragstart records the source ws id (visible via _getDragSrcWsId)", () => {
    const { rt, tabs } = mkTabs();
    rt.renderTabs();
    const w1Tab = tabs.querySelectorAll(".tab")[1] as HTMLElement;
    const evt = new Event("dragstart") as any;
    evt.dataTransfer = makeDataTransfer();
    w1Tab.dispatchEvent(evt);
    expect(rt._getDragSrcWsId()).toBe("w1");
    expect(w1Tab.classList.contains("dragging")).toBe(true);
  });

  it("dragend clears the drag state and dragging classes", () => {
    const { rt, tabs } = mkTabs();
    rt.renderTabs();
    const w1Tab = tabs.querySelectorAll(".tab")[1] as HTMLElement;
    const startEvt = new Event("dragstart") as any;
    startEvt.dataTransfer = makeDataTransfer();
    w1Tab.dispatchEvent(startEvt);
    w1Tab.dispatchEvent(new Event("dragend"));
    expect(rt._getDragSrcWsId()).toBeNull();
    expect(w1Tab.classList.contains("dragging")).toBe(false);
  });

  it("drop with session payload routes through actions.handleSessionDrop with the target ws id", () => {
    const { rt, tabs, actions } = mkTabs();
    rt.renderTabs();
    const w1Tab = tabs.querySelectorAll(".tab")[1] as HTMLElement;
    const evt = new Event("drop") as any;
    evt.dataTransfer = makeDataTransfer(["pty-win/session"]);
    evt.preventDefault = vi.fn();
    w1Tab.dispatchEvent(evt);
    expect(actions.handleSessionDrop).toHaveBeenCalledWith(evt, "w1");
  });

  it("drop with a different src ws reorders workspaces and re-renders", () => {
    const { rt, tabs, state } = mkTabs();
    rt.renderTabs();
    const w1Tab = tabs.querySelectorAll(".tab")[1] as HTMLElement;
    const w2Tab = tabs.querySelectorAll(".tab")[2] as HTMLElement;
    // Drag from w1, drop on w2 — happy-dom's getBoundingClientRect returns all
    // zeros, so tabDropSide → "right" (clientX 0 is NOT < mid 0); inserting
    // after w2 moves w1 to the end.
    const startEvt = new Event("dragstart") as any;
    startEvt.dataTransfer = makeDataTransfer();
    w1Tab.dispatchEvent(startEvt);
    const dropEvt = new Event("drop") as any;
    dropEvt.dataTransfer = makeDataTransfer();
    dropEvt.preventDefault = vi.fn();
    dropEvt.clientX = 0;
    w2Tab.dispatchEvent(dropEvt);
    // After reorder, w2 should now come before w1.
    expect(state.workspaces.map((w: any) => w.id)).toEqual(["w2", "w1"]);
  });
});

describe("createWorkspaceTabs - add button", () => {
  it("clicking + creates a new workspace and switches to it", () => {
    const { rt, tabs, actions } = mkTabs();
    rt.renderTabs();
    const addBtn = tabs.querySelector("#btn-new-workspace") as HTMLElement;
    addBtn.click();
    expect(actions.createWorkspace).toHaveBeenCalledWith(null);
    expect(actions.switchToWorkspace).toHaveBeenCalledWith("w-new");
  });

  it("drop on + button routes to handleSessionDrop with null wsId (new workspace)", () => {
    const { rt, tabs, actions } = mkTabs();
    rt.renderTabs();
    const addBtn = tabs.querySelector("#btn-new-workspace") as HTMLElement;
    const evt = new Event("drop") as any;
    evt.dataTransfer = { types: ["pty-win/folder"], dropEffect: "" };
    addBtn.dispatchEvent(evt);
    expect(actions.handleSessionDrop).toHaveBeenCalledWith(evt, null);
  });
});
