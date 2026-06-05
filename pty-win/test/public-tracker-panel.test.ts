// Tracker-panel runtime (extracted from app.js).
//
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTrackerPanel } from "../public/lib/tracker-panel.js";

type Deps = Parameters<typeof createTrackerPanel>[0];

function makeStorage(): Storage {
  const data: Record<string, string> = {};
  const store = {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = String(v); },
    removeItem: (k: string) => { delete data[k]; },
    clear: () => { for (const k of Object.keys(data)) delete data[k]; },
    key: (i: number) => Object.keys(data)[i] ?? null,
    get length() { return Object.keys(data).length; },
  };
  return store as Storage;
}

function mkContainer(id: string): HTMLElement {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return el;
}

function setupDOM(): { trackerArea: HTMLElement; badge: HTMLElement } {
  document.body.innerHTML = "";
  const trackerArea = mkContainer("tracker-content");
  const badge = mkContainer("tracker-tab-badge");
  // tracker chrome creates filter selects inside its own DOM, but byId looks
  // them up by id at the document level. We pre-create empty selects so the
  // populateFilters branch can find them.
  const repoSel = document.createElement("select");
  repoSel.id = "tracker-filter-repo";
  const opt = document.createElement("option"); opt.textContent = "all repos"; repoSel.appendChild(opt);
  document.body.appendChild(repoSel);
  const assigneeSel = document.createElement("select");
  assigneeSel.id = "tracker-filter-assignee";
  const opt2 = document.createElement("option"); opt2.textContent = "all assignees"; assigneeSel.appendChild(opt2);
  document.body.appendChild(assigneeSel);
  const sevSel = document.createElement("select");
  sevSel.id = "tracker-filter-sev";
  const opt3 = document.createElement("option"); opt3.textContent = "all"; sevSel.appendChild(opt3);
  document.body.appendChild(sevSel);
  return { trackerArea, badge };
}

function mkDeps(overrides: Partial<Deps> = {}): Deps {
  const storage = makeStorage();
  return {
    byId: (id: string) => document.getElementById(id),
    state: { trackerItems: [], trackerDecisionCount: 0 },
    fetchFn: vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) }) as any,
    setIntervalFn: vi.fn().mockReturnValue(42) as any,
    clearIntervalFn: vi.fn() as any,
    storage,
    ...overrides,
  };
}

describe("createTrackerPanel - basic render", () => {
  beforeEach(() => setupDOM());
  afterEach(() => { document.body.innerHTML = ""; });

  it("renders the tracker chrome on first call", async () => {
    const deps = mkDeps();
    const panel = createTrackerPanel(deps);
    await panel.render();
    expect(document.querySelector(".tracker-view")).not.toBeNull();
    expect(deps.fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not re-wire controls on subsequent renders", async () => {
    const deps = mkDeps();
    const panel = createTrackerPanel(deps);
    await panel.render();
    await panel.render();
    const view = document.querySelector(".tracker-view") as HTMLElement;
    expect(view?.dataset["wired"]).toBe("1");
  });

  it("populates state.trackerItems from the fetch response", async () => {
    const items = [{ id: "i1", status: "decision-pending", title: "x" }];
    const deps = mkDeps({
      fetchFn: vi.fn().mockResolvedValue({ json: () => Promise.resolve(items) }) as any,
    });
    const panel = createTrackerPanel(deps);
    await panel.render();
    expect(deps.state.trackerItems).toEqual(items);
  });

  it("sets the badge count from decisionPending and toggles hidden", async () => {
    const items = [
      { id: "a", status: "decision-pending" },
      { id: "b", status: "decision-pending" },
      { id: "c", status: "implementing" },
    ];
    const deps = mkDeps({
      fetchFn: vi.fn().mockResolvedValue({ json: () => Promise.resolve(items) }) as any,
    });
    const panel = createTrackerPanel(deps);
    await panel.render();
    const badge = document.getElementById("tracker-tab-badge")!;
    expect(badge.textContent).toContain("(2)");
    expect(badge.classList.contains("hidden")).toBe(false);
  });

  it("renders error message on fetch failure", async () => {
    const deps = mkDeps({
      fetchFn: vi.fn().mockRejectedValue(new Error("boom")) as any,
    });
    const panel = createTrackerPanel(deps);
    await panel.render();
    const body = document.querySelector(".tracker-body");
    expect(body?.innerHTML).toContain("CONNECTION FAILED");
  });

  it("appends ?status=open by default and omits it when show-closed is true", async () => {
    const storage = makeStorage();
    const fetchFn = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) });
    const deps = mkDeps({ storage, fetchFn: fetchFn as any });
    const panel = createTrackerPanel(deps);
    await panel.render();
    expect(fetchFn.mock.calls[0][0]).toContain("?status=open");
    storage.setItem("pty-win-tracker-show-closed", "true");
    await panel.render();
    expect(fetchFn.mock.calls[1][0]).not.toContain("?status=open");
  });
});

