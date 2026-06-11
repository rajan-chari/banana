// Pane runtime — characterization tests cover createPane DOM,
// terminal IO wiring (onData/onResize/key handlers), focus, status
// updates, switchPaneType, key shortcut dispatch, and the per-session
// paste guard. This test was written as part of the Phase 4c
// extraction; if you refactor pane-runtime, these tests should
// continue to pass — they define the contract.
//
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPaneRuntime } from "../public/lib/pane-runtime.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

/** Build a fake xterm constructor pair that records all wiring calls. */
function mkXterm() {
  const onDataCbs: Array<(d: string) => void> = [];
  const onResizeCbs: Array<(d: any) => void> = [];
  let keyHandler: ((e: KeyboardEvent) => boolean) | null = null;
  const focusSpy = vi.fn();
  const disposeSpy = vi.fn();
  const fitSpy = vi.fn();
  const openSpy = vi.fn();
  const Terminal = vi.fn(function (this: any, _opts: any) {
    this.cols = 80;
    this.rows = 24;
    this.loadAddon = vi.fn();
    this.onData = (cb: any) => { onDataCbs.push(cb); };
    this.onResize = (cb: any) => { onResizeCbs.push(cb); };
    this.attachCustomKeyEventHandler = (h: any) => { keyHandler = h; };
    this.focus = focusSpy;
    this.dispose = disposeSpy;
    this.open = openSpy;
    return this;
  });
  const FitAddon = vi.fn(function (this: any) { this.fit = fitSpy; return this; });
  const WebLinksAddon = vi.fn(function (this: any) { return this; });
  return {
    xterm: { Terminal, FitAddon, WebLinksAddon, theme: { background: "#000" } },
    spies: { onDataCbs, onResizeCbs, getKeyHandler: () => keyHandler, focusSpy, disposeSpy, fitSpy, openSpy },
  };
}

function mkState(over: any = {}) {
  return {
    sessions: new Map([["a", { status: "idle", workingDir: "/tmp/a", group: "a" }]]),
    activePaneTypes: new Map(),
    terminals: new Map(),
    workspaces: [],
    activeWorkspaceId: null,
    focusedPane: null,
    ws: { send: vi.fn() },
    ...over,
  };
}

function mkActions(over: any = {}): any {
  return {
    openQuickOpen: vi.fn(),
    switchToDashboard: vi.fn(),
    switchToWorkspace: vi.fn(),
    toggleSidebar: vi.fn(),
    closeFocusedPane: vi.fn(),
    navigatePanes: vi.fn(),
    resizeFocused: vi.fn(),
    killSession: vi.fn(),
    showPaneContextMenu: vi.fn(),
    startPaneDrag: vi.fn(),
    getAiPresetForCommand: vi.fn().mockReturnValue(null),
    renderActiveWorkspace: vi.fn(),
    ...over,
  };
}

function mkEnv(over: any = {}): any {
  return {
    requestAnimationFrame: (cb: () => void) => { cb(); return 1; },
    setTimeout: (cb: () => void, _ms: number) => { cb(); return 1 as any; },
    ResizeObserver: class { observe = vi.fn(); disconnect = vi.fn(); constructor(_cb: any) {} },
    fetch: vi.fn().mockResolvedValue({ ok: true }),
    navigator: { clipboard: { readText: () => Promise.resolve("pasted") } },
    localStorage: { setItem: vi.fn() },
    win: { dispatchEvent: vi.fn() },
    ...over,
  };
}

function mkRuntime(stateOver: any = {}, actionsOver: any = {}, envOver: any = {}) {
  const state = mkState(stateOver);
  const actions = mkActions(actionsOver);
  const env = mkEnv(envOver);
  const { xterm, spies } = mkXterm();
  const byId = (id: string) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`missing #${id}`);
    return el;
  };
  const helpers = {
    focus: {
      set: vi.fn((name: string | null) => {
        if (state.focusedPane === name) return false;
        state.focusedPane = name;
        return true;
      }),
    },
  };
  const sessions = { byName: (n: string) => (state.sessions as Map<string, any>).get(n) };
  const activePaneTypes = { set: vi.fn() };
  const rt = createPaneRuntime({ state, sessions, activePaneTypes, byId, xterm, actions, env, helpers });
  return { rt, state, actions, env, spies, helpers, activePaneTypes };
}

