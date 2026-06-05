// Agents-panel helpers (Round 26 of lint extraction).
//
// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import {
  sessionNeedsInput,
  computeAgentsCounters,
  formatAgentsSummaryHtml,
  removeStaleAgentRows,
  findAgentRow,
  upsertAgentRow,
  upsertAgentTotalRow,
} from "../public/lib/agents-panel.js";

type SessionInfo = {
  status?: string;
  pendingPermission?: boolean;
  costUsd?: number;
  lastActiveMs?: number;
};
type StatsEntry = { busy: { callbacksPerSec: number } };

function makeTbody(rows: { name: string; html?: string }[] = []): HTMLTableSectionElement {
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.className = "agents-row";
    tr.dataset["session"] = r.name;
    tr.innerHTML = r.html ??
      `<td class="agents-name">${r.name}</td>` +
      `<td class="agents-status"></td>` +
      `<td class="agents-cbs"></td>` +
      `<td class="agents-active"></td>` +
      `<td class="agents-trend"></td>` +
      `<td class="agents-cost"></td>`;
    tbody.appendChild(tr);
  }
  return tbody;
}

describe("sessionNeedsInput", () => {
  it("returns false for dead sessions even when pendingPermission", () => {
    expect(sessionNeedsInput({ status: "dead", pendingPermission: true }, 0)).toBe(false);
  });

  it("returns true when pendingPermission is set on a live session", () => {
    expect(sessionNeedsInput({ status: "idle", pendingPermission: true }, 5)).toBe(true);
  });

  it("returns true when busy with 0 callbacks/sec", () => {
    expect(sessionNeedsInput({ status: "busy" }, 0)).toBe(true);
  });

  it("returns false when busy with nonzero callbacks/sec", () => {
    expect(sessionNeedsInput({ status: "busy" }, 3)).toBe(false);
  });

  it("returns false when idle with nonzero cbs and no pendingPermission", () => {
    expect(sessionNeedsInput({ status: "idle" }, 5)).toBe(false);
  });
});

describe("computeAgentsCounters", () => {
  it("returns zeros for empty input", () => {
    const out = computeAgentsCounters([], new Map());
    expect(out).toEqual({ busy: 0, idle: 0, needsInputCount: 0, totalCost: 0 });
  });

  it("counts busy, idle, and totalCost across sessions", () => {
    const sessions: Array<[string, SessionInfo]> = [
      ["a", { status: "busy", costUsd: 1.5 }],
      ["b", { status: "idle", costUsd: 0.25 }],
      ["c", { status: "busy", costUsd: 2 }],
      ["d", { status: "dead", costUsd: 99 }], // dead still counted in cost
    ];
    const statsMap = new Map<string, StatsEntry>([
      ["a", { busy: { callbacksPerSec: 5 } }],
      ["c", { busy: { callbacksPerSec: 3 } }],
    ]);
    const out = computeAgentsCounters(sessions, statsMap);
    expect(out.busy).toBe(2);
    expect(out.idle).toBe(1);
    expect(out.needsInputCount).toBe(0);
    expect(out.totalCost).toBeCloseTo(102.75);
  });

  it("counts needsInput across pendingPermission and busy+0cbs", () => {
    const sessions: Array<[string, SessionInfo]> = [
      ["a", { status: "idle", pendingPermission: true }],
      ["b", { status: "busy" }], // no stats => cbs=0 => needs input
      ["c", { status: "busy" }], // has stats with cbs=2 => does not need
      ["d", { status: "dead", pendingPermission: true }], // dead excluded
    ];
    const statsMap = new Map<string, StatsEntry>([
      ["c", { busy: { callbacksPerSec: 2 } }],
    ]);
    const out = computeAgentsCounters(sessions, statsMap);
    expect(out.needsInputCount).toBe(2);
  });

  it("treats undefined costUsd as zero", () => {
    const sessions: Array<[string, SessionInfo]> = [["a", { status: "idle" }]];
    const out = computeAgentsCounters(sessions, new Map());
    expect(out.totalCost).toBe(0);
  });
});

