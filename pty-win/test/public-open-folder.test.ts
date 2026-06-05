// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeSessionNames,
  estimatePtyDims,
  buildCreateSessionRequest,
  cleanupDeadSession,
  attachToSiblingWorkspace,
  tileNewSessionIntoWorkspace,
  optimisticallyAddNewSession,
} from "../public/lib/open-folder.js";

describe("computeSessionNames", () => {
  it("defaults baseName from folderPath when folderName is undefined", () => {
    expect(computeSessionNames("C:\\projects\\foo", undefined, "claude")).toEqual({
      baseName: "foo",
      sessionName: "foo",
      isPwsh: false,
    });
  });

  it("uses folderName when provided", () => {
    expect(computeSessionNames("C:\\x\\y", "custom", null)).toEqual({
      baseName: "custom",
      sessionName: "custom",
      isPwsh: false,
    });
  });

  it("appends ~pwsh suffix when command is pwsh", () => {
    const r = computeSessionNames("C:\\foo", "foo", "pwsh");
    expect(r.isPwsh).toBe(true);
    expect(r.sessionName).toBe("foo~pwsh");
  });

  it("falls back to full path when no segments present", () => {
    expect(computeSessionNames("/", undefined, null).baseName).toBe("/");
  });

  it("handles forward-slash paths", () => {
    expect(computeSessionNames("/home/me/proj", undefined, null).baseName).toBe("proj");
  });

  it("treats undefined command as non-pwsh", () => {
    expect(computeSessionNames("/x", "x", undefined).isPwsh).toBe(false);
  });
});

describe("estimatePtyDims", () => {
  it("computes integer cols/rows from available size", () => {
    const { cols, rows } = estimatePtyDims(800, 600);
    expect(Number.isInteger(cols)).toBe(true);
    expect(Number.isInteger(rows)).toBe(true);
    // 800-4 = 796 / 7.6 = 104.7 -> 104
    expect(cols).toBe(104);
    // 600-35-26-22-4 = 513 / 18 = 28.5 -> 28
    expect(rows).toBe(28);
  });

  it("clamps cols to MIN_COLS (80)", () => {
    expect(estimatePtyDims(0, 600).cols).toBe(80);
    expect(estimatePtyDims(100, 600).cols).toBe(80);
  });

  it("clamps rows to MIN_ROWS (24)", () => {
    expect(estimatePtyDims(800, 0).rows).toBe(24);
    expect(estimatePtyDims(800, 100).rows).toBe(24);
  });

  it("scales with width/height", () => {
    const small = estimatePtyDims(800, 600);
    const big = estimatePtyDims(1600, 1200);
    expect(big.cols).toBeGreaterThan(small.cols);
    expect(big.rows).toBeGreaterThan(small.rows);
  });
});

describe("buildCreateSessionRequest", () => {
  const getDefaultAiCommand = vi.fn(() => "claude");
  beforeEach(() => { getDefaultAiCommand.mockClear(); });

  it("uses provided command", () => {
    expect(buildCreateSessionRequest({
      folderPath: "/x", cols: 100, rows: 30, command: "pwsh", args: [], getDefaultAiCommand,
    })).toEqual({
      workingDir: "/x", cols: 100, rows: 30, command: "pwsh",
    });
    expect(getDefaultAiCommand).not.toHaveBeenCalled();
  });

  it("falls back to getDefaultAiCommand when no command", () => {
    expect(buildCreateSessionRequest({
      folderPath: "/x", cols: 100, rows: 30, command: null, args: [], getDefaultAiCommand,
    })).toEqual({
      workingDir: "/x", cols: 100, rows: 30, command: "claude",
    });
    expect(getDefaultAiCommand).toHaveBeenCalledTimes(1);
  });

  it("includes args when non-empty", () => {
    expect(buildCreateSessionRequest({
      folderPath: "/x", cols: 100, rows: 30, command: "claude", args: ["--resume"], getDefaultAiCommand,
    })).toEqual({
      workingDir: "/x", cols: 100, rows: 30, command: "claude", args: ["--resume"],
    });
  });

  it("omits args key when empty", () => {
    const body = buildCreateSessionRequest({
      folderPath: "/x", cols: 100, rows: 30, command: "claude", args: [], getDefaultAiCommand,
    });
    expect("args" in body).toBe(false);
  });

  it("omits args key when undefined", () => {
    const body = buildCreateSessionRequest({
      folderPath: "/x", cols: 100, rows: 30, command: "claude", getDefaultAiCommand,
    });
    expect("args" in body).toBe(false);
  });
});