describe("createPaneRuntime - createPane", () => {
  it("builds a pane DOM with topbar, terminal area, and statusbar", () => {
    const { rt } = mkRuntime();
    const pane = rt.createPane("a");
    expect(pane.classList.contains("pane")).toBe(true);
    expect(pane.dataset["session"]).toBe("a");
    expect(pane.querySelector(".pane-topbar")).toBeTruthy();
    expect(pane.querySelector(".pane-terminal")).toBeTruthy();
    expect(pane.querySelector(".pane-statusbar")).toBeTruthy();
    expect(pane.querySelector(".pane-name")?.textContent).toBe("a");
  });

  it("renders the close, code, and diagnostics buttons in the topbar", () => {
    const { rt } = mkRuntime();
    const pane = rt.createPane("a");
    expect(pane.querySelector(".pane-close")).toBeTruthy();
    expect(pane.querySelector(".pane-action.code")).toBeTruthy();
    expect(pane.querySelector(".pane-action.state")).toBeTruthy();
    expect(pane.querySelector(".pane-action.state")?.textContent).toBe("ⓘ");
  });

  it("opens a diagnostics popover from the topbar diagnostics button", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: "idle", command: "agency cp", quietMs: 1234, stateEventHistory: [{ event: "status-change", detail: "busy -> idle" }] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ injections: [{ time: Date.now(), type: "emcom" }] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ticks: [{ action: "idle", reason: "hook:stop" }] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: "busy", command: "agency cp", pendingPermission: true, hookPermissionActive: true, screenPermissionActive: false, quietMs: 42 }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ injections: [] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ticks: [] }) });
    const setTimeoutFn = vi.fn((_cb: () => void, _ms: number) => 1 as any);
    const { rt } = mkRuntime({}, {}, { fetch: fetchFn, setTimeout: setTimeoutFn });
    const pane = rt.createPane("a");

    (pane.querySelector(".pane-action.state") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchFn).toHaveBeenCalledWith("/api/debug/sessions/a");
    expect(pane.querySelector(".pane-state-popover")?.textContent).toContain("Diagnostics");
    expect(pane.querySelector(".pane-state-popover")?.textContent).toContain("agency cp");
    expect(pane.querySelector(".pane-state-popover")?.textContent).toContain("status-change");
    expect(pane.querySelector(".pane-state-close")).toBeTruthy();
    expect(pane.querySelector(".pane-state-refresh")).toBeTruthy();

    (pane.querySelector(".pane-state-refresh") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchFn).toHaveBeenCalledTimes(6);
    expect(setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 1000);
    expect(pane.querySelector(".pane-state-popover")?.textContent).toContain("permission");
    expect(pane.querySelector(".pane-state-popover")?.textContent).toContain("busy");
    expect(pane.querySelector(".pane-state-popover")?.textContent).toContain("hook permission");
    expect(pane.querySelector(".pane-state-popover")?.textContent).toContain("screen permission");

    (pane.querySelector(".pane-state-close") as HTMLElement).click();
    expect(pane.querySelector(".pane-state-popover")).toBeFalsy();
  });

  it("includes the claude/pwsh toggle ONLY when both sub-sessions exist", () => {
    const { rt } = mkRuntime({
      sessions: new Map([
        ["a", { status: "idle", group: "a" }],
        ["a~pwsh", { status: "idle", group: "a" }],
      ]),
      activePaneTypes: new Map([["a", "claude"]]),
    });
    const pane = rt.createPane("a");
    expect(pane.querySelector(".pane-toggle")).toBeTruthy();
    expect(pane.querySelectorAll(".toggle-btn").length).toBe(2);
  });

  it("does NOT render the toggle when only one sub-session exists", () => {
    const { rt } = mkRuntime();
    const pane = rt.createPane("a");
    expect(pane.querySelector(".pane-toggle")).toBeFalsy();
  });

  it("marks the pane as focused when groupName matches state.focusedPane", () => {
    const { rt } = mkRuntime({ focusedPane: "a" });
    const pane = rt.createPane("a");
    expect(pane.classList.contains("focused")).toBe(true);
  });

  it("marks the pane as dead when info.status === 'dead'", () => {
    const { rt } = mkRuntime({
      sessions: new Map([["a", { status: "dead" }]]),
    });
    const pane = rt.createPane("a");
    expect(pane.classList.contains("dead")).toBe(true);
  });

  it("marks the pane as pending-permission on initial render", () => {
    const { rt } = mkRuntime({
      sessions: new Map([["a", { status: "busy", pendingPermission: true }]]),
    });
    const pane = rt.createPane("a");

    expect(pane.classList.contains("pending-permission")).toBe(true);
    expect(pane.querySelector(".pane-status-label")?.textContent).toBe("permission");
  });
});

