// @vitest-environment happy-dom
//
// Tests for the lib/feed-panel.js extraction (was the initFeedPanel
// IIFE in app.js). Pure helpers (getSenderColor, fmtFeedTime) get
// focused coverage. initFeedPanel itself gets a smoke test verifying
// that wiring up against a stubbed DOM does not throw and registers
// the expected event listeners.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SENDER_PALETTE,
  getSenderColor,
  fmtFeedTime,
  initFeedPanel,
} from "../public/lib/feed-panel.js";

describe("getSenderColor", () => {
  it("returns a color from SENDER_PALETTE", () => {
    expect(SENDER_PALETTE).toContain(getSenderColor("moss"));
    expect(SENDER_PALETTE).toContain(getSenderColor("forge"));
    expect(SENDER_PALETTE).toContain(getSenderColor(""));
  });

  it("is deterministic -- same name always returns same color", () => {
    const c1 = getSenderColor("rajan");
    const c2 = getSenderColor("rajan");
    expect(c1).toBe(c2);
  });

  it("distributes across the palette for varied input", () => {
    const colors = new Set();
    const names = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
    for (const n of names) colors.add(getSenderColor(n));
    // 16 distinct names should hit at least 4 different colors with a
    // 12-color palette + the hash function -- guard against a constant
    // regression (everyone-gets-the-same-color bug).
    expect(colors.size).toBeGreaterThanOrEqual(4);
  });
});

describe("fmtFeedTime", () => {
  it("formats an ISO timestamp as MM/DD HH:MM", () => {
    const result = fmtFeedTime("2026-06-01T09:05:00");
    expect(result).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  it("zero-pads single-digit values", () => {
    // Local-time construction to avoid TZ-dependent flake.
    const d = new Date(2026, 0, 5, 7, 3); // Jan 5, 7:03
    const result = fmtFeedTime(d.toISOString());
    expect(result).toBe("01/05 07:03");
  });
});

// --- initFeedPanel smoke test ------------------------------------
//
// Build a minimal DOM with the elements the panel queries by id,
// stub fetch + setInterval, then call initFeedPanel. The success
// criterion is "doesn't throw and registers listeners on the
// resize/collapse/expand controls."

const FEED_DOM_IDS = [
  "feed-panel", "feed-strip", "feed-body",
  "feed-collapse-btn", "feed-expand-btn", "feed-title",
  "feed-unread-badge", "feed-strip-badge", "feed-identity-badge",
  "feed-expand-all", "feed-collapse-all",
  "feed-resize-handle",
];

const FEED_INPUT_IDS = ["feed-search"];
const FEED_SELECT_IDS = ["feed-sender-filter"];
const FEED_BUTTON_IDS = ["feed-sort-btn", "feed-threads-btn"];

function setupFeedDom() {
  document.body.innerHTML = "";
  for (const id of FEED_DOM_IDS) {
    const el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
  }
  for (const id of FEED_INPUT_IDS) {
    const el = document.createElement("input");
    el.id = id;
    document.body.appendChild(el);
  }
  for (const id of FEED_SELECT_IDS) {
    const el = document.createElement("select");
    el.id = id;
    document.body.appendChild(el);
  }
  for (const id of FEED_BUTTON_IDS) {
    const el = document.createElement("button");
    el.id = id;
    document.body.appendChild(el);
  }
}

describe("initFeedPanel (smoke)", () => {
  beforeEach(() => {
    setupFeedDom();
    // Stub fetch -- panel issues a fetch on init when identity is set.
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("[]", { status: 200 }))));
    // Stub setInterval to avoid leaking timers between tests.
    vi.stubGlobal("setInterval", vi.fn(() => 0));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function makeDeps() {
    return {
      byId: (id: string) => {
        const el = document.getElementById(id);
        if (!el) throw new Error(`Element #${id} not found`);
        return el as HTMLElement;
      },
      inputById: (id: string) => document.getElementById(id) as HTMLInputElement,
      selectById: (id: string) => document.getElementById(id) as HTMLSelectElement,
      state: {
        terminals: new Map<string, unknown>(),
        workspaces: [],
        activeWorkspaceId: null,
      },
      fitAllTerminals: () => {},
    };
  }

  it("initializes without throwing when no identity is set", () => {
    expect(() => initFeedPanel(makeDeps())).not.toThrow();
  });

  it("registers an onclick handler on the collapse button", () => {
    initFeedPanel(makeDeps());
    const collapseBtn = document.getElementById("feed-collapse-btn") as HTMLElement & { onclick: unknown };
    expect(typeof collapseBtn.onclick).toBe("function");
  });

  it("registers an onclick handler on the expand button", () => {
    initFeedPanel(makeDeps());
    const expandBtn = document.getElementById("feed-expand-btn") as HTMLElement & { onclick: unknown };
    expect(typeof expandBtn.onclick).toBe("function");
  });

  it("starts the poll loop via setInterval", () => {
    const setIntervalSpy = vi.fn((_fn: () => void, _ms: number) => 0);
    vi.stubGlobal("setInterval", setIntervalSpy);
    initFeedPanel(makeDeps());
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy.mock.calls[0]?.[1]).toBe(10_000); // FEED_POLL_MS
  });

  it("restores saved feed width from localStorage", () => {
    localStorage.setItem("pty-win-feed-width", "320");
    initFeedPanel(makeDeps());
    const panel = document.getElementById("feed-panel") as HTMLElement;
    expect(panel.style.width).toBe("320px");
  });

  it("opens by default but respects saved collapsed state", () => {
    localStorage.setItem("pty-win-feed-open", "false");
    initFeedPanel(makeDeps());
    const panel = document.getElementById("feed-panel") as HTMLElement;
    const strip = document.getElementById("feed-strip") as HTMLElement;
    expect(panel.classList.contains("hidden")).toBe(true);
    expect(strip.classList.contains("hidden")).toBe(false);
  });
});