describe("formatAgentsSummaryHtml", () => {
  it("renders without 'need input' span when count is 0", () => {
    const html = formatAgentsSummaryHtml({ busy: 1, idle: 2, needsInputCount: 0, totalCost: 0.5 });
    expect(html).toBe("1 busy · 2 idle · $0.50");
  });

  it("renders the 'need input' span when count > 0", () => {
    const html = formatAgentsSummaryHtml({ busy: 1, idle: 2, needsInputCount: 3, totalCost: 4 });
    expect(html).toContain(`<span class="agents-needs-input-count">3 need input</span>`);
    expect(html).toContain("1 busy · 2 idle");
    expect(html).toContain("$4.00");
  });

  it("formats totalCost to 2 decimals", () => {
    const html = formatAgentsSummaryHtml({ busy: 0, idle: 0, needsInputCount: 0, totalCost: 12.345 });
    expect(html).toContain("$12.35");
  });
});

describe("removeStaleAgentRows", () => {
  it("removes rows whose session is not in currentNames", () => {
    const tbody = makeTbody([{ name: "alice" }, { name: "bob" }, { name: "charlie" }]);
    removeStaleAgentRows(tbody, new Set(["alice", "charlie"]));
    const remaining = [...tbody.querySelectorAll(".agents-row")].map(
      r => (r as HTMLElement).dataset["session"]
    );
    expect(remaining).toEqual(["alice", "charlie"]);
  });

  it("removes a row with empty data-session attribute", () => {
    const tbody = document.createElement("tbody");
    const tr = document.createElement("tr");
    tr.className = "agents-row";
    tbody.appendChild(tr);
    removeStaleAgentRows(tbody, new Set(["x"]));
    expect(tbody.querySelectorAll(".agents-row").length).toBe(0);
  });

  it("is a no-op when all rows are current", () => {
    const tbody = makeTbody([{ name: "a" }, { name: "b" }]);
    removeStaleAgentRows(tbody, new Set(["a", "b"]));
    expect(tbody.querySelectorAll(".agents-row").length).toBe(2);
  });
});

describe("findAgentRow", () => {
  it("returns the row matching name", () => {
    const tbody = makeTbody([{ name: "a" }, { name: "b" }]);
    const row = findAgentRow(tbody, "b");
    expect(row).not.toBeNull();
    expect(row?.dataset["session"]).toBe("b");
  });

  it("returns null when no row matches", () => {
    const tbody = makeTbody([{ name: "a" }]);
    expect(findAgentRow(tbody, "z")).toBeNull();
  });

  it("handles names containing special selector characters", () => {
    const tbody = makeTbody([{ name: 'weird"name[2]' }]);
    expect(findAgentRow(tbody, 'weird"name[2]')).not.toBeNull();
  });
});