describe("createPaneRuntime - ensureTerminal wiring", () => {
  it("forwards xterm onData to ws.send with a JSON input message", () => {
    const { rt, state, spies } = mkRuntime();
    rt.ensureTerminal("a");
    spies.onDataCbs[0]("hello");
    expect(state.ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "input", session: "a", payload: "hello",
    }));
  });

  it("suppresses onData when the per-session paste guard is set", () => {
    const { rt, state, spies } = mkRuntime();
    rt.ensureTerminal("a");
    rt._pasteGuards.add("a");
    spies.onDataCbs[0]("ghost");
    expect(state.ws.send).not.toHaveBeenCalled();
  });

  it("does NOT suppress onData for a different session that has the guard", () => {
    const { rt, state, spies } = mkRuntime();
    rt.ensureTerminal("a");
    rt._pasteGuards.add("b"); // different session
    spies.onDataCbs[0]("real");
    expect(state.ws.send).toHaveBeenCalledTimes(1);
  });

  it("forwards xterm onResize to ws.send with a JSON resize message", () => {
    const { rt, state, spies } = mkRuntime();
    rt.ensureTerminal("a");
    spies.onResizeCbs[0]({ cols: 120, rows: 40 });
    expect(state.ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "resize", session: "a", payload: { cols: 120, rows: 40 },
    }));
  });

  it("returns the cached terminal entry on subsequent calls", () => {
    const { rt } = mkRuntime();
    const e1 = rt.ensureTerminal("a");
    const e2 = rt.ensureTerminal("a");
    expect(e2).toBe(e1);
  });
});

describe("createPaneRuntime - key handlers", () => {
  it("Ctrl+Shift+ArrowLeft routes to actions.resizeFocused", () => {
    const { rt, actions } = mkRuntime();
    rt.ensureTerminal("a");
    const handled = rt._handleCtrlShiftKey({ key: "ArrowLeft" } as any, "a");
    expect(handled).toBe(false);
    expect(actions.resizeFocused).toHaveBeenCalledWith("ArrowLeft");
  });

  it("Ctrl+Shift+W routes to actions.closeFocusedPane", () => {
    const { rt, actions } = mkRuntime();
    const handled = rt._handleCtrlShiftKey({ key: "w" } as any, "a");
    expect(handled).toBe(false);
    expect(actions.closeFocusedPane).toHaveBeenCalled();
  });

  it("Ctrl+P routes to actions.openQuickOpen", () => {
    const { rt, actions } = mkRuntime();
    const handled = rt._handleCtrlOnlyKey({ key: "p" } as any, "a");
    expect(handled).toBe(false);
    expect(actions.openQuickOpen).toHaveBeenCalled();
  });

  it("Ctrl+Arrow routes to actions.navigatePanes", () => {
    const { rt, actions } = mkRuntime();
    const handled = rt._handleCtrlOnlyKey({ key: "ArrowRight" } as any, "a");
    expect(handled).toBe(false);
    expect(actions.navigatePanes).toHaveBeenCalledWith("ArrowRight");
  });

  it("Ctrl+V sets the paste guard, reads clipboard, sends via ws", async () => {
    const { rt, state, env } = mkRuntime();
    rt._handleCtrlOnlyKey({ key: "v" } as any, "a");
    expect(rt._pasteGuards.has("a")).toBe(true);
    // Drain the microtask queue (then → catch → finally → setTimeout shim → guard delete)
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(state.ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: "input", session: "a", payload: "pasted",
    }));
    expect(rt._pasteGuards.has("a")).toBe(false);
    expect(env.navigator.clipboard).toBeTruthy();
  });
});

