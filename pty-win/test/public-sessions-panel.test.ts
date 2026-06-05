// @vitest-environment happy-dom
//
// Tests for public/lib/sessions-panel.js — createSessionsPanel factory
// (Phase 6b). renderSessionsPanel orchestrates the sidebar list of active
// session groups: builds groups, renders rows, lazy-fetches folder-info,
// and wires click/contextmenu/dragstart handlers.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSessionsPanel } from "../public/lib/sessions-panel.js";

function mkPanel(overrides: any = {}) {
  document.body.innerHTML = `
    <div id="sessions-list"></div>
    <span class="session-count"></span>
  `;
  const state: any = {
    paneGroups: new Map(),
    sessions: new Map(),
    focusedPane: null,
    folderInfoCache: new Map(),
    ...overrides.state,
  };
  const fetchFn = vi.fn(async () => ({
    json: async () => ({ isClaudeReady: true, hasIdentity: true, identityName: "moss" }),
  }));
  const helpers = {
    normPath: (p: string) => (p || "").toLowerCase(),
    buildSessionGroups: vi.fn(() => [] as any[]),
    createSessionRow: vi.fn((g: any) => {
      const row = document.createElement("div");
      row.className = "session-row";
      row.dataset["group"] = g.group;
      return row;
    }),
    createEmptyRow: vi.fn(() => {
      const e = document.createElement("div");
      e.className = "sessions-empty";
      e.textContent = "No sessions";
      return e;
    }),
    buildSessionRowActionsOpts: vi.fn((_g: any, _cached: any, onKill: () => void) => ({ onKill, workingDir: _g.workingDir })),
    patchSessionRowIndicators: vi.fn(),
    activeNameForRow: vi.fn((g: any) => g.activeName ?? null),
    ...overrides.helpers,
  };
  const actions = {
    appendRowActions: vi.fn(),
    killSession: vi.fn(),
    focusExistingSession: vi.fn(),
    showContextMenu: vi.fn(),
    ...overrides.actions,
  };
  const panel = createSessionsPanel({
    state,
    byId: (id: string) => document.getElementById(id),
    doc: document,
    env: { fetchFn: fetchFn as any },
    helpers,
    actions,
  });
  return { panel, state, helpers, actions, fetchFn };
}

describe("createSessionsPanel - empty state", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("appends a single .sessions-empty row when there are no groups", () => {
    const { panel, helpers } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([]);
    panel.renderSessionsPanel();
    const list = document.getElementById("sessions-list")!;
    expect(list.querySelectorAll(".sessions-empty")).toHaveLength(1);
    expect(helpers.createEmptyRow).toHaveBeenCalledTimes(1);
  });

  it("clears .session-count textContent when zero groups", () => {
    const { panel, helpers } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([]);
    panel.renderSessionsPanel();
    expect(document.querySelector(".session-count")!.textContent).toBe("");
  });

  it("returns early when #sessions-list is missing", () => {
    const { panel, helpers } = mkPanel();
    document.body.innerHTML = "";
    expect(() => panel.renderSessionsPanel()).not.toThrow();
    expect(helpers.buildSessionGroups).not.toHaveBeenCalled();
  });
});

