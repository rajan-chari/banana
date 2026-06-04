// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  pickActiveFolderSessions,
  computeFolderStatus,
  buildRowActionsOptions,
  applyFolderInfoToIndicators,
  findActiveSessionForFolder,
  buildQuickAccessRow,
  renderQuickAccess,
} from "../public/lib/quick-access.js";

type Sess = {
  name: string;
  status: string;
  command?: string | null;
  workingDir: string;
  emcomIdentity?: string | null;
  unreadCount?: number;
  pendingPermission?: boolean;
};

function mkSess(s: Partial<Sess> & { name: string; workingDir: string }): Sess {
  return { status: "idle", command: "claude", ...s };
}

function mkMap(arr: Sess[]): Map<string, Sess> {
  return new Map(arr.map((s) => [s.name, s]));
}

describe("pickActiveFolderSessions", () => {
  it("splits claude vs pwsh by command, ignoring dead and wrong path", () => {
    const sessions = mkMap([
      mkSess({ name: "a", workingDir: "C:\\foo", command: "claude" }),
      mkSess({ name: "b", workingDir: "C:\\foo", command: "pwsh" }),
      mkSess({ name: "c", workingDir: "C:\\foo", command: "claude", status: "dead" }),
      mkSess({ name: "d", workingDir: "C:\\bar", command: "claude" }),
    ]);
    const { claude, pwsh } = pickActiveFolderSessions(sessions, "c:/foo");
    expect(claude?.name).toBe("a");
    expect(pwsh?.name).toBe("b");
  });

  it("picks first match by iteration order when multiple match", () => {
    const sessions = mkMap([
      mkSess({ name: "a1", workingDir: "C:\\foo", command: "claude" }),
      mkSess({ name: "a2", workingDir: "C:\\foo", command: "claude" }),
    ]);
    const { claude } = pickActiveFolderSessions(sessions, "c:/foo");
    expect(claude?.name).toBe("a1");
  });

  it("returns nulls when no sessions match", () => {
    const result = pickActiveFolderSessions(mkMap([]), "c:/foo");
    expect(result).toEqual({ claude: null, pwsh: null });
  });

  it("treats non-pwsh non-claude commands as claude bucket", () => {
    const sessions = mkMap([
      mkSess({ name: "a", workingDir: "C:\\foo", command: "bash" }),
    ]);
    const { claude, pwsh } = pickActiveFolderSessions(sessions, "c:/foo");
    expect(claude?.name).toBe("a");
    expect(pwsh).toBeNull();
  });

  it("accepts an Iterable (not just Map)", () => {
    const arr = [mkSess({ name: "a", workingDir: "C:\\foo", command: "claude" })];
    const { claude } = pickActiveFolderSessions(arr, "c:/foo");
    expect(claude?.name).toBe("a");
  });
});

describe("computeFolderStatus", () => {
  it("returns busy if any session is busy", () => {
    expect(computeFolderStatus(
      mkSess({ name: "a", workingDir: "/x", status: "idle" }),
      mkSess({ name: "b", workingDir: "/x", status: "busy" }),
    )).toEqual({ status: "busy", hasPermission: false });
  });

  it("returns starting if any session is starting and none busy", () => {
    expect(computeFolderStatus(
      mkSess({ name: "a", workingDir: "/x", status: "starting" }),
      null,
    )).toEqual({ status: "starting", hasPermission: false });
  });

  it("returns idle if at least one alive but none busy/starting", () => {
    expect(computeFolderStatus(
      mkSess({ name: "a", workingDir: "/x", status: "idle" }),
      null,
    )).toEqual({ status: "idle", hasPermission: false });
  });

  it("returns dead when no sessions", () => {
    expect(computeFolderStatus(null, null)).toEqual({ status: "dead", hasPermission: false });
  });

  it("propagates pendingPermission from either session", () => {
    expect(computeFolderStatus(
      mkSess({ name: "a", workingDir: "/x", pendingPermission: true }),
      null,
    ).hasPermission).toBe(true);
    expect(computeFolderStatus(
      null,
      mkSess({ name: "b", workingDir: "/x", pendingPermission: true }),
    ).hasPermission).toBe(true);
  });

  it("busy takes precedence over starting", () => {
    expect(computeFolderStatus(
      mkSess({ name: "a", workingDir: "/x", status: "starting" }),
      mkSess({ name: "b", workingDir: "/x", status: "busy" }),
    ).status).toBe("busy");
  });
});