describe("upsertAgentRow", () => {
  const deps = {
    onFocusSession: () => {},
    fmtAgo: (ms: number | undefined) => `${ms ?? 0}ms`,
  };

  it("creates a new row when one doesn't exist", () => {
    const tbody = makeTbody();
    upsertAgentRow(tbody, "alice", { status: "idle", costUsd: 1.25, lastActiveMs: 1000 }, undefined, deps);
    const row = findAgentRow(tbody, "alice");
    expect(row).not.toBeNull();
    expect(row?.className).toBe("agents-row ");
    expect(row?.children[0].textContent).toBe("alice");
    expect(row?.children[1].textContent).toBe("idle");
    expect(row?.children[2].textContent).toBe("0");
    expect(row?.children[3].textContent).toBe("1000ms");
    expect(row?.children[5].textContent).toBe("$1.25");
  });

  it("attaches onclick that calls onFocusSession with the row's name", () => {
    const tbody = makeTbody();
    const spy = vi.fn();
    upsertAgentRow(tbody, "alice", { status: "idle" }, undefined, {
      onFocusSession: spy,
      fmtAgo: () => "",
    });
    const row = findAgentRow(tbody, "alice");
    row?.click();
    expect(spy).toHaveBeenCalledWith("alice");
  });

  it("inserts new row above the total row when one exists", () => {
    const tbody = makeTbody([{ name: "alice" }]);
    const total = document.createElement("tr");
    total.className = "agents-total-row";
    tbody.appendChild(total);

    upsertAgentRow(tbody, "bob", { status: "idle" }, undefined, deps);
    const rows = [...tbody.children];
    const totalIdx = rows.indexOf(total);
    const bobRow = findAgentRow(tbody, "bob")!;
    const bobIdx = rows.indexOf(bobRow);
    expect(bobIdx).toBeLessThan(totalIdx);
  });

  it("patches existing row in place (doesn't replace)", () => {
    const tbody = makeTbody([{ name: "alice" }]);
    const before = findAgentRow(tbody, "alice");
    upsertAgentRow(tbody, "alice", { status: "busy", costUsd: 5 }, { busy: { callbacksPerSec: 3 } }, deps);
    const after = findAgentRow(tbody, "alice");
    expect(after).toBe(before);
    expect(after?.children[1].textContent).toBe("busy");
    expect(after?.children[2].textContent).toBe("3");
    expect(after?.children[5].textContent).toBe("$5.00");
  });

  it("flags needs-input row when busy with 0 cbs", () => {
    const tbody = makeTbody();
    upsertAgentRow(tbody, "a", { status: "busy" }, undefined, deps);
    const row = findAgentRow(tbody, "a");
    expect(row?.classList.contains("agents-needs-input")).toBe(true);
    expect(row?.children[1].textContent).toBe("needs input");
    expect((row?.children[1] as HTMLElement).className).toContain("status-needs-input");
  });

  it("does not rewrite cell text when value unchanged (perf optimisation)", () => {
    const tbody = makeTbody();
    upsertAgentRow(tbody, "a", { status: "idle", costUsd: 0, lastActiveMs: 100 }, undefined, deps);
    const cell = findAgentRow(tbody, "a")!.children[0] as HTMLElement;
    const originalNode = cell.firstChild;
    upsertAgentRow(tbody, "a", { status: "idle", costUsd: 0, lastActiveMs: 100 }, undefined, deps);
    expect(cell.firstChild).toBe(originalNode);
  });

  it("uses stats cbs when stats are provided", () => {
    const tbody = makeTbody();
    upsertAgentRow(tbody, "a", { status: "busy" }, { busy: { callbacksPerSec: 7 } }, deps);
    const row = findAgentRow(tbody, "a");
    expect(row?.children[2].textContent).toBe("7");
    expect(row?.classList.contains("agents-needs-input")).toBe(false);
  });
});

describe("upsertAgentTotalRow", () => {
  it("creates total row when totalCost > 0 and none exists", () => {
    const tbody = makeTbody();
    upsertAgentTotalRow(tbody, 4.5);
    const total = tbody.querySelector(".agents-total-row");
    expect(total).not.toBeNull();
    expect(total?.querySelector(".agents-cost")?.textContent).toBe("$4.50");
  });

  it("patches existing total row instead of recreating", () => {
    const tbody = makeTbody();
    upsertAgentTotalRow(tbody, 1);
    const before = tbody.querySelector(".agents-total-row");
    upsertAgentTotalRow(tbody, 2.5);
    const after = tbody.querySelector(".agents-total-row");
    expect(after).toBe(before);
    expect(after?.querySelector(".agents-cost")?.textContent).toBe("$2.50");
  });

  it("removes total row when totalCost is 0 and row exists", () => {
    const tbody = makeTbody();
    upsertAgentTotalRow(tbody, 1);
    expect(tbody.querySelector(".agents-total-row")).not.toBeNull();
    upsertAgentTotalRow(tbody, 0);
    expect(tbody.querySelector(".agents-total-row")).toBeNull();
  });

  it("is a no-op when totalCost is 0 and no row exists", () => {
    const tbody = makeTbody();
    upsertAgentTotalRow(tbody, 0);
    expect(tbody.querySelector(".agents-total-row")).toBeNull();
  });

  it("does not rewrite total cost text when value unchanged", () => {
    const tbody = makeTbody();
    upsertAgentTotalRow(tbody, 3);
    const cell = tbody.querySelector(".agents-cost")!;
    const originalNode = cell.firstChild;
    upsertAgentTotalRow(tbody, 3);
    expect(cell.firstChild).toBe(originalNode);
  });
});

