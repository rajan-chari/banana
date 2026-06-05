// @ts-check
//
// Dashboard panel runtime — extracted from app.js as Phase 3 of the
// modularization campaign. Owns:
//   * renderDashboard / patchDashboard / createDashboardCard / loadSnapshot
//   * renderDashboardStats polling
//   * the stats poll timer (formerly diagPollTimer in app.js)
//   * AbortControllers for /api/sessions/.../snapshot and /api/stats fetches
//
// Pure HTML/row helpers live in ./dashboard-patch.js and ./diag-panel.js;
// this module is the controller that wires them to state, DOM, and timers.

import {
  EMPTY_DASHBOARD_HTML,
  patchCardFields,
  removeStaleCards,
} from "./dashboard-patch.js";
import {
  computeDiagTotalCost,
  removeStaleDiagRows,
  upsertDiagRow,
  upsertDiagTotalRow,
} from "./diag-panel.js";
import { isDashboardMode } from "./navigation.js";

/**
 * @typedef {Object} StorageLike
 * @property {(k: string) => (string | null)} getItem
 * @property {(k: string, v: string) => void} setItem
 */

/**
 * @typedef {Object} DashboardDeps
 * @property {{ sessions: Map<string, any>, isDashboard: boolean }} state
 * @property {(id: string) => HTMLElement | null} byId
 * @property {(ms: number | undefined) => string} fmtAgo
 * @property {(name: string) => void} onFocusSession
 * @property {typeof fetch} [fetchFn]
 * @property {typeof setInterval} [setIntervalFn]
 * @property {typeof clearInterval} [clearIntervalFn]
 * @property {StorageLike | null} [storage]
 * @property {Document} [doc]
 * @property {number} [pollMs]
 */

/**
 * Build a dashboard runtime with explicit lifecycle. AbortController on
 * /api/stats (overlapping polls) and on per-card /api/sessions/.../snapshot
 * fetches (cleaned up on dispose). Timers, fetch, storage, and document
 * are all shimmable for tests.
 *
 * @param {DashboardDeps} deps
 */