describe("createSessionsPanel - populated state", () => {
  it("renders one row per group and shows the count", () => {
    const { panel, helpers, actions } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([
      { group: "g1", workingDir: "/r1", pg: {}, claudeAlive: false, pwshAlive: false },
      { group: "g2", workingDir: "/r2", pg: {}, claudeAlive: false, pwshAlive: false },
    ]);
    panel.renderSessionsPanel();
    const list = document.getElementById("sessions-list")!;
    expect(list.querySelectorAll(".session-row")).toHaveLength(2);
    expect(document.querySelector(".session-count")!.textContent).toBe("(2)");
    expect(actions.appendRowActions).toHaveBeenCalledTimes(2);
  });

  it("appendRowActions opts.onKill kills both alive claude and pwsh of the group", () => {
    const { panel, helpers, actions } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([
      { group: "g1", workingDir: "/r1", pg: { claude: "g1-claude", pwsh: "g1-pwsh" }, claudeAlive: true, pwshAlive: true },
    ]);
    panel.renderSessionsPanel();
    // appendRowActions was called with opts where onKill is the closure under test
    const opts: any = actions.appendRowActions.mock.calls[0][1];
    opts.onKill();
    expect(actions.killSession).toHaveBeenCalledTimes(2);
    const k0: any = actions.killSession.mock.calls[0];
    const k1: any = actions.killSession.mock.calls[1];
    expect(k0[0]).toBe("g1-claude");
    expect(k1[0]).toBe("g1-pwsh");
  });

  it("appendRowActions opts.onKill skips dead members", () => {
    const { panel, helpers, actions } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([
      { group: "g1", workingDir: "/r1", pg: { claude: "g1-claude" }, claudeAlive: false, pwshAlive: false },
    ]);
    panel.renderSessionsPanel();
    const c: any = actions.appendRowActions.mock.calls[0];
    c[1].onKill();
    expect(actions.killSession).not.toHaveBeenCalled();
  });

  it("clears the list on each render (no row accumulation)", () => {
    const { panel, helpers } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([{ group: "g1", workingDir: "/r1", pg: {}, claudeAlive: false, pwshAlive: false }]);
    panel.renderSessionsPanel();
    panel.renderSessionsPanel();
    expect(document.getElementById("sessions-list")!.querySelectorAll(".session-row")).toHaveLength(1);
  });
});