import {
  computeCostSeries,
  drawSparkline,
  paintSparklines,
  renderAgentsPanel,
  createAgentsPanel,
} from "../public/lib/agents-panel.js";

describe("computeCostSeries", () => {
  it("returns empty series for null, empty, or single-sample input", () => {
    expect(computeCostSeries(null).totalSeries).toEqual([]);
    expect(computeCostSeries(undefined as any).sessionSeries.size).toBe(0);
    expect(computeCostSeries([]).totalSeries).toEqual([]);
    expect(computeCostSeries([{ sessions: { a: 1 } }]).totalSeries).toEqual([]);
  });

  it("extracts per-session and total time series", () => {
    const { sessionSeries, totalSeries } = computeCostSeries([
      { sessions: { a: 1, b: 2 } },
      { sessions: { a: 3, b: 4 } },
      { sessions: { a: 5, b: 6 } },
    ]);
    expect(sessionSeries.get("a")).toEqual([1, 3, 5]);
    expect(sessionSeries.get("b")).toEqual([2, 4, 6]);
    expect(totalSeries).toEqual([3, 7, 11]);
  });

  it("treats missing/non-numeric costs as 0 and tolerates absent sessions key", () => {
    const { sessionSeries, totalSeries } = computeCostSeries([
      { sessions: { a: 1 } } as any,
      { sessions: { a: "oops" } } as any,
      {} as any,
    ]);
    expect(sessionSeries.get("a")).toEqual([1, 0]);
    expect(totalSeries).toEqual([1, 0, 0]);
  });
});

describe("drawSparkline", () => {
  it("does nothing for fewer than 2 points", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 14;
    const ctx = { clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), strokeStyle: "", lineWidth: 0 };
    canvas.getContext = vi.fn().mockReturnValue(ctx);
    drawSparkline(canvas, [5]);
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it("clears the canvas and strokes the line for >=2 points", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 14;
    const ctx = { clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), strokeStyle: "", lineWidth: 0 };
    canvas.getContext = vi.fn().mockReturnValue(ctx);
    drawSparkline(canvas, [1, 2, 3]);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 50, 14);
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.lineTo).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it("handles constant series without dividing by zero", () => {
    const canvas = document.createElement("canvas");
    const ctx = { clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), strokeStyle: "", lineWidth: 0 };
    canvas.getContext = vi.fn().mockReturnValue(ctx);
    expect(() => drawSparkline(canvas, [4, 4, 4])).not.toThrow();
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});

