// Dashboard panel runtime (Phase 3 of app.js modularization).
//
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDashboardPanel } from "../public/lib/dashboard-panel.js";

type SessionInfo = {
  status?: string;
  costUsd?: number;
  unreadCount?: number;
  emcomIdentity?: string;
};

beforeEach(() => {
  document.body.innerHTML = "";
});

function makeState(entries: Array<[string, SessionInfo]> = [], isDashboard = true) {
  return {
    sessions: new Map<string, SessionInfo>(entries),
    // Dashboard mode = no active workspace. Tests that need workspace mode
    // pass isDashboard=false; we mirror that into activeWorkspaceId.
    activeWorkspaceId: isDashboard ? null : "w-test",
  };
}

function makeArea(id = "workspace-area"): HTMLElement {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return el;
}

function makeStatsContainer(): HTMLElement {
  const el = document.createElement("div");
  el.id = "dashboard-stats";
  document.body.appendChild(el);
  return el;
}

function fakeFetch(map: Record<string, any>) {
  return vi.fn().mockImplementation((url: string, _opts?: any) => {
    for (const [pattern, body] of Object.entries(map)) {
      if (url.startsWith(pattern)) {
        return Promise.resolve({ json: () => Promise.resolve(body) });
      }
    }
    return Promise.reject(new Error("unexpected url " + url));
  });
}

function makeDeps(opts: {
  area?: HTMLElement;
  statsContainer?: HTMLElement | null;
  state?: ReturnType<typeof makeState>;
  fetchFn?: any;
  setIntervalFn?: any;
  clearIntervalFn?: any;
  storage?: any;
  onFocusSession?: any;
} = {}) {
  const area = opts.area ?? makeArea();
  return {
    state: opts.state ?? makeState([["a", { status: "idle", costUsd: 1.5 }]]),
    byId: (id: string) => (id === "workspace-area" ? area : null),
    fmtAgo: () => "",
    onFocusSession: opts.onFocusSession ?? (() => {}),
    fetchFn: opts.fetchFn ?? fakeFetch({
      "/api/sessions/": { lines: ["preview line"] },
      "/api/stats": [],
    }),
    setIntervalFn: opts.setIntervalFn ?? vi.fn().mockReturnValue(77),
    clearIntervalFn: opts.clearIntervalFn ?? vi.fn(),
    storage: opts.storage,
  };
}