describe("buildRowActionsOptions", () => {
  const killSession = vi.fn();
  beforeEach(() => { killSession.mockReset(); });

  it("prefers claude identity then cached, falls back to null", () => {
    expect(buildRowActionsOptions({
      claude: mkSess({ name: "a", workingDir: "/x", emcomIdentity: "alice" }),
      pwsh: null,
      cached: { identityName: "ignored" },
      folderPath: "/x",
      folderName: "x",
      killSession,
    }).identityName).toBe("alice");

    expect(buildRowActionsOptions({
      claude: null,
      pwsh: null,
      cached: { identityName: "bob" },
      folderPath: "/x",
      folderName: "x",
      killSession,
    }).identityName).toBe("bob");

    expect(buildRowActionsOptions({
      claude: null,
      pwsh: null,
      cached: null,
      folderPath: "/x",
      folderName: "x",
      killSession,
    }).identityName).toBeNull();
  });

  it("onKill calls killSession for each alive session", () => {
    const opts = buildRowActionsOptions({
      claude: mkSess({ name: "claude-a", workingDir: "/x" }),
      pwsh: mkSess({ name: "pwsh-b", workingDir: "/x" }),
      cached: null,
      folderPath: "/x",
      folderName: "x",
      killSession,
    });
    opts.onKill!();
    expect(killSession).toHaveBeenCalledWith("claude-a");
    expect(killSession).toHaveBeenCalledWith("pwsh-b");
  });

  it("onKill is null when no sessions alive", () => {
    expect(buildRowActionsOptions({
      claude: null, pwsh: null, cached: null,
      folderPath: "/x", folderName: "x", killSession,
    }).onKill).toBeNull();
  });

  it("passes unreadCount, claudeAlive, pwshAlive, command flags through", () => {
    const opts = buildRowActionsOptions({
      claude: mkSess({ name: "a", workingDir: "/x", command: "claude", unreadCount: 3 }),
      pwsh: null,
      cached: { isClaudeReady: true, hasIdentity: false },
      folderPath: "/x",
      folderName: "x",
      killSession,
    });
    expect(opts.unreadCount).toBe(3);
    expect(opts.claudeAlive).toBe(true);
    expect(opts.pwshAlive).toBe(false);
    expect(opts.claudeCommand).toBe("claude");
    expect(opts.isClaudeReady).toBe(true);
    expect(opts.hasIdentity).toBe(false);
  });
});