describe("createPaneRuntime - focus/status/switch", () => {
  it("focusPane sets state.focusedPane and toggles 'focused' class on panes", () => {
    document.body.innerHTML = `
      <div class="pane" data-session="a"></div>
      <div class="pane" data-session="b"></div>
    `;
    const { rt, state } = mkRuntime();
    rt.focusPane("b");
    expect(state.focusedPane).toBe("b");
    const a = document.querySelector('.pane[data-session="a"]');
    const b = document.querySelector('.pane[data-session="b"]');
    expect(a?.classList.contains("focused")).toBe(false);
    expect(b?.classList.contains("focused")).toBe(true);
  });

  it("focusPane calls term.focus on the active sub-session terminal", () => {
    const { rt, spies } = mkRuntime();
    rt.ensureTerminal("a");
    rt.focusPane("a");
    // Once direct + once via raf shim (which calls cb immediately)
    expect(spies.focusSpy).toHaveBeenCalledTimes(2);
  });

  it("updatePaneStatus updates dot, label, unread, and dead class on the pane", () => {
    document.body.innerHTML = `
      <div class="pane" data-session="a">
        <div class="status-dot starting"></div>
        <div class="pane-status-label">starting</div>
        <div class="pane-unread">0</div>
      </div>
    `;
    const { rt } = mkRuntime({
      sessions: new Map([["a", { status: "busy", unreadCount: 3, group: "a" }]]),
    });
    rt.updatePaneStatus("a");
    expect(document.querySelector(".status-dot")?.className).toBe("status-dot busy");
    expect(document.querySelector(".pane-status-label")?.textContent).toBe("busy");
    expect(document.querySelector(".pane-unread")?.textContent).toBe("3");
  });

  it("updatePaneStatus shows 'permission' label when pendingPermission is set", () => {
    document.body.innerHTML = `
      <div class="pane" data-session="a">
        <div class="status-dot"></div>
        <div class="pane-status-label"></div>
        <div class="pane-unread"></div>
      </div>
    `;
    const { rt } = mkRuntime({
      sessions: new Map([["a", { status: "busy", pendingPermission: true, group: "a" }]]),
    });
    rt.updatePaneStatus("a");
    expect(document.querySelector(".status-dot")?.className).toBe("status-dot permission");
    expect(document.querySelector(".pane-status-label")?.textContent).toBe("permission");
  });

  it("switchPaneType mutates pg.activeType and re-renders + refocuses", () => {
    const { rt, state, actions, activePaneTypes } = mkRuntime({
      sessions: new Map([
        ["a", { status: "idle", group: "a" }],
        ["a~pwsh", { status: "idle", group: "a" }],
      ]),
      activePaneTypes: new Map([["a", "claude"]]),
    });
    rt.switchPaneType("a", "pwsh");
    expect(activePaneTypes.set).toHaveBeenCalledWith("a", "pwsh");
    expect(actions.renderActiveWorkspace).toHaveBeenCalled();
    expect(state.focusedPane).toBe("a");
  });
});

describe("createPaneRuntime - topbar wiring", () => {
  it("close button calls actions.killSession with the active session name", () => {
    const { rt, actions } = mkRuntime();
    const pane = rt.createPane("a");
    document.body.appendChild(pane);
    const close = pane.querySelector(".pane-close") as HTMLElement;
    close.click();
    expect(actions.killSession).toHaveBeenCalledWith("a");
  });

  it("code button calls fetch with /api/open-editor", () => {
    const { rt, env } = mkRuntime();
    const pane = rt.createPane("a");
    document.body.appendChild(pane);
    const code = pane.querySelector(".pane-action.code") as HTMLElement;
    code.click();
    expect(env.fetch).toHaveBeenCalledWith("/api/open-editor", expect.objectContaining({
      method: "POST",
    }));
  });

  it("right-click on topbar calls actions.showPaneContextMenu", () => {
    const { rt, actions } = mkRuntime();
    const pane = rt.createPane("a");
    document.body.appendChild(pane);
    const topbar = pane.querySelector(".pane-topbar") as HTMLElement;
    topbar.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    expect(actions.showPaneContextMenu).toHaveBeenCalled();
  });

  it("topbar mousedown (non-button) triggers actions.startPaneDrag", () => {
    const { rt, actions } = mkRuntime();
    const pane = rt.createPane("a");
    document.body.appendChild(pane);
    const topbar = pane.querySelector(".pane-topbar") as HTMLElement;
    topbar.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(actions.startPaneDrag).toHaveBeenCalled();
  });

  it("topbar mousedown on a button does NOT trigger startPaneDrag", () => {
    const { rt, actions } = mkRuntime();
    const pane = rt.createPane("a");
    document.body.appendChild(pane);
    const closeBtn = pane.querySelector(".pane-close") as HTMLElement;
    closeBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(actions.startPaneDrag).not.toHaveBeenCalled();
  });
});

describe("createPaneRuntime - normaliseStatusDot", () => {
  it("returns whitelisted statuses unchanged", () => {
    const { rt } = mkRuntime();
    for (const s of ["starting", "busy", "idle", "dead"]) {
      expect(rt._normaliseStatusDot(s)).toBe(s);
    }
  });

  it("falls back to 'starting' for unknown values", () => {
    const { rt } = mkRuntime();
    expect(rt._normaliseStatusDot("rando")).toBe("starting");
    expect(rt._normaliseStatusDot(undefined)).toBe("starting");
  });
});