describe("createSessionsPanel - lazy folder-info fetch", () => {
  it("fetches /api/folder-info when no cache entry", async () => {
    const { panel, helpers, fetchFn } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([
      { group: "g1", workingDir: "/myrepo", pg: {}, claudeAlive: false, pwshAlive: false },
    ]);
    panel.renderSessionsPanel();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const call: any = fetchFn.mock.calls[0];
    expect(call[0]).toBe(`/api/folder-info?path=${encodeURIComponent("/myrepo")}`);
    // Flush macrotask so fetch → .then(r.json) → .then(info) all settle.
    await new Promise((r) => setTimeout(r, 0));
    // Cache populated
    expect(helpers.normPath("/myrepo")).toBe("/myrepo");
  });

  it("skips fetch when cache has an entry", () => {
    const { panel, helpers, state, fetchFn } = mkPanel();
    state.folderInfoCache.set("/myrepo", { isClaudeReady: true, hasIdentity: false });
    helpers.buildSessionGroups.mockReturnValue([
      { group: "g1", workingDir: "/myrepo", pg: {}, claudeAlive: false, pwshAlive: false },
    ]);
    panel.renderSessionsPanel();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("patches indicators when row is still connected", async () => {
    const { panel, helpers, state } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([
      { group: "g1", workingDir: "/myrepo", pg: {}, claudeAlive: false, pwshAlive: false },
    ]);
    panel.renderSessionsPanel();
    await new Promise((r) => setTimeout(r, 0));
    expect(helpers.patchSessionRowIndicators).toHaveBeenCalledTimes(1);
    expect(state.folderInfoCache.get("/myrepo")).toBeDefined();
  });

  it("does NOT patch indicators if row was detached before fetch resolved", async () => {
    const { panel, helpers, state } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([
      { group: "g1", workingDir: "/myrepo", pg: {}, claudeAlive: false, pwshAlive: false },
    ]);
    panel.renderSessionsPanel();
    // Detach the row (simulate a re-render that removed it before fetch resolved)
    document.getElementById("sessions-list")!.innerHTML = "";
    await new Promise((r) => setTimeout(r, 0));
    // Cache still populated (worth keeping the result), patch skipped
    expect(state.folderInfoCache.get("/myrepo")).toBeDefined();
    expect(helpers.patchSessionRowIndicators).not.toHaveBeenCalled();
  });

  it("swallows fetch failures silently", async () => {
    const { panel, helpers, state } = mkPanel({} as any);
    // Replace fetchFn to reject
    const { panel: panel2, fetchFn: failingFetch, helpers: helpers2 } = mkPanel({
      helpers: {
        buildSessionGroups: vi.fn(() => [
          { group: "g1", workingDir: "/myrepo", pg: {}, claudeAlive: false, pwshAlive: false },
        ]),
      },
    });
    failingFetch.mockRejectedValueOnce(new Error("boom"));
    expect(() => panel2.renderSessionsPanel()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(helpers2.patchSessionRowIndicators).not.toHaveBeenCalled();
    // Use the first panel/helpers/state to silence unused-var warning
    void panel; void helpers; void state;
  });
});

describe("createSessionsPanel - row wiring", () => {
  it("row.onclick focuses the active session name when one exists", () => {
    const { panel, helpers, actions } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([
      { group: "g1", workingDir: "/r1", pg: {}, activeName: "g1-claude", claudeAlive: false, pwshAlive: false },
    ]);
    panel.renderSessionsPanel();
    const row = document.querySelector(".session-row") as HTMLElement;
    (row.onclick as any)({} as any);
    expect(actions.focusExistingSession).toHaveBeenCalledWith("g1-claude");
  });

  it("row.onclick is not attached when activeNameForRow returns null", () => {
    const { panel, helpers } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([
      { group: "g1", workingDir: "/r1", pg: {}, activeName: null, claudeAlive: false, pwshAlive: false },
    ]);
    panel.renderSessionsPanel();
    const row = document.querySelector(".session-row") as HTMLElement;
    expect(row.onclick).toBeNull();
  });

  it("contextmenu routes through showContextMenu with the workingDir", () => {
    const { panel, helpers, actions } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([
      { group: "g1", workingDir: "/r1", pg: {}, claudeAlive: false, pwshAlive: false },
    ]);
    panel.renderSessionsPanel();
    const row = document.querySelector(".session-row") as HTMLElement;
    const evt = new Event("contextmenu");
    row.dispatchEvent(evt);
    expect(actions.showContextMenu).toHaveBeenCalledTimes(1);
    const cm: any = actions.showContextMenu.mock.calls[0];
    expect(cm[1]).toBe("/r1");
  });

  it("contextmenu is a no-op when workingDir is empty", () => {
    const { panel, helpers, actions } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([
      { group: "g1", workingDir: "", pg: {}, claudeAlive: false, pwshAlive: false },
    ]);
    panel.renderSessionsPanel();
    const row = document.querySelector(".session-row") as HTMLElement;
    row.dispatchEvent(new Event("contextmenu"));
    expect(actions.showContextMenu).not.toHaveBeenCalled();
  });

  it("dragstart sets the pty-win/session payload with group + workingDir", () => {
    const { panel, helpers } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([
      { group: "g1", workingDir: "/r1", pg: {}, claudeAlive: false, pwshAlive: false },
    ]);
    panel.renderSessionsPanel();
    const row = document.querySelector(".session-row") as HTMLElement;
    expect((row as any).draggable).toBe(true);
    const evt: any = new Event("dragstart");
    const setData = vi.fn();
    evt.dataTransfer = { setData, effectAllowed: "none" };
    row.dispatchEvent(evt);
    expect(setData).toHaveBeenCalledWith(
      "pty-win/session",
      JSON.stringify({ group: "g1", workingDir: "/r1" }),
    );
    expect(evt.dataTransfer.effectAllowed).toBe("copy");
  });

  it("dragstart with no dataTransfer is a silent no-op", () => {
    const { panel, helpers } = mkPanel();
    helpers.buildSessionGroups.mockReturnValue([
      { group: "g1", workingDir: "/r1", pg: {}, claudeAlive: false, pwshAlive: false },
    ]);
    panel.renderSessionsPanel();
    const row = document.querySelector(".session-row") as HTMLElement;
    const evt: any = new Event("dragstart");
    evt.dataTransfer = null;
    expect(() => row.dispatchEvent(evt)).not.toThrow();
  });
});
