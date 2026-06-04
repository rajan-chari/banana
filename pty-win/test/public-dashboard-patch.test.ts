// @vitest-environment happy-dom
//
// Tests for public/lib/dashboard-patch.js — extracted from app.js's
// patchDashboard. Verifies per-field patch idempotence, status pill
// className wiring, badge .show class, and stale-card pruning.

import { describe, it, expect } from "vitest";
import {
  EMPTY_DASHBOARD_HTML,
  patchCardStatus,
  patchCardCost,
  patchCardBadge,
  patchCardFields,
  removeStaleCards,
} from "../public/lib/dashboard-patch.js";

type SessionStatus = "starting" | "busy" | "idle" | "dead";

type SessionInfo = {
  name: string;
  group: string;
  command: string;
  status: SessionStatus;
  costUsd?: number;
  unreadCount?: number;
};

function mkCard(name: string, info: Partial<SessionInfo> = {}): HTMLDivElement {
  const card = document.createElement("div");
  card.className = `dashboard-card status-${info.status ?? "starting"}`;
  card.dataset["session"] = name;
  card.innerHTML = `
    <div class="dashboard-card-header">
      <span class="dashboard-card-name">${name}</span>
      <span class="dashboard-card-meta">
        <span class="dashboard-card-cost">$${(info.costUsd ?? 0).toFixed(2)}</span>
        <span class="dashboard-card-status ${info.status ?? "starting"}">${info.status ?? "starting"}</span>
        <span class="dashboard-card-badge ${(info.unreadCount ?? 0) > 0 ? "show" : ""}">${info.unreadCount ?? 0}</span>
      </span>
    </div>
  `;
  return card;
}

const baseInfo: SessionInfo = {
  name: "demo",
  group: "demo",
  command: "claude",
  status: "starting",
  costUsd: 0,
  unreadCount: 0,
};

describe("EMPTY_DASHBOARD_HTML", () => {
  it("contains the empty-dashboard sentinel class and a kbd hint", () => {
    expect(EMPTY_DASHBOARD_HTML).toContain("dashboard-empty");
    expect(EMPTY_DASHBOARD_HTML).toContain("<kbd>Ctrl+P</kbd>");
    expect(EMPTY_DASHBOARD_HTML).toContain("NO ACTIVE SESSIONS");
  });
});

describe("patchCardStatus", () => {
  it("updates text, status class, and card className when status changes", () => {
    const card = mkCard("a", { status: "starting" });
    const changed = patchCardStatus(card, { ...baseInfo, status: "busy" });
    expect(changed).toBe(true);
    const statusEl = card.querySelector(".dashboard-card-status");
    expect(statusEl?.textContent).toBe("busy");
    expect(statusEl?.className).toBe("dashboard-card-status busy");
    expect(card.className).toBe("dashboard-card status-busy");
  });

  it("returns false and mutates nothing when status is unchanged", () => {
    const card = mkCard("a", { status: "busy" });
    const before = card.outerHTML;
    const changed = patchCardStatus(card, { ...baseInfo, status: "busy" });
    expect(changed).toBe(false);
    expect(card.outerHTML).toBe(before);
  });

  it("returns false when the status element is missing", () => {
    const card = document.createElement("div");
    card.className = "dashboard-card";
    expect(patchCardStatus(card, { ...baseInfo, status: "busy" })).toBe(false);
  });
});

describe("patchCardCost", () => {
  it("renders cost to 2 decimals and patches when changed", () => {
    const card = mkCard("a", { costUsd: 0 });
    const changed = patchCardCost(card, { ...baseInfo, costUsd: 1.234 });
    expect(changed).toBe(true);
    expect(card.querySelector(".dashboard-card-cost")?.textContent).toBe("$1.23");
  });

  it("treats missing costUsd as $0.00", () => {
    const card = mkCard("a", { costUsd: 1.23 });
    const changed = patchCardCost(card, { ...baseInfo, costUsd: undefined });
    expect(changed).toBe(true);
    expect(card.querySelector(".dashboard-card-cost")?.textContent).toBe("$0.00");
  });

  it("returns false when unchanged", () => {
    const card = mkCard("a", { costUsd: 2.5 });
    expect(patchCardCost(card, { ...baseInfo, costUsd: 2.5 })).toBe(false);
  });
});

describe("patchCardBadge", () => {
  it("adds .show when unreadCount > 0 and sets text", () => {
    const card = mkCard("a", { unreadCount: 0 });
    const changed = patchCardBadge(card, { ...baseInfo, unreadCount: 3 });
    expect(changed).toBe(true);
    const badge = card.querySelector(".dashboard-card-badge");
    expect(badge?.textContent).toBe("3");
    expect(badge?.className).toBe("dashboard-card-badge show");
  });

  it("strips .show when unreadCount returns to 0", () => {
    const card = mkCard("a", { unreadCount: 3 });
    const changed = patchCardBadge(card, { ...baseInfo, unreadCount: 0 });
    expect(changed).toBe(true);
    const badge = card.querySelector(".dashboard-card-badge");
    expect(badge?.textContent).toBe("0");
    expect(badge?.className).toBe("dashboard-card-badge ");
  });

  it("returns false when both text and class are unchanged", () => {
    const card = mkCard("a", { unreadCount: 2 });
    expect(patchCardBadge(card, { ...baseInfo, unreadCount: 2 })).toBe(false);
  });
});

describe("patchCardFields", () => {
  it("composes status + cost + badge patches in one call", () => {
    const card = mkCard("a", { status: "starting", costUsd: 0, unreadCount: 0 });
    patchCardFields(card, { ...baseInfo, status: "idle", costUsd: 0.5, unreadCount: 7 });
    expect(card.className).toBe("dashboard-card status-idle");
    expect(card.querySelector(".dashboard-card-cost")?.textContent).toBe("$0.50");
    const badge = card.querySelector(".dashboard-card-badge");
    expect(badge?.textContent).toBe("7");
    expect(badge?.className).toBe("dashboard-card-badge show");
  });
});

describe("removeStaleCards", () => {
  function mkGrid(names: string[]): HTMLDivElement {
    const grid = document.createElement("div");
    grid.className = "dash-cards";
    for (const n of names) grid.appendChild(mkCard(n));
    return grid;
  }

  it("removes cards whose session name is not in currentNames", () => {
    const grid = mkGrid(["a", "b", "c"]);
    const removed = removeStaleCards(grid, new Set(["b"]));
    expect(removed).toBe(2);
    const remaining = [...grid.querySelectorAll(".dashboard-card")].map(
      (el) => (el as HTMLElement).dataset["session"],
    );
    expect(remaining).toEqual(["b"]);
  });

  it("returns 0 and mutates nothing when all cards are still live", () => {
    const grid = mkGrid(["a", "b"]);
    const before = grid.innerHTML;
    expect(removeStaleCards(grid, new Set(["a", "b"]))).toBe(0);
    expect(grid.innerHTML).toBe(before);
  });

  it("ignores non-card descendants", () => {
    const grid = mkGrid(["a"]);
    const stray = document.createElement("div");
    stray.className = "dashboard-empty";
    grid.appendChild(stray);
    removeStaleCards(grid, new Set([]));
    expect(grid.querySelector(".dashboard-empty")).toBeTruthy();
  });
});
