// Right-panel coordinator (tab switching + runtime bootstrap).
//
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initRightPanel } from "../public/lib/right-panel.js";

function setupDOM(): {
  feedTab: HTMLElement;
  trackerTab: HTMLElement;
  agentsTab: HTMLElement;
  feedContent: HTMLElement;
  trackerContent: HTMLElement;
  agentsContent: HTMLElement;
} {
  document.body.innerHTML = `
    <div id="right-panel-tabs">
      <button class="rp-tab active" data-panel="feed">Feed</button>
      <button class="rp-tab" data-panel="tracker">Tracker</button>
      <button class="rp-tab" data-panel="agents">Agents</button>
    </div>
    <div id="feed-content" class="active"></div>
    <div id="tracker-content"></div>
    <div id="agents-content"></div>
  `;
  return {
    feedTab: document.querySelector('.rp-tab[data-panel="feed"]') as HTMLElement,
    trackerTab: document.querySelector('.rp-tab[data-panel="tracker"]') as HTMLElement,
    agentsTab: document.querySelector('.rp-tab[data-panel="agents"]') as HTMLElement,
    feedContent: document.getElementById("feed-content")!,
    trackerContent: document.getElementById("tracker-content")!,
    agentsContent: document.getElementById("agents-content")!,
  };
}

function mkRuntime() {
  return {
    render: vi.fn().mockResolvedValue(undefined),
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("initRightPanel", () => {
  beforeEach(() => setupDOM());
  afterEach(() => { document.body.innerHTML = ""; });

  it("calls render() and startPolling() on both panels at init", () => {
    const tracker = mkRuntime();
    const agents = mkRuntime();
    initRightPanel({
      byId: (id) => document.getElementById(id),
      panels: { tracker, agents },
    });
    expect(tracker.render).toHaveBeenCalledTimes(1);
    expect(tracker.startPolling).toHaveBeenCalledTimes(1);
    expect(agents.render).toHaveBeenCalledTimes(1);
    expect(agents.startPolling).toHaveBeenCalledTimes(1);
  });

  it("clicking tracker tab activates content and triggers tracker render again", () => {
    const dom = setupDOM();
    const tracker = mkRuntime();
    const agents = mkRuntime();
    initRightPanel({
      byId: (id) => document.getElementById(id),
      panels: { tracker, agents },
    });
    expect(tracker.render).toHaveBeenCalledTimes(1);
    dom.trackerTab.click();
    expect(dom.trackerContent.classList.contains("active")).toBe(true);
    expect(dom.feedContent.classList.contains("active")).toBe(false);
    expect(dom.agentsContent.classList.contains("active")).toBe(false);
    expect(tracker.render).toHaveBeenCalledTimes(2);
    expect(agents.render).toHaveBeenCalledTimes(1);
  });

  it("clicking agents tab triggers agents render and toggles content", () => {
    const dom = setupDOM();
    const tracker = mkRuntime();
    const agents = mkRuntime();
    initRightPanel({
      byId: (id) => document.getElementById(id),
      panels: { tracker, agents },
    });
    dom.agentsTab.click();
    expect(dom.agentsContent.classList.contains("active")).toBe(true);
    expect(dom.trackerContent.classList.contains("active")).toBe(false);
    expect(agents.render).toHaveBeenCalledTimes(2);
  });

  it("clicking tracker tab removes any pre-existing .tracker-view", () => {
    const dom = setupDOM();
    const stale = document.createElement("div");
    stale.className = "tracker-view";
    stale.id = "stale-view";
    dom.trackerContent.appendChild(stale);
    const tracker = mkRuntime();
    const agents = mkRuntime();
    initRightPanel({
      byId: (id) => document.getElementById(id),
      panels: { tracker, agents },
    });
    dom.trackerTab.click();
    expect(document.getElementById("stale-view")).toBeNull();
  });

  it("clicking feed tab does NOT call tracker.render or agents.render", () => {
    const dom = setupDOM();
    const tracker = mkRuntime();
    const agents = mkRuntime();
    initRightPanel({
      byId: (id) => document.getElementById(id),
      panels: { tracker, agents },
    });
    const trackerCallsBefore = tracker.render.mock.calls.length;
    const agentsCallsBefore = agents.render.mock.calls.length;
    dom.feedTab.click();
    expect(dom.feedContent.classList.contains("active")).toBe(true);
    expect(tracker.render.mock.calls.length).toBe(trackerCallsBefore);
    expect(agents.render.mock.calls.length).toBe(agentsCallsBefore);
  });

  it("dispose() forwards to both panels", () => {
    const tracker = mkRuntime();
    const agents = mkRuntime();
    const ctl = initRightPanel({
      byId: (id) => document.getElementById(id),
      panels: { tracker, agents },
    });
    ctl.dispose();
    expect(tracker.dispose).toHaveBeenCalledTimes(1);
    expect(agents.dispose).toHaveBeenCalledTimes(1);
  });

  it("dispose() works when panel runtimes lack the optional dispose method", () => {
    const tracker: any = { render: vi.fn(), startPolling: vi.fn() };
    const agents: any = { render: vi.fn(), startPolling: vi.fn() };
    const ctl = initRightPanel({
      byId: (id) => document.getElementById(id),
      panels: { tracker, agents },
    });
    expect(() => ctl.dispose()).not.toThrow();
  });
});
