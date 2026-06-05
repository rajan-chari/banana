// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSessionDrop } from "../public/lib/session-drop.js";

function mkDrop(overrides: any = {}) {
  document.body.innerHTML = `<div id="workspace-area"></div>`;
  const state: any = {
    sessions: new Map<string, any>(),
    workspaces: [{ id: "w1", name: "WS 1", layout: null }],
    activeWorkspaceId: "w1",
    ...overrides.state,
  };
  const actions = {
    createWorkspace: vi.fn((n: string | null) => {
      const ws: any = { id: `w-${state.workspaces.length + 1}`, name: n || "auto", layout: null };
      state.workspaces.push(ws);
      return ws;
    }),
    switchToWorkspace: vi.fn(),
    renderActiveWorkspace: vi.fn(),
    openFolder: vi.fn(async () => {}),
    ...overrides.actions,
  };
  const helpers = {
    getLeafList: (node: any): string[] => {
      if (!node) return [];
      if (node.type === "leaf") return [node.session];
      return [...helpers.getLeafList(node.children[0]), ...helpers.getLeafList(node.children[1])];
    },
    getDefaultAiCommand: vi.fn(() => "claude"),
    setWorkspaceLayout: vi.fn((ws: any, tree: any) => { ws.layout = tree; }),
    ...overrides.helpers,
  };
  const drop = createSessionDrop({
    state,
    byId: (id: string) => document.getElementById(id),
    helpers,
    actions,
  });
  return { drop, state, actions, helpers };
}

function makeDt(data: Record<string, string>): any {
  const types = Object.keys(data);
  return {
    types,
    getData: (k: string) => data[k] || "",
    setData: vi.fn(),
    dropEffect: "none",
  };
}

function makeDragEvent(type: string, data: Record<string, string>): any {
  const ev: any = new Event(type);
  ev.dataTransfer = makeDt(data);
  ev.preventDefault = vi.fn();
  return ev;
}

describe("createSessionDrop - addSessionToWorkspace", () => {
  it("creates a leaf layout when workspace has no layout yet", () => {
    const { drop, state } = mkDrop();
    drop.addSessionToWorkspace("w1", "sess-a");
    expect(state.workspaces[0].layout).toEqual({ type: "leaf", session: "sess-a" });
  });

  it("appends a new leaf to existing layout", () => {
    const { drop, state } = mkDrop();
    state.workspaces[0].layout = { type: "leaf", session: "sess-a" };
    drop.addSessionToWorkspace("w1", "sess-b");
    // appendLeafToTree turns single leaf into a 50/50 horizontal split
    expect(state.workspaces[0].layout.type).toBe("split");
    expect(state.workspaces[0].layout.children[0].session).toBe("sess-a");
    expect(state.workspaces[0].layout.children[1].session).toBe("sess-b");
  });

  it("is a no-op when workspace id is unknown", () => {
    const { drop, state } = mkDrop();
    drop.addSessionToWorkspace("ghost", "sess-a");
    expect(state.workspaces[0].layout).toBeNull();
  });
});

describe("createSessionDrop - handleSessionDrop with session payload", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("adds the session to a target workspace and switches+renders", async () => {
    const { drop, state, actions } = mkDrop();
    const evt = makeDragEvent("drop", { "pty-win/session": JSON.stringify({ group: "sess-x" }) });
    await drop.handleSessionDrop(evt, "w1");
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(state.workspaces[0].layout).toEqual({ type: "leaf", session: "sess-x" });
    expect(actions.switchToWorkspace).toHaveBeenCalledWith("w1");
    expect(actions.renderActiveWorkspace).toHaveBeenCalled();
  });

  it("creates a new workspace when no target id is provided", async () => {
    const { drop, state, actions } = mkDrop();
    const evt = makeDragEvent("drop", { "pty-win/session": JSON.stringify({ group: "sess-y" }) });
    await drop.handleSessionDrop(evt, null);
    expect(actions.createWorkspace).toHaveBeenCalledWith("sess-y");
    expect(state.workspaces).toHaveLength(2);
    expect(state.workspaces[1].layout).toEqual({ type: "leaf", session: "sess-y" });
  });

  it("does not re-add a session already present in the workspace", async () => {
    const { drop, state, actions } = mkDrop();
    state.workspaces[0].layout = { type: "leaf", session: "sess-a" };
    const evt = makeDragEvent("drop", { "pty-win/session": JSON.stringify({ group: "sess-a" }) });
    await drop.handleSessionDrop(evt, "w1");
    // layout unchanged (still a single leaf)
    expect(state.workspaces[0].layout).toEqual({ type: "leaf", session: "sess-a" });
    expect(actions.switchToWorkspace).toHaveBeenCalled();
  });

  it("does nothing without a dataTransfer", async () => {
    const { drop, state } = mkDrop();
    const evt: any = new Event("drop");
    evt.preventDefault = vi.fn();
    evt.dataTransfer = null;
    await drop.handleSessionDrop(evt, "w1");
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(state.workspaces[0].layout).toBeNull();
  });

  it("returns early when no group can be derived", async () => {
    const { drop, state, actions } = mkDrop();
    const evt = makeDragEvent("drop", { "pty-win/other": "{}" });
    await drop.handleSessionDrop(evt, "w1");
    expect(state.workspaces[0].layout).toBeNull();
    expect(actions.switchToWorkspace).not.toHaveBeenCalled();
  });

  it("bails if the target workspace id is unknown", async () => {
    const { drop, state, actions } = mkDrop();
    const evt = makeDragEvent("drop", { "pty-win/session": JSON.stringify({ group: "sess-x" }) });
    await drop.handleSessionDrop(evt, "ghost");
    expect(state.workspaces[0].layout).toBeNull();
    expect(actions.switchToWorkspace).not.toHaveBeenCalled();
  });
});