describe("paintSparklines", () => {
  function makePanelWithRows(names: string[]): HTMLElement {
    const panel = document.createElement("div");
    panel.innerHTML =
      `<table><tbody>` +
      names.map(n =>
        `<tr class="agents-row" data-session="${n}">` +
        `<td class="agents-name">${n}</td>` +
        `<td class="agents-status"></td>` +
        `<td class="agents-cbs"></td>` +
        `<td class="agents-active"></td>` +
        `<td class="agents-trend"></td>` +
        `<td class="agents-cost"></td>` +
        `</tr>`
      ).join("") +
      `<tr class="agents-total-row"><td colspan="5">Total</td><td class="agents-cost">$0.00</td></tr>` +
      `</tbody></table>`;
    return panel;
  }

  it("creates one canvas per series and rebuilds total row to add trend cell", () => {
    const panel = makePanelWithRows(["alpha", "beta"]);
    paintSparklines(panel, {
      sessionSeries: new Map([["alpha", [1, 2, 3]], ["beta", [4, 5, 6]]]),
      totalSeries: [5, 7, 9],
    });
    const canvases = panel.querySelectorAll("canvas.agents-sparkline");
    expect(canvases.length).toBe(3);
    const totalRow = panel.querySelector(".agents-total-row")!;
    expect(totalRow.querySelector(".agents-trend")).not.toBeNull();
  });

  it("skips rows whose session names are not in the table", () => {
    const panel = makePanelWithRows(["alpha"]);
    paintSparklines(panel, {
      sessionSeries: new Map([["alpha", [1, 2]], ["ghost", [9, 9]]]),
      totalSeries: [],
    });
    expect(panel.querySelectorAll("canvas.agents-sparkline").length).toBe(1);
  });

  it("tolerates session names with quotes (no CSS.escape required)", () => {
    const tricky = `weird"name`;
    const panel = document.createElement("div");
    panel.innerHTML = `<table><tbody></tbody></table>`;
    const tbody = panel.querySelector("tbody")!;
    const tr = document.createElement("tr");
    tr.className = "agents-row";
    tr.dataset["session"] = tricky;
    tr.innerHTML =
      `<td class="agents-name"></td>` +
      `<td class="agents-status"></td>` +
      `<td class="agents-cbs"></td>` +
      `<td class="agents-active"></td>` +
      `<td class="agents-trend"></td>` +
      `<td class="agents-cost"></td>`;
    tbody.appendChild(tr);

    expect(() => paintSparklines(panel, {
      sessionSeries: new Map([[tricky, [1, 2]]]),
      totalSeries: [],
    })).not.toThrow();
    expect(panel.querySelectorAll("canvas.agents-sparkline").length).toBe(1);
  });
});

describe("renderAgentsPanel", () => {
  function makeArea(): HTMLElement {
    const area = document.createElement("div");
    document.body.appendChild(area);
    return area;
  }

  it("renders empty state when no sessions", async () => {
    const area = makeArea();
    await renderAgentsPanel(area, {
      state: { sessions: new Map() },
      fmtAgo: () => "",
      onFocusSession: () => {},
      fetchFn: vi.fn(),
    });
    expect(area.querySelector(".agents-empty")?.textContent).toContain("No active sessions");
  });

  it("populates rows from /api/stats and sparklines from /api/cost-history", async () => {
    const area = makeArea();
    const state = {
      sessions: new Map<string, any>([
        ["alpha", { status: "idle", costUsd: 1.5 }],
        ["beta", { status: "busy", costUsd: 0.75 }],
      ]),
    };
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/stats") {
        return Promise.resolve({ json: () => Promise.resolve([
          { name: "alpha", busy: { callbacksPerSec: 0 } },
          { name: "beta", busy: { callbacksPerSec: 3 } },
        ]) });
      }
      if (url === "/api/cost-history") {
        return Promise.resolve({ json: () => Promise.resolve([
          { sessions: { alpha: 1, beta: 0.5 } },
          { sessions: { alpha: 1.5, beta: 0.75 } },
        ]) });
      }
      return Promise.reject(new Error("unexpected url " + url));
    });

    await renderAgentsPanel(area, {
      state,
      fmtAgo: () => "—",
      onFocusSession: () => {},
      fetchFn: fetchFn as any,
    });

    expect(area.querySelectorAll(".agents-row").length).toBe(2);
    expect(area.querySelector(".agents-total-row")).not.toBeNull();
  });

  it("aborts cleanly when its signal is aborted mid-flight", async () => {
    const area = makeArea();
    const ctl = new AbortController();
    const fetchFn = vi.fn().mockImplementation((_url: string, opts: any) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    const p = renderAgentsPanel(area, {
      state: { sessions: new Map([["a", { status: "idle" }]]) },
      fmtAgo: () => "",
      onFocusSession: () => {},
      fetchFn: fetchFn as any,
      signal: ctl.signal,
    });
    ctl.abort();
    await expect(p).resolves.toBeUndefined();
  });
});

