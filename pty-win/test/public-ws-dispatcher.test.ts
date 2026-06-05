// WS dispatcher and side-effecting handlers.
//
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWsDispatcher } from "../public/lib/ws-dispatcher.js";
import { createSessionsStore } from "../public/lib/sessions-store.js";

function mkPorts(state?: any) {
  return {
    panes: { reconcilePaneActiveTypes: vi.fn(), updatePaneStatus: vi.fn() },
    views: {
      renderSessionsPanel: vi.fn(),
      renderQuickAccess: vi.fn(),
      renderDashboard: vi.fn(),
      renderActiveWorkspace: vi.fn(),
      showDirtyWarning: vi.fn(),
    },
    tree: { refreshTreeRunningState: vi.fn() },
    layouts: {
      findOrphanedLeaves: vi.fn().mockReturnValue([]),
      classifyOrphanGroups: vi.fn().mockReturnValue({ recreatable: [], unrecoverable: [] }),
      rebalanceLayoutsWithoutLeaves: vi.fn().mockReturnValue([]),
      getLeafList: vi.fn().mockReturnValue([]),
      buildBalancedTree: vi.fn().mockReturnValue({ type: "leaf" }),
      updateWorkspaceTabName: vi.fn(),
      setWorkspaceLayout: vi.fn(),
      transactionFn: vi.fn((fn: () => void) => fn()),
    },
    sessions: {
      recreateOrphanedSessions: vi.fn(),
      autoRemoveDeadSession: vi.fn(),
      saveSessionMeta: vi.fn(),
    },
    sessionsStore: state
      ? createSessionsStore({ state })
      // Fallback for tests that destructure ports without state. Backed by
      // a fresh Map; tests that need shared state pass `mkPorts(state)`.
      : createSessionsStore({ state: { sessions: new Map() } }),
    appChrome: { applyInstanceName: vi.fn() },
  };
}

function mkState(overrides: any = {}): any {
  return {
    sessions: new Map(),
    sessionMeta: new Map(),
    workspaces: [],
    terminals: new Map(),
    activePaneTypes: new Map(),
    ws: { send: vi.fn() },
    // Default: in workspace mode (non-dashboard). Tests that need dashboard
    // mode override with `activeWorkspaceId: null`.
    activeWorkspaceId: "w1",
    focusedPane: null,
    ...overrides,
  };
}

function mkWin(): any {
  return {
    requestAnimationFrame: vi.fn((cb: any) => { cb(); return 1; }),
    setTimeout: vi.fn((cb: any, _ms: number) => { cb(); return 1 as any; }),
    document: { activeElement: document.body, body: document.body },
  };
}

describe("createWsDispatcher - dispatch routing", () => {
  it("routes data messages to the terminal write path", () => {
    const writeMock = vi.fn();
    const state = mkState({
      terminals: new Map([["s1", { term: { write: writeMock }, fitAddon: { fit: vi.fn() } }]]),
    });
    const d = createWsDispatcher({ state, ...mkPorts(state), win: mkWin() });
    d.dispatch({ type: "data", session: "s1", payload: "hello" });
    expect(writeMock).toHaveBeenCalledWith("hello");
  });

  it("ignores data messages for unknown sessions", () => {
    const state = mkState();
    const d = createWsDispatcher({ state, ...mkPorts(state), win: mkWin() });
    expect(() => d.dispatch({ type: "data", session: "ghost", payload: "x" })).not.toThrow();
  });

  it("ignores status messages for unknown sessions", () => {
    const state = mkState();
    const ports = mkPorts(state);
    const d = createWsDispatcher({ state, ...ports, win: mkWin() });
    d.dispatch({ type: "status", session: "ghost", payload: { status: "idle" } });
    expect(ports.panes.reconcilePaneActiveTypes).not.toHaveBeenCalled();
  });

  it("ignores notification messages for unknown sessions", () => {
    const state = mkState();
    const ports = mkPorts(state);
    const d = createWsDispatcher({ state, ...ports, win: mkWin() });
    d.dispatch({ type: "notification", session: "ghost" });
    expect(ports.panes.updatePaneStatus).not.toHaveBeenCalled();
  });

  it("ignores unknown message types", () => {
    const state = mkState();
    const ports = mkPorts(state);
    const d = createWsDispatcher({ state, ...ports, win: mkWin() });
    expect(() => d.dispatch({ type: "mystery" })).not.toThrow();
    expect(ports.panes.reconcilePaneActiveTypes).not.toHaveBeenCalled();
  });
});