describe("createSessionDrop - handleSessionDrop with folder payload", () => {
  it("opens the folder when no session exists yet and adds it", async () => {
    const { drop, state, actions, helpers } = mkDrop();
    const evt = makeDragEvent("drop", {
      "pty-win/folder": JSON.stringify({ workingDir: "/repo/x", folderName: "x" }),
    });
    await drop.handleSessionDrop(evt, "w1");
    expect(actions.openFolder).toHaveBeenCalledWith("/repo/x", "x", "claude");
    expect(helpers.getDefaultAiCommand).toHaveBeenCalled();
    expect(state.workspaces[0].layout).toEqual({ type: "leaf", session: "x" });
  });

  it("opens the folder again when the existing session is dead", async () => {
    const { drop, state, actions } = mkDrop();
    state.sessions.set("x", { status: "dead" });
    const evt = makeDragEvent("drop", {
      "pty-win/folder": JSON.stringify({ workingDir: "/repo/x", folderName: "x" }),
    });
    await drop.handleSessionDrop(evt, "w1");
    expect(actions.openFolder).toHaveBeenCalledTimes(1);
  });

  it("skips openFolder when a live session already exists", async () => {
    const { drop, state, actions } = mkDrop();
    state.sessions.set("x", { status: "idle" });
    const evt = makeDragEvent("drop", {
      "pty-win/folder": JSON.stringify({ workingDir: "/repo/x", folderName: "x" }),
    });
    await drop.handleSessionDrop(evt, "w1");
    expect(actions.openFolder).not.toHaveBeenCalled();
    expect(state.workspaces[0].layout).toEqual({ type: "leaf", session: "x" });
  });
});

describe("createSessionDrop - attachWorkspaceAreaListeners", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("preventDefault + dropEffect='copy' on dragover for session/folder payloads", () => {
    const { drop } = mkDrop();
    drop.attachWorkspaceAreaListeners();
    const area = document.getElementById("workspace-area")!;
    const evt = makeDragEvent("dragover", { "pty-win/session": "{}" });
    area.dispatchEvent(evt);
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(evt.dataTransfer.dropEffect).toBe("copy");
  });

  it("ignores dragover when types don't include session/folder", () => {
    const { drop } = mkDrop();
    drop.attachWorkspaceAreaListeners();
    const area = document.getElementById("workspace-area")!;
    const evt = makeDragEvent("dragover", { "text/plain": "hi" });
    area.dispatchEvent(evt);
    expect(evt.preventDefault).not.toHaveBeenCalled();
    expect(evt.dataTransfer.dropEffect).toBe("none");
  });

  it("drop on the workspace area routes through handleSessionDrop with the active ws id", async () => {
    const { drop, state, actions } = mkDrop();
    drop.attachWorkspaceAreaListeners();
    const area = document.getElementById("workspace-area")!;
    const evt = makeDragEvent("drop", { "pty-win/session": JSON.stringify({ group: "sess-z" }) });
    area.dispatchEvent(evt);
    // Drop handler is async; let microtasks drain
    await Promise.resolve();
    await Promise.resolve();
    expect(state.workspaces[0].layout).toEqual({ type: "leaf", session: "sess-z" });
    expect(actions.switchToWorkspace).toHaveBeenCalledWith("w1");
  });

  it("ignores drop on workspace area for unrelated payloads", () => {
    const { drop, state } = mkDrop();
    drop.attachWorkspaceAreaListeners();
    const area = document.getElementById("workspace-area")!;
    const evt = makeDragEvent("drop", { "text/plain": "hi" });
    area.dispatchEvent(evt);
    expect(state.workspaces[0].layout).toBeNull();
  });

  it("is a no-op when #workspace-area is missing from the DOM", () => {
    document.body.innerHTML = "";
    const { drop } = mkDrop({ state: { sessions: new Map() } });
    document.body.innerHTML = "";
    // Should not throw
    expect(() => drop.attachWorkspaceAreaListeners()).not.toThrow();
  });
});