describe("createAgentsPanel lifecycle", () => {
  function makeDeps(area: HTMLElement) {
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/stats") return Promise.resolve({ json: () => Promise.resolve([]) });
      if (url === "/api/cost-history") return Promise.resolve({ json: () => Promise.resolve([]) });
      return Promise.reject(new Error("unexpected url " + url));
    });
    const setIntervalFn = vi.fn().mockReturnValue(123);
    const clearIntervalFn = vi.fn();
    return {
      state: { sessions: new Map([["a", { status: "idle" }]]) },
      byId: (id: string) => (id === "agents-content" ? area : null),
      fmtAgo: () => "",
      onFocusSession: () => {},
      fetchFn: fetchFn as any,
      setIntervalFn: setIntervalFn as any,
      clearIntervalFn: clearIntervalFn as any,
      pollMs: 5000,
    };
  }

  it("startPolling registers exactly one interval; calling twice does not duplicate", () => {
    const area = document.createElement("div");
    document.body.appendChild(area);
    const deps = makeDeps(area);
    const panel = createAgentsPanel(deps);
    panel.startPolling();
    panel.startPolling();
    expect(deps.setIntervalFn).toHaveBeenCalledTimes(1);
  });

  it("stopPolling clears the interval and is idempotent", () => {
    const area = document.createElement("div");
    document.body.appendChild(area);
    const deps = makeDeps(area);
    const panel = createAgentsPanel(deps);
    panel.startPolling();
    panel.stopPolling();
    panel.stopPolling();
    expect(deps.clearIntervalFn).toHaveBeenCalledTimes(1);
    expect(deps.clearIntervalFn).toHaveBeenCalledWith(123);
  });

  it("dispose aborts inflight render and clears interval", async () => {
    const area = document.createElement("div");
    document.body.appendChild(area);
    let stallReject: ((e: Error) => void) | null = null;
    const fetchFn = vi.fn().mockImplementation((_url: string, opts: any) => {
      return new Promise((_resolve, reject) => {
        stallReject = reject;
        opts.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    const panel = createAgentsPanel({
      state: { sessions: new Map([["a", { status: "idle" }]]) },
      byId: (id: string) => (id === "agents-content" ? area : null),
      fmtAgo: () => "",
      onFocusSession: () => {},
      fetchFn: fetchFn as any,
      setIntervalFn: ((_fn: any, _ms: number) => 9 as any) as any,
      clearIntervalFn: vi.fn() as any,
    });
    panel.startPolling();
    const p = panel.render();
    panel.dispose();
    await expect(p).resolves.toBeUndefined();
    expect(stallReject).not.toBeNull();
  });

  it("a second render call aborts the earlier inflight render", async () => {
    const area = document.createElement("div");
    document.body.appendChild(area);
    const fetchFn = vi.fn().mockImplementation((_url: string, opts: any) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    const panel = createAgentsPanel({
      state: { sessions: new Map([["a", { status: "idle" }]]) },
      byId: (id: string) => (id === "agents-content" ? area : null),
      fmtAgo: () => "",
      onFocusSession: () => {},
      fetchFn: fetchFn as any,
    });
    const first = panel.render();
    const second = panel.render();
    await expect(first).resolves.toBeUndefined();
    // Abort the second one too so the test does not hang on cleanup.
    panel.dispose();
    await expect(second).resolves.toBeUndefined();
  });
});