describe("createWsDispatcher - handleWsSessions", () => {
  it("clears sessions and reseeds from payload", () => {
    const state = mkState({ sessions: new Map([["old", { name: "old" }]]) });
    const d = createWsDispatcher({ state, ...mkPorts(state), win: mkWin() });
    d.dispatch({ type: "sessions", payload: [
      { name: "a", workingDir: "/p1" },
      { name: "b", workingDir: "/p2" },
    ]});
    expect([...state.sessions.keys()]).toEqual(["a", "b"]);
    expect(state.sessions.has("old")).toBe(false);
  });

  it("records sessionMeta and calls saveSessionMeta", () => {
    const state = mkState();
    const ports = mkPorts(state);
    const d = createWsDispatcher({ state, ...ports, win: mkWin() });
    d.dispatch({ type: "sessions", payload: [
      { name: "a", workingDir: "/p1", command: "claude" },
    ]});
    expect(state.sessionMeta.get("a")).toEqual({ workingDir: "/p1", command: "claude" });
    expect(ports.sessions.saveSessionMeta).toHaveBeenCalledTimes(1);
  });

  it("calls renderActiveWorkspace + rAF refit when session-name set changes", () => {
    const state = mkState({ sessions: new Map([["old", { name: "old" }]]) });
    const ports = mkPorts(state);
    const win = mkWin();
    const d = createWsDispatcher({ state, ...ports, win });
    d.dispatch({ type: "sessions", payload: [{ name: "new" }] });
    expect(ports.views.renderActiveWorkspace).toHaveBeenCalledTimes(1);
    expect(win.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it("updates pane status per session when set unchanged", () => {
    const state = mkState({ sessions: new Map([["a", { name: "a" }]]) });
    const ports = mkPorts(state);
    const d = createWsDispatcher({ state, ...ports, win: mkWin() });
    d.dispatch({ type: "sessions", payload: [{ name: "a", status: "busy" }] });
    expect(ports.views.renderActiveWorkspace).not.toHaveBeenCalled();
    expect(ports.panes.updatePaneStatus).toHaveBeenCalledWith("a");
  });

  it("calls renderDashboard (not renderActiveWorkspace) when in dashboard mode", () => {
    const state = mkState({ activeWorkspaceId: null });
    const ports = mkPorts(state);
    const d = createWsDispatcher({ state, ...ports, win: mkWin() });
    d.dispatch({ type: "sessions", payload: [{ name: "a" }] });
    expect(ports.views.renderDashboard).toHaveBeenCalledTimes(1);
    expect(ports.views.renderActiveWorkspace).not.toHaveBeenCalled();
  });

  it("applies layout rebalance updates for unrecoverable orphans", () => {
    const state = mkState({ workspaces: [{ id: "w1", layout: { type: "leaf" } }] });
    const ports = mkPorts(state);
    const w = { id: "w1", layout: null };
    const newLayout = { type: "balanced" };
    ports.layouts.classifyOrphanGroups.mockReturnValue({ recreatable: [], unrecoverable: ["dead"] });
    ports.layouts.rebalanceLayoutsWithoutLeaves.mockReturnValue([{ workspace: w, newLayout }]);
    const d = createWsDispatcher({ state, ...ports, win: mkWin() });
    d.dispatch({ type: "sessions", payload: [] });
    expect(ports.layouts.transactionFn).toHaveBeenCalled();
    expect(ports.layouts.setWorkspaceLayout).toHaveBeenCalledWith(w, newLayout);
  });

  it("recreates recreatable orphan sessions", () => {
    const state = mkState();
    const ports = mkPorts(state);
    ports.layouts.classifyOrphanGroups.mockReturnValue({ recreatable: ["x", "y"], unrecoverable: [] });
    const d = createWsDispatcher({ state, ...ports, win: mkWin() });
    d.dispatch({ type: "sessions", payload: [] });
    expect(ports.sessions.recreateOrphanedSessions).toHaveBeenCalledWith(["x", "y"]);
  });
});

describe("createWsDispatcher - handleWsStatus", () => {
  it("updates session fields and triggers re-renders", () => {
    const state = mkState({ sessions: new Map([["a", { name: "a" }]]) });
    const ports = mkPorts(state);
    const d = createWsDispatcher({ state, ...ports, win: mkWin() });
    d.dispatch({ type: "status", session: "a", payload: { status: "busy", unreadCount: 3, pendingPermission: true } });
    const s = state.sessions.get("a");
    expect(s.status).toBe("busy");
    expect(s.unreadCount).toBe(3);
    expect(s.pendingPermission).toBe(true);
    expect(ports.panes.reconcilePaneActiveTypes).toHaveBeenCalled();
    expect(ports.panes.updatePaneStatus).toHaveBeenCalledWith("a");
  });

  it("on dead status schedules auto-remove via win.setTimeout", () => {
    const state = mkState({ sessions: new Map([["a", { name: "a" }]]) });
    const ports = mkPorts(state);
    const win = mkWin();
    const d = createWsDispatcher({ state, ...ports, win });
    d.dispatch({ type: "status", session: "a", payload: { status: "dead" } });
    expect(win.setTimeout).toHaveBeenCalled();
    expect(ports.sessions.autoRemoveDeadSession).toHaveBeenCalledWith("a");
  });

  it("on dirty exit calls showDirtyWarning with session and workingDir", () => {
    const state = mkState({ sessions: new Map([["a", { name: "a" }]]) });
    const ports = mkPorts(state);
    const d = createWsDispatcher({ state, ...ports, win: mkWin() });
    d.dispatch({ type: "status", session: "a", payload: { status: "dead", dirtyOnExit: true, workingDir: "/x" } });
    expect(ports.views.showDirtyWarning).toHaveBeenCalledWith("a", "/x");
  });
});

describe("createWsDispatcher - handleWsConfig + handleWsNotification", () => {
  it("config calls appChrome.applyInstanceName when name present", () => {
    const state = mkState();
    const ports = mkPorts(state);
    const d = createWsDispatcher({ state, ...ports, win: mkWin() });
    d.dispatch({ type: "config", name: "moss" });
    expect(ports.appChrome.applyInstanceName).toHaveBeenCalledWith("moss");
  });

  it("config skips when name is null", () => {
    const state = mkState();
    const ports = mkPorts(state);
    const d = createWsDispatcher({ state, ...ports, win: mkWin() });
    d.dispatch({ type: "config", name: null });
    expect(ports.appChrome.applyInstanceName).not.toHaveBeenCalled();
  });

  it("notification triggers updatePaneStatus and view renders", () => {
    const state = mkState({ sessions: new Map([["a", { name: "a" }]]) });
    const ports = mkPorts(state);
    const d = createWsDispatcher({ state, ...ports, win: mkWin() });
    d.dispatch({ type: "notification", session: "a" });
    expect(ports.panes.updatePaneStatus).toHaveBeenCalledWith("a");
    expect(ports.views.renderSessionsPanel).toHaveBeenCalled();
  });
});

describe("createWsDispatcher - refitAllTerminalsAndResize", () => {
  it("calls fit on every terminal and posts a resize message per session", () => {
    const fitA = vi.fn(); const fitB = vi.fn();
    const state = mkState({
      terminals: new Map([
        ["a", { term: { cols: 80, rows: 24, write: vi.fn() }, fitAddon: { fit: fitA } }],
        ["b", { term: { cols: 100, rows: 30, write: vi.fn() }, fitAddon: { fit: fitB } }],
      ]),
    });
    const d = createWsDispatcher({ state, ...mkPorts(state), win: mkWin() });
    d.refitAllTerminalsAndResize();
    expect(fitA).toHaveBeenCalled();
    expect(fitB).toHaveBeenCalled();
    expect(state.ws.send).toHaveBeenCalledTimes(2);
    const sent1 = JSON.parse(state.ws.send.mock.calls[0][0]);
    expect(sent1.type).toBe("resize");
    expect(sent1.payload).toEqual({ cols: 80, rows: 24 });
  });

  it("swallows errors from a misbehaving fit", () => {
    const state = mkState({
      terminals: new Map([["a", {
        term: { cols: 80, rows: 24, write: vi.fn() },
        fitAddon: { fit: () => { throw new Error("boom"); } },
      }]]),
    });
    const d = createWsDispatcher({ state, ...mkPorts(state), win: mkWin() });
    expect(() => d.refitAllTerminalsAndResize()).not.toThrow();
  });
});

describe("createWsDispatcher - restoreTerminalFocusAfterRebuild", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  afterEach(() => { document.body.innerHTML = ""; });

  it("no-ops when no focused pane", () => {
    const state = mkState({ focusedPane: null });
    const focusMock = vi.fn();
    state.terminals.set("a", { term: { focus: focusMock, write: vi.fn() }, fitAddon: { fit: vi.fn() } });
    const d = createWsDispatcher({ state, ...mkPorts(state), win: mkWin() });
    d.restoreTerminalFocusAfterRebuild();
    expect(focusMock).not.toHaveBeenCalled();
  });

  it("no-ops when in dashboard mode", () => {
    const state = mkState({ focusedPane: "a", activeWorkspaceId: null });
    const focusMock = vi.fn();
    state.terminals.set("a", { term: { focus: focusMock, write: vi.fn() }, fitAddon: { fit: vi.fn() } });
    const d = createWsDispatcher({ state, ...mkPorts(state), win: mkWin() });
    d.restoreTerminalFocusAfterRebuild();
    expect(focusMock).not.toHaveBeenCalled();
  });

  it("refocuses terminal when focus is on body (lost to rebuild)", () => {
    const state = mkState({ focusedPane: "a" });
    const focusMock = vi.fn();
    state.terminals.set("a", { term: { focus: focusMock, write: vi.fn() }, fitAddon: { fit: vi.fn() } });
    const d = createWsDispatcher({ state, ...mkPorts(state), win: mkWin() });
    d.restoreTerminalFocusAfterRebuild();
    expect(focusMock).toHaveBeenCalledTimes(1);
  });

  it("uses pane-group active type to resolve the terminal name", () => {
    const state = mkState({
      focusedPane: "group1",
      sessions: new Map([
        ["c-1", { status: "idle", group: "group1" }],
        ["p-1~pwsh", { status: "idle", group: "group1" }],
      ]),
      activePaneTypes: new Map([["group1", "claude"]]),
    });
    const focusC = vi.fn(); const focusP = vi.fn();
    state.terminals.set("c-1", { term: { focus: focusC, write: vi.fn() }, fitAddon: { fit: vi.fn() } });
    state.terminals.set("p-1", { term: { focus: focusP, write: vi.fn() }, fitAddon: { fit: vi.fn() } });
    const d = createWsDispatcher({ state, ...mkPorts(state), win: mkWin() });
    d.restoreTerminalFocusAfterRebuild();
    expect(focusC).toHaveBeenCalledTimes(1);
    expect(focusP).not.toHaveBeenCalled();
  });
});