describe("cleanupDeadSession", () => {
  function makeState() {
    return {
      sessions: new Map([["dead-a", { status: "dead" }]]),
      terminals: new Map(),
    };
  }
  function mkSessions(state: { sessions: Map<string, unknown> }) {
    return {
      remove: (name: string) => state.sessions.delete(name),
    };
  }

  it("DELETEs the session and removes from sessions Map", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const state = makeState();
    await cleanupDeadSession("dead-a", { state, sessions: mkSessions(state), fetchFn });
    expect(fetchFn).toHaveBeenCalledWith("/api/sessions/dead-a", { method: "DELETE" });
    expect(state.sessions.has("dead-a")).toBe(false);
  });

  it("URL-encodes the session name", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const state = makeState();
    await cleanupDeadSession("name with spaces", { state, sessions: mkSessions(state), fetchFn });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/sessions/name%20with%20spaces",
      { method: "DELETE" },
    );
  });

  it("swallows DELETE failure but still clears local state", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network"));
    const state = makeState();
    await expect(cleanupDeadSession("dead-a", { state, sessions: mkSessions(state), fetchFn })).resolves.toBeUndefined();
    expect(state.sessions.has("dead-a")).toBe(false);
  });

  it("disposes terminal entry: resizeObserver, term, wrapperEl", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const disconnect = vi.fn();
    const dispose = vi.fn();
    const remove = vi.fn();
    const state = {
      sessions: new Map([["s1", { status: "dead" }]]),
      terminals: new Map([["s1", {
        resizeObserver: { disconnect },
        term: { dispose },
        wrapperEl: { remove },
      }]]),
    };
    await cleanupDeadSession("s1", { state, sessions: mkSessions(state), fetchFn });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(state.terminals.has("s1")).toBe(false);
  });

  it("tolerates missing terminal entry", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const state = { sessions: new Map<string, unknown>(), terminals: new Map() };
    await expect(cleanupDeadSession("ghost", { state, sessions: mkSessions(state), fetchFn })).resolves.toBeUndefined();
  });

  it("tolerates terminal entry without resizeObserver or wrapperEl", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const dispose = vi.fn();
    const state = {
      sessions: new Map([["s1", { status: "dead" }]]),
      terminals: new Map([["s1", { term: { dispose } }]]),
    };
    await expect(cleanupDeadSession("s1", { state, sessions: mkSessions(state), fetchFn })).resolves.toBeUndefined();
    expect(dispose).toHaveBeenCalled();
    expect(state.terminals.has("s1")).toBe(false);
  });
});

describe("attachToSiblingWorkspace", () => {
  function mkArgs(overrides: any = {}) {
    return {
      siblingWs: { id: "ws-1" },
      baseName: "foo",
      switchToWorkspace: vi.fn(),
      renderActiveWorkspace: vi.fn(),
      focusPane: vi.fn(),
      ...overrides,
    };
  }

  it("switches to the sibling workspace, renders, and focuses the pane", () => {
    const args = mkArgs();
    attachToSiblingWorkspace(args);
    expect(args.switchToWorkspace).toHaveBeenCalledWith("ws-1");
    expect(args.renderActiveWorkspace).toHaveBeenCalledTimes(1);
    expect(args.focusPane).toHaveBeenCalledWith("foo");
  });

  it("orchestration only — does not touch state.sessions or activePaneTypes", () => {
    // Phase 9d-A invariant: optimistic state insertion moved to
    // optimisticallyAddNewSession (called from placeNewSession).
    // attachToSiblingWorkspace is purely orchestration now.
    const args = mkArgs();
    attachToSiblingWorkspace(args);
    // Just renders + focuses. No store interaction.
    expect(Object.keys(args).sort()).toEqual([
      "baseName", "focusPane", "renderActiveWorkspace", "siblingWs", "switchToWorkspace",
    ].sort());
  });
});