describe("createDashboardPanel render", () => {
  it("renders empty-state when no sessions", () => {
    const area = makeArea();
    const panel = createDashboardPanel(makeDeps({ area, state: makeState([]) }));
    panel.render();
    expect(area.querySelector(".dashboard-empty")).not.toBeNull();
    expect(area.querySelector(".dashboard-empty")!.textContent).toContain("NO ACTIVE SESSIONS");
  });

  it("renders header summary with active/busy/total counts and total cost", () => {
    const area = makeArea();
    const state = makeState([
      ["a", { status: "idle", costUsd: 1.5 }],
      ["b", { status: "busy", costUsd: 0.5 }],
      ["c", { status: "dead", costUsd: 0 }],
    ]);
    createDashboardPanel(makeDeps({ area, state })).render();
    const header = area.querySelector(".dash-header") as HTMLElement;
    expect(header).not.toBeNull();
    // 2 alive (idle + busy), 1 busy, 3 total, total cost $2.00
    expect(header.innerHTML).toContain(">2</span> active");
    expect(header.innerHTML).toContain(">1</span> busy");
    expect(header.innerHTML).toContain(">3</span> total");
    expect(header.innerHTML).toContain("$2.00");
  });

  it("renders one card per session with correct status/cost/unread badge", () => {
    const area = makeArea();
    const state = makeState([
      ["alpha", { status: "idle", costUsd: 0.25, unreadCount: 3, emcomIdentity: "moss" }],
      ["beta", { status: "dead", costUsd: 0 }],
    ]);
    createDashboardPanel(makeDeps({ area, state })).render();
    const cards = area.querySelectorAll(".dashboard-card");
    expect(cards.length).toBe(2);
    const alpha = area.querySelector('.dashboard-card[data-session="alpha"]') as HTMLElement;
    expect(alpha.className).toContain("status-idle");
    expect(alpha.innerHTML).toContain("alpha");
    expect(alpha.innerHTML).toContain("@moss");
    expect(alpha.innerHTML).toContain("$0.25");
    expect(alpha.innerHTML).toContain(">3</span>");
    const badge = alpha.querySelector(".dashboard-card-badge") as HTMLElement;
    expect(badge.className).toContain("show");
  });

  it("loadSnapshot fetches preview text and writes it into the card", async () => {
    const area = makeArea();
    const fetchFn = fakeFetch({
      "/api/sessions/": { lines: ["line one", "line two"] },
    });
    const state = makeState([["a", { status: "idle" }]]);
    createDashboardPanel(makeDeps({ area, state, fetchFn })).render();
    await new Promise((r) => setTimeout(r, 10));
    const preview = area.querySelector('.dashboard-card[data-session="a"] .dashboard-card-preview');
    expect(preview!.textContent).toBe("line one\nline two");
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/sessions/a/snapshot?lines=8",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("card click invokes onFocusSession with the session name", () => {
    const area = makeArea();
    const onFocusSession = vi.fn();
    const state = makeState([["a", { status: "idle" }]]);
    createDashboardPanel(makeDeps({ area, state, onFocusSession })).render();
    const card = area.querySelector('.dashboard-card[data-session="a"]') as HTMLElement;
    card.click();
    expect(onFocusSession).toHaveBeenCalledWith("a");
  });

  it("second render with same sessions patches in place (does not rebuild)", () => {
    const area = makeArea();
    const state = makeState([["a", { status: "idle", costUsd: 1 }]]);
    const panel = createDashboardPanel(makeDeps({ area, state }));
    panel.render();
    const dashRef = area.querySelector(".dashboard");
    const cardRef = area.querySelector('.dashboard-card[data-session="a"]');
    state.sessions.set("a", { status: "busy", costUsd: 2 });
    panel.render();
    expect(area.querySelector(".dashboard")).toBe(dashRef);
    expect(area.querySelector('.dashboard-card[data-session="a"]')).toBe(cardRef);
  });

  it("patchDashboard adds new cards when sessions appear", () => {
    const area = makeArea();
    const state = makeState([["a", { status: "idle" }]]);
    const panel = createDashboardPanel(makeDeps({ area, state }));
    panel.render();
    state.sessions.set("b", { status: "busy" });
    panel.render();
    expect(area.querySelectorAll(".dashboard-card").length).toBe(2);
  });

  it("patchDashboard switches to empty placeholder when sessions clear", () => {
    const area = makeArea();
    const state = makeState([["a", { status: "idle" }]]);
    const panel = createDashboardPanel(makeDeps({ area, state }));
    panel.render();
    state.sessions.clear();
    panel.render();
    expect(area.querySelector(".dashboard-empty")).not.toBeNull();
  });

  it("re-renders structure when empty placeholder is present and sessions appear", () => {
    const area = makeArea();
    const state = makeState([]);
    const panel = createDashboardPanel(makeDeps({ area, state }));
    panel.render();
    expect(area.querySelector(".dashboard-empty")).not.toBeNull();
    state.sessions.set("a", { status: "idle" });
    panel.render();
    expect(area.querySelector(".dashboard-empty")).toBeNull();
    expect(area.querySelector('.dashboard-card[data-session="a"]')).not.toBeNull();
  });

  it("respects collapsed-cards storage preference on first render", () => {
    const area = makeArea();
    const storage = {
      getItem: vi.fn().mockReturnValue("true"),
      setItem: vi.fn(),
    };
    const state = makeState([["a", { status: "idle" }]]);
    createDashboardPanel(makeDeps({ area, state, storage })).render();
    const arrow = area.querySelector(".dash-cards-arrow") as HTMLElement;
    const grid = area.querySelector(".dash-cards") as HTMLElement;
    expect(arrow.textContent).toBe("\u25b8");
    expect(grid.style.display).toBe("none");
  });

  it("clicking cards header toggles collapsed state and writes storage", () => {
    const area = makeArea();
    const storage = {
      getItem: vi.fn().mockReturnValue("false"),
      setItem: vi.fn(),
    };
    const state = makeState([["a", { status: "idle" }]]);
    createDashboardPanel(makeDeps({ area, state, storage })).render();
    const cardsHeader = area.querySelector(".dash-cards-header") as HTMLElement;
    const grid = area.querySelector(".dash-cards") as HTMLElement;
    expect(grid.style.display).toBe("");
    cardsHeader.click();
    expect(grid.style.display).toBe("none");
    expect(storage.setItem).toHaveBeenCalledWith("pty-win-dash-cards-collapsed", "true");
    cardsHeader.click();
    expect(grid.style.display).toBe("");
    expect(storage.setItem).toHaveBeenLastCalledWith("pty-win-dash-cards-collapsed", "false");
  });

  it("does nothing when workspace-area is missing", () => {
    const panel = createDashboardPanel({
      state: makeState([["a", { status: "idle" }]]),
      byId: () => null,
      fmtAgo: () => "",
      onFocusSession: () => {},
    });
    expect(() => panel.render()).not.toThrow();
  });
});

