// Pure-helper tests for pane-context-menu.js (tracker cx-10).
//
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveResumeMenuState,
  makeCtxItem,
  makeCtxSeparator,
  makeCtxHeader,
  createPaneContextMenu,
} from "../public/lib/pane-context-menu.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

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

// ===== createPaneContextMenu (Phase 4f orchestrator) =====

function mkCtxRuntime(stateOver: any = {}) {
  const menu = document.createElement("div");
  menu.id = "pane-context-menu";
  menu.classList.add("hidden");
  document.body.appendChild(menu);

  const state: any = {
    paneGroups: new Map([
      ["g1", { activeType: "claude", claude: "g1", pwsh: "g1~pwsh" }],
      ["g2", { activeType: "claude", claude: "g2-dead" }],
    ]),
    sessions: new Map([
      ["g1", { status: "idle", command: "claude", workingDir: "/repo/a" }],
      ["g2-dead", { status: "dead", command: "claude", workingDir: "/repo/b" }],
    ]),
    workspaces: [
      { id: "w1", name: "ws-one", layout: { type: "leaf", name: "g1" } },
      { id: "w2", name: "ws-two", layout: { type: "leaf", name: "g2" } },
    ],
    aiPresets: [{ command: "claude" }],
    ...stateOver,
  };

  const findWorkspaceContaining = vi.fn((name: string) =>
    state.workspaces.find((w: any) => JSON.stringify(w.layout || "").includes(`"${name}"`)));
  const createWorkspace = vi.fn((name: string) => {
    const ws = { id: "w-new", name, layout: null };
    state.workspaces.push(ws);
    return ws;
  });
  const switchToWorkspace = vi.fn();
  const openFolder = vi.fn();
  const renderActiveWorkspace = vi.fn();
  const renderTabs = vi.fn();
  const updateWorkspaceTabName = vi.fn();
  const saveWorkspaces = vi.fn();

  const layout = {
    removeSessionFromLayout: vi.fn((_t: any, _n: string) => null),
    getLeafList: vi.fn((t: any): string[] => t?.type === "leaf" ? [t.name] : []),
    buildBalancedTree: vi.fn((leaves: string[]) =>
      leaves.length === 1 ? { type: "leaf", name: leaves[0] } : { type: "split", children: leaves.map((n) => ({ type: "leaf", name: n })) }),
  };

  const byId = vi.fn((id: string) => document.getElementById(id)!);

  const rt = createPaneContextMenu({
    state, byId, doc: document, layout,
    helpers: { updateWorkspaceTabName, saveWorkspaces },
    actions: {
      findWorkspaceContaining, createWorkspace, switchToWorkspace,
      openFolder, renderActiveWorkspace, renderTabs,
    },
  });

  return {
    rt, state, menu,
    spies: {
      findWorkspaceContaining, createWorkspace, switchToWorkspace,
      openFolder, renderActiveWorkspace, renderTabs,
      updateWorkspaceTabName, saveWorkspaces,
    },
  };
}