// eslint-disable-next-line max-lines-per-function -- factory closure groups render/patch/loadSnapshot/renderStats with shared in-flight state; splitting would require leaking AbortControllers across modules
export function createDashboardPanel(deps) {
  const setIntervalFn = deps.setIntervalFn || setInterval.bind(window);
  const clearIntervalFn = deps.clearIntervalFn || clearInterval.bind(window);
  const fetcher = deps.fetchFn || fetch.bind(window);
  const storage = deps.storage === undefined
    ? (typeof localStorage !== "undefined" ? localStorage : null)
    : deps.storage;
  const doc = deps.doc || (typeof document !== "undefined" ? document : null);
  const pollMs = deps.pollMs ?? 5000;

  /** @type {AbortController | null} */
  let statsInflight = null;
  /** @type {Set<AbortController>} */
  const snapshotInflight = new Set();
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;

  function buildHeaderHTML() {
    const totalCost = [...deps.state.sessions.values()].reduce(
      /** @param {number} s @param {any} i */
      (s, i) => s + (i.costUsd || 0),
      0,
    );
    const alive = [...deps.state.sessions.values()].filter((i) => i.status !== "dead").length;
    const busy = [...deps.state.sessions.values()].filter((i) => i.status === "busy").length;
    return `
      <span class="dash-title">Mission Control</span>
      <span class="dash-summary">
        <span class="val">${alive}</span> active &middot;
        <span class="val">${busy}</span> busy &middot;
        <span class="val">${deps.state.sessions.size}</span> total
        ${totalCost > 0 ? `&middot; <span class="val">$${totalCost.toFixed(2)}</span>` : ""}
      </span>
    `;
  }

  /**
   * @param {string} sessionName
   */
  async function loadSnapshot(sessionName) {
    if (!doc) return;
    const ctl = new AbortController();
    snapshotInflight.add(ctl);
    try {
      const res = await fetcher(`/api/sessions/${encodeURIComponent(sessionName)}/snapshot?lines=8`, { signal: ctl.signal });
      const data = await res.json();
      const card = doc.querySelector(`.dashboard-card[data-session="${cssEscape(sessionName)}"]`);
      const el = card?.querySelector(".dashboard-card-preview");
      if (el) el.textContent = data.lines.join("\n") || "(no output yet)";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      // Swallow — preview stays at "..." until the next render attempts again.
    } finally {
      snapshotInflight.delete(ctl);
    }
  }

  /**
   * @param {string} name
   * @param {any} info
   */
  function createDashboardCard(name, info) {
    if (!doc) throw new Error("createDashboardCard requires a document");
    const card = doc.createElement("div");
    card.className = `dashboard-card status-${info.status}`;
    card.dataset["session"] = name;
    card.style.contain = "content";
    const unread = info.unreadCount || 0;
    const identity = info.emcomIdentity ? `<span class="dashboard-card-identity">@${info.emcomIdentity}</span>` : "";
    const cost = `<span class="dashboard-card-cost">$${(info.costUsd || 0).toFixed(2)}</span>`;
    card.innerHTML = `
      <div class="dashboard-card-header">
        <span class="dashboard-card-name">${name}</span>
        <span class="dashboard-card-meta">
          ${identity}
          ${cost}
          <span class="dashboard-card-status ${info.status}">${info.status}</span>
          <span class="dashboard-card-badge ${unread > 0 ? "show" : ""}">${unread}</span>
        </span>
      </div>
      <div class="dashboard-card-preview">...</div>
    `;
    card.onclick = () => deps.onFocusSession(name);
    loadSnapshot(name);
    return card;
  }

  /**
   * @param {HTMLElement} dash
   */
  function patchDashboard(dash) {
    if (deps.state.sessions.size === 0) {
      dash.innerHTML = EMPTY_DASHBOARD_HTML;
      return;
    }
    const empty = dash.querySelector(".dashboard-empty");
    if (empty) { dash.remove(); render(); return; }

    const header = dash.querySelector(".dash-header");
    if (header) header.innerHTML = buildHeaderHTML();

    const countEl = dash.querySelector(".dash-cards-count");
    if (countEl) countEl.textContent = `(${deps.state.sessions.size})`;

    const cardsGrid = dash.querySelector(".dash-cards");
    if (!cardsGrid) return;

    removeStaleCards(cardsGrid, new Set(deps.state.sessions.keys()));

    for (const [name, info] of deps.state.sessions) {
      const card = cardsGrid.querySelector(`.dashboard-card[data-session="${cssEscape(name)}"]`);
      if (!card) {
        cardsGrid.appendChild(createDashboardCard(name, info));
      } else {
        patchCardFields(/** @type {HTMLElement} */ (card), info);
      }
    }
  }

  function render() {
    if (!doc) return;
    const area = deps.byId("workspace-area");
    if (!area) return;

    const existing = /** @type {HTMLElement | null} */ (area.querySelector(".dashboard"));
    if (existing) { patchDashboard(existing); return; }

    area.innerHTML = "";
    const dash = doc.createElement("div");
    dash.className = "dashboard active";
    area.appendChild(dash);

    if (deps.state.sessions.size === 0) {
      dash.innerHTML = `
        <div class="dashboard-empty">
          // NO ACTIVE SESSIONS<br><br>
          Open a folder from the sidebar or press <kbd>Ctrl+P</kbd>
        </div>
      `;
      return;
    }

    const header = doc.createElement("div");
    header.className = "dash-header";
    header.innerHTML = buildHeaderHTML();
    dash.appendChild(header);

    const cardsCollapsed = storage?.getItem("pty-win-dash-cards-collapsed") === "true";
    const cardsSection = doc.createElement("div");
    cardsSection.className = "dash-cards-section";

    const cardsHeader = doc.createElement("div");
    cardsHeader.className = "dash-cards-header";
    cardsHeader.innerHTML = `<span class="dash-cards-arrow">${cardsCollapsed ? "\u25b8" : "\u25be"}</span> Workspaces <span class="dash-cards-count">(${deps.state.sessions.size})</span>`;
    cardsHeader.onclick = () => {
      const grid = /** @type {HTMLElement | null} */ (cardsSection.querySelector(".dash-cards"));
      const arrow = /** @type {HTMLElement | null} */ (cardsHeader.querySelector(".dash-cards-arrow"));
      if (!grid || !arrow) return;
      const collapsed = grid.style.display === "none";
      grid.style.display = collapsed ? "" : "none";
      arrow.textContent = collapsed ? "\u25be" : "\u25b8";
      storage?.setItem("pty-win-dash-cards-collapsed", collapsed ? "false" : "true");
    };
    cardsSection.appendChild(cardsHeader);

    const cardsGrid = doc.createElement("div");
    cardsGrid.className = "dash-cards";
    if (cardsCollapsed) cardsGrid.style.display = "none";
    cardsSection.appendChild(cardsGrid);
    dash.appendChild(cardsSection);

    for (const [name, info] of deps.state.sessions) {
      cardsGrid.appendChild(createDashboardCard(name, info));
    }
  }

  async function renderStats() {
    if (!isDashboardMode(deps.state)) return;
    if (!doc) return;
    // Use getElementById here (not byId) because the #dashboard-stats
    // container is not currently rendered — the guarded early-return
    // keeps the polling interval harmless.
    const container = doc.getElementById("dashboard-stats");
    if (!container) return;

    if (statsInflight) statsInflight.abort();
    statsInflight = new AbortController();
    const myCtl = statsInflight;

    try {
      const res = await fetcher("/api/stats", { signal: myCtl.signal });
      const stats = await res.json();
      if (!isDashboardMode(deps.state)) return;
      paintStats(container, stats);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      // Swallow — table keeps its prior contents.
    } finally {
      if (statsInflight === myCtl) statsInflight = null;
    }
  }

  /**
   * @param {HTMLElement} container
   * @param {any[]} stats
   */
  function paintStats(container, stats) {
    const statsMap = new Map(stats.map((s) => [s.name, s]));
    const sessions = [...deps.state.sessions.entries()];
    const totalCostVal = computeDiagTotalCost(sessions);

    let table = container.querySelector(".diag-table");
    if (!table) {
      container.innerHTML = `
        <div class="diag-section-title">Sessions</div>
        <table class="diag-table">
          <thead>
            <tr><th>Session</th><th>Status</th><th>Active</th><th>cb/s</th><th>KB/s</th><th>Cost</th></tr>
          </thead>
          <tbody></tbody>
        </table>`;
      table = container.querySelector(".diag-table");
    }

    const tbody = table?.querySelector("tbody");
    if (!tbody) return;
    const currentNames = new Set(sessions.map(([n]) => n));

    removeStaleDiagRows(tbody, currentNames);

    for (const [name, info] of sessions) {
      upsertDiagRow(tbody, name, info, statsMap.get(name), {
        onFocusSession: deps.onFocusSession,
        fmtAgo: deps.fmtAgo,
      });
    }

    upsertDiagTotalRow(tbody, totalCostVal);
  }

  function startPolling() {
    if (timer != null) return;
    timer = setIntervalFn(() => { renderStats(); }, pollMs);
  }

  function stopPolling() {
    if (timer != null) {
      clearIntervalFn(timer);
      timer = null;
    }
  }

  function dispose() {
    stopPolling();
    if (statsInflight) { statsInflight.abort(); statsInflight = null; }
    for (const ctl of snapshotInflight) ctl.abort();
    snapshotInflight.clear();
  }

  return { render, renderStats, startPolling, stopPolling, dispose };
}

/**
 * Use CSS.escape when available, else fall back to a conservative replacement
 * good enough for session names (which are validated server-side). This keeps
 * the panel testable under happy-dom where CSS.escape may be absent.
 *
 * @param {string} s
 */
function cssEscape(s) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