describe("applyFolderInfoToIndicators", () => {
  function buildHost(): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="indicator-slot">
        <span class="indicator claude-ready hidden-placeholder"></span>
        <span class="indicator identity hidden-placeholder"></span>
      </div>
    `;
    return host;
  }

  it("reveals + titles claude-ready indicator when isClaudeReady", () => {
    const host = buildHost();
    applyFolderInfoToIndicators(host, { isClaudeReady: true, hasIdentity: false });
    const indC = host.querySelector(".indicator.claude-ready") as HTMLElement;
    expect(indC.classList.contains("hidden-placeholder")).toBe(false);
    expect(indC.title).toBe("Has CLAUDE.md");
  });

  it("reveals + titles identity indicator with identityName", () => {
    const host = buildHost();
    applyFolderInfoToIndicators(host, { hasIdentity: true, identityName: "frost" });
    const indI = host.querySelector(".indicator.identity") as HTMLElement;
    expect(indI.classList.contains("hidden-placeholder")).toBe(false);
    expect(indI.title).toBe("Identity: frost");
  });

  it("uses 'yes' fallback when hasIdentity but no name", () => {
    const host = buildHost();
    applyFolderInfoToIndicators(host, { hasIdentity: true });
    const indI = host.querySelector(".indicator.identity") as HTMLElement;
    expect(indI.title).toBe("Identity: yes");
  });

  it("keeps hidden-placeholder when info falsy", () => {
    const host = buildHost();
    applyFolderInfoToIndicators(host, { isClaudeReady: false, hasIdentity: false });
    const indC = host.querySelector(".indicator.claude-ready") as HTMLElement;
    const indI = host.querySelector(".indicator.identity") as HTMLElement;
    expect(indC.classList.contains("hidden-placeholder")).toBe(true);
    expect(indI.classList.contains("hidden-placeholder")).toBe(true);
  });

  it("does nothing when no .indicator-slot present", () => {
    const host = document.createElement("div");
    expect(() => applyFolderInfoToIndicators(host, { isClaudeReady: true })).not.toThrow();
  });
});

describe("findActiveSessionForFolder", () => {
  it("returns first non-dead match by iteration order", () => {
    const sessions = mkMap([
      mkSess({ name: "dead", workingDir: "C:\\foo", status: "dead" }),
      mkSess({ name: "first-alive", workingDir: "C:\\foo" }),
      mkSess({ name: "second-alive", workingDir: "C:\\foo" }),
    ]);
    expect(findActiveSessionForFolder(sessions, "c:/foo")?.name).toBe("first-alive");
  });

  it("returns null when no match", () => {
    expect(findActiveSessionForFolder(mkMap([]), "c:/foo")).toBeNull();
  });
});

describe("buildQuickAccessRow", () => {
  function mkDeps(overrides: any = {}) {
    return {
      state: {
        sessions: mkMap([]),
        folderInfoCache: new Map(),
        pinnedFolders: [] as string[],
      },
      focusExistingSession: vi.fn(),
      openFolder: vi.fn(),
      appendRowActions: vi.fn(),
      killSession: vi.fn(),
      showContextMenu: vi.fn(),
      fetchFn: vi.fn().mockResolvedValue({ json: async () => ({}) }),
      ...overrides,
    };
  }

  it("constructs a row with status dot + name label", () => {
    const deps = mkDeps();
    const row = buildQuickAccessRow("C:\\projects\\foo", deps as any);
    expect(row.className).toBe("quick-access-row");
    const label = row.querySelector(".quick-access-name") as HTMLElement;
    expect(label.textContent).toBe("foo");
    const dot = row.querySelector(".status-dot") as HTMLElement;
    expect(dot.className).toContain("dead");
  });

  it("status dot reflects busy session", () => {
    const sessions = mkMap([mkSess({ name: "a", workingDir: "C:\\foo", status: "busy" })]);
    const row = buildQuickAccessRow("C:\\foo", mkDeps({
      state: { sessions, folderInfoCache: new Map(), pinnedFolders: [] },
    }) as any);
    const dot = row.querySelector(".status-dot") as HTMLElement;
    expect(dot.className).toContain("busy");
  });

  it("status dot is 'permission' when pendingPermission set", () => {
    const sessions = mkMap([
      mkSess({ name: "a", workingDir: "C:\\foo", status: "idle", pendingPermission: true }),
    ]);
    const row = buildQuickAccessRow("C:\\foo", mkDeps({
      state: { sessions, folderInfoCache: new Map(), pinnedFolders: [] },
    }) as any);
    const dot = row.querySelector(".status-dot") as HTMLElement;
    expect(dot.className).toContain("permission");
  });

  it("click on label focuses existing session", () => {
    const sessions = mkMap([mkSess({ name: "active-1", workingDir: "C:\\foo" })]);
    const deps = mkDeps({
      state: { sessions, folderInfoCache: new Map(), pinnedFolders: [] },
    });
    const row = buildQuickAccessRow("C:\\foo", deps as any);
    const label = row.querySelector(".quick-access-name") as HTMLElement;
    label.click();
    expect(deps.focusExistingSession).toHaveBeenCalledWith("active-1");
    expect(deps.openFolder).not.toHaveBeenCalled();
  });

  it("click on label opens folder when no session", () => {
    const deps = mkDeps();
    const row = buildQuickAccessRow("C:\\projects\\foo", deps as any);
    const label = row.querySelector(".quick-access-name") as HTMLElement;
    label.click();
    expect(deps.openFolder).toHaveBeenCalledWith("C:\\projects\\foo", "foo");
  });

  it("calls appendRowActions with built opts", () => {
    const sessions = mkMap([
      mkSess({ name: "a", workingDir: "C:\\foo", command: "claude", unreadCount: 2 }),
    ]);
    const deps = mkDeps({
      state: { sessions, folderInfoCache: new Map(), pinnedFolders: [] },
    });
    buildQuickAccessRow("C:\\foo", deps as any);
    expect(deps.appendRowActions).toHaveBeenCalledTimes(1);
    const opts = deps.appendRowActions.mock.calls[0][1];
    expect(opts.unreadCount).toBe(2);
    expect(opts.claudeAlive).toBe(true);
  });

  it("fetches folder-info when not cached, populates cache + applies indicators", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      json: async () => ({ isClaudeReady: true, hasIdentity: true, identityName: "moss" }),
    });
    const folderInfoCache = new Map();
    const deps = mkDeps({
      state: { sessions: mkMap([]), folderInfoCache, pinnedFolders: [] },
      fetchFn,
    });
    // appendRowActions must build the indicator-slot for applyFolderInfoToIndicators
    deps.appendRowActions = vi.fn((row: HTMLElement) => {
      const slot = document.createElement("div");
      slot.className = "indicator-slot";
      slot.innerHTML = `
        <span class="indicator claude-ready hidden-placeholder"></span>
        <span class="indicator identity hidden-placeholder"></span>
      `;
      row.appendChild(slot);
    });
    buildQuickAccessRow("C:\\foo", deps as any);
    expect(fetchFn).toHaveBeenCalledWith("/api/folder-info?path=C%3A%5Cfoo");
    await new Promise((r) => setTimeout(r, 0));
    expect(folderInfoCache.has("c:/foo")).toBe(true);
  });

  it("does not fetch when cached", () => {
    const fetchFn = vi.fn();
    const folderInfoCache = new Map([["c:/foo", { isClaudeReady: true }]]);
    const deps = mkDeps({
      state: { sessions: mkMap([]), folderInfoCache, pinnedFolders: [] },
      fetchFn,
    });
    buildQuickAccessRow("C:\\foo", deps as any);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("right-click delegates to showContextMenu", () => {
    const deps = mkDeps();
    const row = buildQuickAccessRow("C:\\foo", deps as any);
    const ev = new Event("contextmenu") as MouseEvent;
    row.dispatchEvent(ev);
    expect(deps.showContextMenu).toHaveBeenCalledWith(ev, "C:\\foo");
  });

  it("sets draggable + dragstart sets dataTransfer", () => {
    const deps = mkDeps();
    const row = buildQuickAccessRow("C:\\foo", deps as any);
    expect(row.draggable).toBe(true);
    const setData = vi.fn();
    const ev = new Event("dragstart") as any;
    ev.dataTransfer = { setData, effectAllowed: "" };
    row.dispatchEvent(ev);
    expect(setData).toHaveBeenCalledWith(
      "pty-win/folder",
      JSON.stringify({ workingDir: "C:\\foo", folderName: "foo" }),
    );
    expect(ev.dataTransfer.effectAllowed).toBe("copy");
  });

  it("dragstart no-ops when dataTransfer missing", () => {
    const deps = mkDeps();
    const row = buildQuickAccessRow("C:\\foo", deps as any);
    const ev = new Event("dragstart") as any;
    ev.dataTransfer = null;
    expect(() => row.dispatchEvent(ev)).not.toThrow();
  });
});

describe("renderQuickAccess", () => {
  function makeByIdReturning(panel: HTMLElement | null) {
    return (id: string) => (id === "quick-access-panel" ? panel : null);
  }

  it("no-ops when panel missing", () => {
    expect(() => renderQuickAccess({
      byId: makeByIdReturning(null),
      state: { pinnedFolders: ["x"], sessions: new Map(), folderInfoCache: new Map() },
      focusExistingSession: vi.fn(),
      openFolder: vi.fn(),
      appendRowActions: vi.fn(),
      killSession: vi.fn(),
      showContextMenu: vi.fn(),
    } as any)).not.toThrow();
  });

  it("clears panel content even when no pinned folders", () => {
    const panel = document.createElement("div");
    panel.innerHTML = "<span>stale</span>";
    renderQuickAccess({
      byId: makeByIdReturning(panel),
      state: { pinnedFolders: [], sessions: new Map(), folderInfoCache: new Map() },
      focusExistingSession: vi.fn(),
      openFolder: vi.fn(),
      appendRowActions: vi.fn(),
      killSession: vi.fn(),
      showContextMenu: vi.fn(),
    } as any);
    expect(panel.innerHTML).toBe("");
  });

  it("renders one row per pinned folder", () => {
    const panel = document.createElement("div");
    renderQuickAccess({
      byId: makeByIdReturning(panel),
      state: {
        pinnedFolders: ["C:\\foo", "C:\\bar"],
        sessions: new Map(),
        folderInfoCache: new Map([["c:/foo", {}], ["c:/bar", {}]]),
      },
      focusExistingSession: vi.fn(),
      openFolder: vi.fn(),
      appendRowActions: vi.fn(),
      killSession: vi.fn(),
      showContextMenu: vi.fn(),
    } as any);
    expect(panel.querySelectorAll(".quick-access-row").length).toBe(2);
  });
});