describe("createPaneContextMenu - showPaneContextMenu", () => {
  it("clears menu, positions at click coords, removes 'hidden' class", () => {
    const { rt, menu } = mkCtxRuntime();
    menu.innerHTML = "<div>stale</div>";
    const evt = new MouseEvent("contextmenu", { clientX: 42, clientY: 99 });
    rt.showPaneContextMenu(evt as any, "g1");
    expect(menu.classList.contains("hidden")).toBe(false);
    expect(menu.style.left).toBe("42px");
    expect(menu.style.top).toBe("99px");
    expect(menu.innerHTML).not.toContain("stale");
  });

  it("renders Move-to entries only for other workspaces", () => {
    const { rt, menu } = mkCtxRuntime();
    rt.showPaneContextMenu(new MouseEvent("contextmenu", { clientX: 0, clientY: 0 }) as any, "g1");
    // g1 is in w1, so Move-to should list w2 only.
    const items = Array.from(menu.querySelectorAll(".ctx-item"))
      .map((el) => el.textContent);
    expect(items).toContain("ws-two");
    expect(items).not.toContain("ws-one");
  });

  it("renders + New workspace item with a separator", () => {
    const { rt, menu } = mkCtxRuntime();
    rt.showPaneContextMenu(new MouseEvent("contextmenu", { clientX: 0, clientY: 0 }) as any, "g1");
    expect(menu.textContent).toContain("+ New workspace");
    expect(menu.querySelector(".ctx-sep")).toBeTruthy();
  });

  it("shows enabled Resume entry for a dead AI session with workingDir", () => {
    const { rt, menu } = mkCtxRuntime();
    rt.showPaneContextMenu(new MouseEvent("contextmenu", { clientX: 0, clientY: 0 }) as any, "g2");
    const resume = Array.from(menu.querySelectorAll(".ctx-item"))
      .find((el) => el.textContent?.includes("Resume Claude session"));
    expect(resume).toBeTruthy();
    expect(resume!.classList.contains("ctx-disabled")).toBe(false);
  });

  it("does NOT show Resume entry when claude session is live", () => {
    const { rt, menu } = mkCtxRuntime();
    rt.showPaneContextMenu(new MouseEvent("contextmenu", { clientX: 0, clientY: 0 }) as any, "g1");
    const labels = Array.from(menu.querySelectorAll(".ctx-item"))
      .map((el) => el.textContent || "");
    expect(labels.some((l) => l.includes("Resume"))).toBe(false);
  });

  it("clicking Resume calls openFolder with --resume args and hides the menu", () => {
    const { rt, menu, spies } = mkCtxRuntime();
    rt.showPaneContextMenu(new MouseEvent("contextmenu", { clientX: 0, clientY: 0 }) as any, "g2");
    const resume = Array.from(menu.querySelectorAll(".ctx-item"))
      .find((el) => el.textContent?.includes("Resume Claude session")) as HTMLElement;
    resume.click();
    expect(spies.openFolder).toHaveBeenCalledWith("/repo/b", "g2", "claude", false, ["--resume"]);
    expect(menu.classList.contains("hidden")).toBe(true);
  });

  it("clicking a Move-to entry triggers movePaneToWorkspace + render + save", () => {
    const { rt, menu, spies, state } = mkCtxRuntime();
    rt.showPaneContextMenu(new MouseEvent("contextmenu", { clientX: 0, clientY: 0 }) as any, "g1");
    const moveItem = Array.from(menu.querySelectorAll(".ctx-item"))
      .find((el) => el.textContent === "ws-two") as HTMLElement;
    moveItem.click();
    expect(spies.saveWorkspaces).toHaveBeenCalled();
    expect(spies.renderTabs).toHaveBeenCalled();
    expect(spies.renderActiveWorkspace).toHaveBeenCalled();
    // w2 already had g2; after moving g1 in, it becomes a 2-leaf split.
    expect(state.workspaces[1].layout.type).toBe("split");
    expect(JSON.stringify(state.workspaces[1].layout)).toContain("\"g1\"");
    expect(JSON.stringify(state.workspaces[1].layout)).toContain("\"g2\"");
    expect(menu.classList.contains("hidden")).toBe(true);
  });

  it("clicking + New workspace creates ws, moves pane, switches", () => {
    const { rt, menu, spies } = mkCtxRuntime();
    rt.showPaneContextMenu(new MouseEvent("contextmenu", { clientX: 0, clientY: 0 }) as any, "g1");
    const newItem = Array.from(menu.querySelectorAll(".ctx-item"))
      .find((el) => el.textContent === "+ New workspace") as HTMLElement;
    newItem.click();
    expect(spies.createWorkspace).toHaveBeenCalledWith("g1");
    expect(spies.switchToWorkspace).toHaveBeenCalledWith("w-new");
    expect(menu.classList.contains("hidden")).toBe(true);
  });

  it("clicking outside the menu hides it (after the next tick)", async () => {
    vi.useFakeTimers();
    const { rt, menu } = mkCtxRuntime();
    rt.showPaneContextMenu(new MouseEvent("contextmenu", { clientX: 0, clientY: 0 }) as any, "g1");
    expect(menu.classList.contains("hidden")).toBe(false);
    vi.runAllTimers(); // flush the setTimeout that installs the listener
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(menu.classList.contains("hidden")).toBe(true);
    vi.useRealTimers();
  });
});

describe("createPaneContextMenu - movePaneToWorkspace", () => {
  it("removes pane from fromWs and inserts into toWs leaf list", () => {
    const { rt, state, spies } = mkCtxRuntime();
    const fromWs = state.workspaces[0];
    const toWs = state.workspaces[1];
    rt.movePaneToWorkspace("g1", fromWs, toWs);
    expect(spies.updateWorkspaceTabName).toHaveBeenCalledWith(fromWs);
    expect(spies.updateWorkspaceTabName).toHaveBeenCalledWith(toWs);
    expect(toWs.layout).toBeTruthy();
    expect(spies.saveWorkspaces).toHaveBeenCalled();
  });

  it("works when fromWs is null (drop from no workspace)", () => {
    const { rt, state, spies } = mkCtxRuntime();
    const toWs = state.workspaces[1];
    rt.movePaneToWorkspace("orphan", null, toWs);
    expect(spies.updateWorkspaceTabName).toHaveBeenCalledWith(toWs);
    expect(spies.saveWorkspaces).toHaveBeenCalled();
  });
});