describe("createDashboardPanel renderStats", () => {
  it("no-ops when state.isDashboard is false", async () => {
    const state = makeState([["a", { status: "idle" }]], false);
    const fetchFn = vi.fn();
    const panel = createDashboardPanel(makeDeps({ state, fetchFn }));
    await panel.renderStats();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("no-ops when #dashboard-stats container is absent", async () => {
    const state = makeState([["a", { status: "idle" }]]);
    const fetchFn = vi.fn();
    const panel = createDashboardPanel(makeDeps({ state, fetchFn }));
    await panel.renderStats();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("populates diag table when stats container is present and fetch succeeds", async () => {
    const container = makeStatsContainer();
    const state = makeState([["a", { status: "idle" }]]);
    const fetchFn = fakeFetch({
      "/api/stats": [{ name: "a", busy: { callbacksPerSec: 0 }, kbPerSec: 0 }],
    });
    const panel = createDashboardPanel(makeDeps({ state, fetchFn }));
    await panel.renderStats();
    expect(container.querySelector(".diag-table")).not.toBeNull();
    expect(container.querySelector("tbody")?.querySelectorAll("tr").length).toBeGreaterThan(0);
    container.remove();
  });

  it("a second renderStats call aborts the first in-flight fetch", async () => {
    const container = makeStatsContainer();
    let firstSignal: AbortSignal | undefined;
    let secondSignal: AbortSignal | undefined;
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation((_url: string, opts: any) => {
      callCount++;
      if (callCount === 1) firstSignal = opts.signal;
      else secondSignal = opts.signal;
      return new Promise((resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
        if (callCount === 2) {
          // Resolve the second to let render complete; first will be aborted.
          setTimeout(() => resolve({ json: () => Promise.resolve([]) }), 5);
        }
      });
    });
    const state = makeState([["a", { status: "idle" }]]);
    const panel = createDashboardPanel(makeDeps({ state, fetchFn }));
    const first = panel.renderStats();
    const second = panel.renderStats();
    await first;
    await second;
    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal?.aborted).toBe(false);
    container.remove();
  });
});

describe("createDashboardPanel lifecycle", () => {
  it("startPolling is idempotent (calls setInterval only once)", () => {
    const setIntervalFn = vi.fn().mockReturnValue(7);
    const panel = createDashboardPanel(makeDeps({ setIntervalFn }));
    panel.startPolling();
    panel.startPolling();
    expect(setIntervalFn).toHaveBeenCalledTimes(1);
  });

  it("stopPolling clears the interval and is idempotent", () => {
    const setIntervalFn = vi.fn().mockReturnValue(7);
    const clearIntervalFn = vi.fn();
    const panel = createDashboardPanel(makeDeps({ setIntervalFn, clearIntervalFn }));
    panel.startPolling();
    panel.stopPolling();
    panel.stopPolling();
    expect(clearIntervalFn).toHaveBeenCalledTimes(1);
    expect(clearIntervalFn).toHaveBeenCalledWith(7);
  });

  it("dispose aborts in-flight stats fetch and clears interval", async () => {
    makeStatsContainer();
    const setIntervalFn = vi.fn().mockReturnValue(99);
    const clearIntervalFn = vi.fn();
    let statsSignal: AbortSignal | undefined;
    const fetchFn = vi.fn().mockImplementation((_url: string, opts: any) => {
      statsSignal = opts.signal;
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    const panel = createDashboardPanel(makeDeps({ setIntervalFn, clearIntervalFn, fetchFn }));
    panel.startPolling();
    const p = panel.renderStats();
    panel.dispose();
    await expect(p).resolves.toBeUndefined();
    expect(statsSignal?.aborted).toBe(true);
    expect(clearIntervalFn).toHaveBeenCalledWith(99);
  });

  it("dispose aborts in-flight snapshot fetches", async () => {
    const area = makeArea();
    const snapshotSignals: AbortSignal[] = [];
    const fetchFn = vi.fn().mockImplementation((url: string, opts: any) => {
      if (url.startsWith("/api/sessions/")) {
        snapshotSignals.push(opts.signal);
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        });
      }
      return Promise.reject(new Error("unexpected"));
    });
    const state = makeState([
      ["a", { status: "idle" }],
      ["b", { status: "busy" }],
    ]);
    const panel = createDashboardPanel(makeDeps({ area, state, fetchFn }));
    panel.render();
    // Both cards should have started snapshot fetches.
    expect(snapshotSignals.length).toBe(2);
    panel.dispose();
    expect(snapshotSignals.every((s) => s.aborted)).toBe(true);
  });
});