describe("createTrackerPanel - lifecycle", () => {
  beforeEach(() => setupDOM());
  afterEach(() => { document.body.innerHTML = ""; });

  it("startPolling registers exactly one interval (idempotent)", () => {
    const deps = mkDeps();
    const panel = createTrackerPanel(deps);
    panel.startPolling();
    panel.startPolling();
    expect(deps.setIntervalFn).toHaveBeenCalledTimes(1);
  });

  it("stopPolling clears the interval and is idempotent", () => {
    const deps = mkDeps();
    const panel = createTrackerPanel(deps);
    panel.startPolling();
    panel.stopPolling();
    panel.stopPolling();
    expect(deps.clearIntervalFn).toHaveBeenCalledTimes(1);
    expect(deps.clearIntervalFn).toHaveBeenCalledWith(42);
  });

  it("dispose aborts inflight fetch and clears interval", async () => {
    let abortedFromRender = false;
    const fetchFn = vi.fn().mockImplementation((_url: string, opts: any) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          abortedFromRender = true;
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    const deps = mkDeps({ fetchFn: fetchFn as any });
    const panel = createTrackerPanel(deps);
    panel.startPolling();
    const p = panel.render();
    panel.dispose();
    await expect(p).resolves.toBeUndefined();
    expect(abortedFromRender).toBe(true);
    expect(deps.clearIntervalFn).toHaveBeenCalled();
  });

  it("a second render call aborts the earlier inflight render", async () => {
    const fetchFn = vi.fn().mockImplementation((_url: string, opts: any) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    const deps = mkDeps({ fetchFn: fetchFn as any });
    const panel = createTrackerPanel(deps);
    const first = panel.render();
    const second = panel.render();
    await expect(first).resolves.toBeUndefined();
    panel.dispose();
    await expect(second).resolves.toBeUndefined();
  });
});

describe("createTrackerPanel - controls and storage", () => {
  beforeEach(() => setupDOM());
  afterEach(() => { document.body.innerHTML = ""; });

  it("refresh button triggers a new render", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) });
    const deps = mkDeps({ fetchFn: fetchFn as any });
    const panel = createTrackerPanel(deps);
    await panel.render();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const btn = document.getElementById("tracker-refresh-btn");
    btn?.click();
    // give the microtask a chance to enqueue the next fetch
    await Promise.resolve();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("closed toggle persists to storage and re-renders", async () => {
    const storage = makeStorage();
    const fetchFn = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) });
    const deps = mkDeps({ storage, fetchFn: fetchFn as any });
    const panel = createTrackerPanel(deps);
    await panel.render();
    const toggle = document.getElementById("tracker-closed-toggle") as HTMLInputElement;
    toggle.checked = true;
    toggle.onchange?.(new Event("change"));
    expect(storage.getItem("pty-win-tracker-show-closed")).toBe("true");
  });
});