describe("optimisticallyAddNewSession (9d-A)", () => {
  function mkArgs(overrides: any = {}) {
    return {
      baseName: "foo",
      sessionName: "foo",
      isPwsh: false,
      command: "claude",
      folderPath: "C:\\projects\\foo",
      sessions: { add: vi.fn(() => true) },
      activePaneTypes: { set: vi.fn() },
      rebuildPaneGroups: vi.fn(),
      ...overrides,
    };
  }

  it("sets activeType BEFORE calling sessions.add (observer-order invariant)", () => {
    const calls: string[] = [];
    const args = mkArgs({
      sessions: { add: vi.fn((_info: any) => { calls.push("add"); return true; }) },
      activePaneTypes: { set: vi.fn((_n: string, _t: string) => { calls.push("setActive"); }) },
      rebuildPaneGroups: vi.fn(() => { calls.push("rebuild"); }),
    });
    optimisticallyAddNewSession(args);
    expect(calls).toEqual(["setActive", "add", "rebuild"]);
  });

  it("inserts a starting SessionInfo with name/group/command/workingDir", () => {
    const add = vi.fn((_info: any) => true);
    const args = mkArgs({
      isPwsh: false,
      sessionName: "foo",
      command: "claude",
      folderPath: "/path/to/foo",
      sessions: { add },
    });
    optimisticallyAddNewSession(args);
    expect(add).toHaveBeenCalledWith({
      name: "foo",
      group: "foo",
      command: "claude",
      status: "starting",
      workingDir: "/path/to/foo",
    });
  });

  it("uses the real command, not a hard-coded 'claude'", () => {
    const add = vi.fn((_info: any) => true);
    const args = mkArgs({ command: "copilot", sessions: { add } });
    optimisticallyAddNewSession(args);
    expect(add.mock.calls[0][0].command).toBe("copilot");
  });

  it("sets activePaneTypes to 'pwsh' for a pwsh session", () => {
    const setActive = vi.fn();
    const args = mkArgs({
      isPwsh: true,
      sessionName: "foo~pwsh",
      command: "pwsh",
      activePaneTypes: { set: setActive },
    });
    optimisticallyAddNewSession(args);
    expect(setActive).toHaveBeenCalledWith("foo", "pwsh");
  });

  it("sets activePaneTypes to 'claude' for a non-pwsh session", () => {
    const setActive = vi.fn();
    const args = mkArgs({ isPwsh: false, activePaneTypes: { set: setActive } });
    optimisticallyAddNewSession(args);
    expect(setActive).toHaveBeenCalledWith("foo", "claude");
  });

  it("calls rebuildPaneGroups after the optimistic insertion", () => {
    const rebuildPaneGroups = vi.fn();
    const args = mkArgs({ rebuildPaneGroups });
    optimisticallyAddNewSession(args);
    expect(rebuildPaneGroups).toHaveBeenCalledTimes(1);
  });

  it("tolerates sessions.add returning false (name collision) — still flips active + rebuilds", () => {
    const rebuildPaneGroups = vi.fn();
    const setActive = vi.fn();
    const args = mkArgs({
      sessions: { add: vi.fn(() => false) },
      activePaneTypes: { set: setActive },
      rebuildPaneGroups,
    });
    optimisticallyAddNewSession(args);
    expect(setActive).toHaveBeenCalled();
    expect(rebuildPaneGroups).toHaveBeenCalled();
  });

  it("uses baseName as the group key (not sessionName) so pwsh joins the claude group", () => {
    const setActive = vi.fn();
    const add = vi.fn((_info: any) => true);
    const args = mkArgs({
      baseName: "foo",
      sessionName: "foo~pwsh",
      isPwsh: true,
      command: "pwsh",
      sessions: { add },
      activePaneTypes: { set: setActive },
    });
    optimisticallyAddNewSession(args);
    expect(setActive).toHaveBeenCalledWith("foo", "pwsh");
    expect(add.mock.calls[0][0].group).toBe("foo");
    expect(add.mock.calls[0][0].name).toBe("foo~pwsh");
  });
});

describe("tileNewSessionIntoWorkspace", () => {
  type Ws = { id: string };

  function mkArgs(overrides: Partial<Parameters<typeof tileNewSessionIntoWorkspace>[0]> = {}) {
    const ws: Ws = { id: "ws-active" };
    const created: Ws = { id: "ws-new" };
    return {
      newWorkspace: false,
      baseName: "foo",
      createWorkspace: vi.fn((_name: string) => created),
      getOrCreateActiveWorkspace: vi.fn(() => ws),
      addSessionToWorkspace: vi.fn(),
      switchToWorkspace: vi.fn(),
      renderActiveWorkspace: vi.fn(),
      focusPane: vi.fn(),
      updateWorkspaceTabName: vi.fn(),
      ...overrides,
    };
  }

  it("appends to the active workspace when newWorkspace is false", () => {
    const args = mkArgs();
    tileNewSessionIntoWorkspace(args);
    expect(args.getOrCreateActiveWorkspace).toHaveBeenCalledTimes(1);
    expect(args.createWorkspace).not.toHaveBeenCalled();
    expect(args.addSessionToWorkspace).toHaveBeenCalledWith("ws-active", "foo");
    expect(args.switchToWorkspace).toHaveBeenCalledWith("ws-active");
  });

  it("creates a new workspace named after baseName when newWorkspace is true", () => {
    const args = mkArgs({ newWorkspace: true });
    tileNewSessionIntoWorkspace(args);
    expect(args.createWorkspace).toHaveBeenCalledWith("foo");
    expect(args.getOrCreateActiveWorkspace).not.toHaveBeenCalled();
    expect(args.addSessionToWorkspace).toHaveBeenCalledWith("ws-new", "foo");
    expect(args.switchToWorkspace).toHaveBeenCalledWith("ws-new");
  });

  it("re-renders and focuses the new pane", () => {
    const args = mkArgs();
    tileNewSessionIntoWorkspace(args);
    expect(args.renderActiveWorkspace).toHaveBeenCalledTimes(1);
    expect(args.focusPane).toHaveBeenCalledWith("foo");
  });

  it("calls updateWorkspaceTabName with the receiving workspace", () => {
    const newArgs = mkArgs({ newWorkspace: true });
    tileNewSessionIntoWorkspace(newArgs);
    expect(newArgs.updateWorkspaceTabName).toHaveBeenCalledWith({ id: "ws-new" });

    const activeArgs = mkArgs();
    tileNewSessionIntoWorkspace(activeArgs);
    expect(activeArgs.updateWorkspaceTabName).toHaveBeenCalledWith({ id: "ws-active" });
  });
});
