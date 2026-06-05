// @ts-check
//
// Agents-panel render helpers.
//
// Lifted from app.js renderAgentsPanel() during Round 26 of the lint
// extraction work. The orchestrator (renderAgentsPanel) stays in app.js;
// this module exposes pure counters/formatters and DOM mutators that can
// be tested with happy-dom.

/**
 * @typedef {Object} SessionInfoLike
 * @property {string=} status
 * @property {boolean=} pendingPermission
 * @property {number=} costUsd
 * @property {number=} lastActiveMs
 */

/**
 * @typedef {Object} StatsEntry
 * @property {{ callbacksPerSec: number }} busy
 */

/**
 * Whether a session should be flagged as "needs input" in the agents
 * panel. Centralised so the summary counter and per-row className
 * cannot drift.
 *
 * @param {SessionInfoLike} info
 * @param {number} cbs - callbacks-per-second for this session (0 if no stats)
 * @returns {boolean}
 */
export function sessionNeedsInput(info, cbs) {
  if (info.status === "dead") return false;
  if (info.pendingPermission) return true;
  return info.status === "busy" && cbs === 0;
}

/**
 * Compute the four counters shown in the panel summary line.
 *
 * @param {Array<[string, SessionInfoLike]>} sessions
 * @param {Map<string, StatsEntry>} statsMap
 * @returns {{ busy: number, idle: number, needsInputCount: number, totalCost: number }}
 */
export function computeAgentsCounters(sessions, statsMap) {
  let busy = 0;
  let idle = 0;
  let needsInputCount = 0;
  let totalCost = 0;
  for (const [name, info] of sessions) {
    if (info.status === "busy") busy++;
    else if (info.status === "idle") idle++;
    const stats = statsMap.get(name);
    const cbs = stats ? stats.busy.callbacksPerSec : 0;
    if (sessionNeedsInput(info, cbs)) needsInputCount++;
    totalCost += Number(info.costUsd) || 0;
  }
  return { busy, idle, needsInputCount, totalCost };
}

/**
 * Build the inner-HTML string for the agents-summary span.
 * All interpolated values are numeric (counters + dollar amount),
 * so this string is safe by construction.
 *
 * @param {{ busy: number, idle: number, needsInputCount: number, totalCost: number }} counters
 * @returns {string}
 */
export function formatAgentsSummaryHtml(counters) {
  const { busy, idle, needsInputCount, totalCost } = counters;
  const needsPart =
    needsInputCount > 0
      ? ` · <span class="agents-needs-input-count">${needsInputCount} need input</span>`
      : "";
  return `${busy} busy · ${idle} idle${needsPart} · $${totalCost.toFixed(2)}`;
}

/**
 * Remove .agents-row rows for sessions that are no longer in the
 * current name set.
 *
 * @param {HTMLElement | Element} tbody
 * @param {Set<string>} currentNames
 */
export function removeStaleAgentRows(tbody, currentNames) {
  const rows = tbody.querySelectorAll(".agents-row");
  for (const row of [...rows]) {
    if (!(row instanceof HTMLElement)) continue;
    if (!currentNames.has(row.dataset["session"] ?? "")) row.remove();
  }
}

/**
 * Find an existing row for the given session name by scanning the
 * tbody. Avoids CSS.escape so values containing quotes/brackets
 * don't blow up the selector (and so happy-dom tests don't need a
 * CSS.escape polyfill).
 *
 * @param {HTMLElement | Element} tbody
 * @param {string} name
 * @returns {HTMLTableRowElement | null}
 */
export function findAgentRow(tbody, name) {
  const rows = tbody.querySelectorAll(".agents-row");
  for (const row of rows) {
    if (row instanceof HTMLTableRowElement && row.dataset["session"] === name) {
      return row;
    }
  }
  return null;
}

/**
 * Create or patch the per-session row inside tbody. Uses per-cell
 * text diffing to avoid reflows on every poll.
 *
 * @param {HTMLElement | Element} tbody
 * @param {string} name
 * @param {SessionInfoLike} info
 * @param {StatsEntry | undefined} stats
 * @param {{
 *   onFocusSession: (name: string) => void,
 *   fmtAgo: (ms: number | undefined) => string,
 * }} deps
 * @returns {HTMLTableRowElement}
 */
export function upsertAgentRow(tbody, name, info, stats, deps) {
  let row = findAgentRow(tbody, name);
  if (!row) {
    row = document.createElement("tr");
    row.className = "agents-row";
    row.dataset["session"] = name;
    row.style.cursor = "pointer";
    row.onclick = () => deps.onFocusSession(name);
    row.innerHTML =
      `<td class="agents-name"></td>` +
      `<td class="agents-status"></td>` +
      `<td class="agents-cbs"></td>` +
      `<td class="agents-active"></td>` +
      `<td class="agents-trend"></td>` +
      `<td class="agents-cost"></td>`;
    const totalRow = tbody.querySelector(".agents-total-row");
    tbody.insertBefore(row, totalRow);
  }

  const cbs = stats ? stats.busy.callbacksPerSec : 0;
  const needs = sessionNeedsInput(info, cbs);
  const newRowClass = `agents-row ${needs ? "agents-needs-input" : ""}`;
  if (row.className !== newRowClass) row.className = newRowClass;

  const cells = row.children;
  if (cells[0].textContent !== name) cells[0].textContent = name;

  const statusText = needs ? "needs input" : (info.status || "unknown");
  const statusClass = `agents-status ${needs ? "status-needs-input" : `status-${info.status}`}`;
  if (cells[1].textContent !== statusText) {
    cells[1].textContent = statusText;
    cells[1].className = statusClass;
  }

  const cbsText = String(cbs);
  if (cells[2].textContent !== cbsText) cells[2].textContent = cbsText;

  const agoText = deps.fmtAgo(info.lastActiveMs);
  if (cells[3].textContent !== agoText) cells[3].textContent = agoText;

  const costText = `$${(Number(info.costUsd) || 0).toFixed(2)}`;
  if (cells[5].textContent !== costText) cells[5].textContent = costText;

  return row;
}

/**
 * Create, patch, or remove the total row at the bottom of tbody
 * based on totalCost.
 *
 * @param {HTMLElement | Element} tbody
 * @param {number} totalCost
 */
export function upsertAgentTotalRow(tbody, totalCost) {
  let totalRow = /** @type {HTMLElement | null} */ (tbody.querySelector(".agents-total-row"));
  if (totalCost > 0) {
    if (!totalRow) {
      totalRow = document.createElement("tr");
      totalRow.className = "agents-total-row";
      totalRow.innerHTML = `<td colspan="4">Total</td><td class="agents-trend"></td><td class="agents-cost"></td>`;
      tbody.appendChild(totalRow);
    }
    const totalCell = totalRow.querySelector(".agents-cost");
    const totalText = `$${totalCost.toFixed(2)}`;
    if (totalCell && totalCell.textContent !== totalText) totalCell.textContent = totalText;
  } else if (totalRow) {
    totalRow.remove();
  }
}

/**
 * Pure: extract per-session and total cost time series from a cost-history
 * snapshot array. Returns an empty result when the history is null or has
 * fewer than 2 samples (drawing a sparkline needs >= 2 points).
 *
 * @param {Array<{sessions: Record<string, number>}> | null | undefined} history
 * @returns {{ sessionSeries: Map<string, number[]>, totalSeries: number[] }}
 */
export function computeCostSeries(history) {
  /** @type {Map<string, number[]>} */
  const sessionSeries = new Map();
  /** @type {number[]} */
  const totalSeries = [];
  if (!Array.isArray(history) || history.length < 2) {
    return { sessionSeries, totalSeries };
  }
  for (const sample of history) {
    const entries = Object.entries(sample.sessions || {});
    let sum = 0;
    for (const [name, cost] of entries) {
      const n = typeof cost === "number" ? cost : 0;
      if (!sessionSeries.has(name)) sessionSeries.set(name, []);
      const series = sessionSeries.get(name);
      if (series) series.push(n);
      sum += n;
    }
    totalSeries.push(sum);
  }
  return { sessionSeries, totalSeries };
}

/**
 * Find or create the <canvas class="agents-sparkline"> inside `cell` and
 * return it. Idempotent.
 *
 * @param {Element} cell
 * @returns {HTMLCanvasElement}
 */
function ensureSparklineCanvas(cell) {
  let canvas = /** @type {HTMLCanvasElement | null} */ (cell.querySelector(".agents-sparkline"));
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "agents-sparkline";
    canvas.width = 50;
    canvas.height = 14;
    cell.appendChild(canvas);
  }
  return canvas;
}

/**
 * Render a 1-pixel line graph of `data` into `canvas`. No-op when fewer
 * than 2 points or canvas 2D context is unavailable.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {ReadonlyArray<number>} data
 */
export function drawSparkline(canvas, data) {
  if (data.length < 2) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  ctx.strokeStyle = "#d4882a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((data[i] - min) / range) * (h - 2) - 1;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/**
 * Paint per-session and total sparklines into the trend cells of `panel`.
 * Looks up rows via the selector-free findAgentRow helper so awkward
 * session names cannot break the lookup.
 *
 * @param {HTMLElement} panel
 * @param {{ sessionSeries: Map<string, number[]>, totalSeries: number[] }} series
 */
export function paintSparklines(panel, series) {
  const tbody = panel.querySelector("tbody");
  if (!tbody) return;

  for (const [name, points] of series.sessionSeries) {
    const row = findAgentRow(tbody, name);
    if (!row) continue;
    const trendCell = row.querySelector(".agents-trend");
    if (!trendCell) continue;
    drawSparkline(ensureSparklineCanvas(trendCell), points);
  }

  const totalRow = /** @type {HTMLElement | null} */ (tbody.querySelector(".agents-total-row"));
  if (totalRow && series.totalSeries.length >= 2) {
    let trendCell = totalRow.querySelector(".agents-trend");
    if (!trendCell) {
      // Total row was created with colspan=4; restructure to add a trend cell.
      totalRow.innerHTML = `<td colspan="4">Total</td><td class="agents-trend"></td><td class="agents-cost"></td>`;
      trendCell = totalRow.querySelector(".agents-trend");
    }
    if (trendCell) drawSparkline(ensureSparklineCanvas(trendCell), series.totalSeries);
  }
}

const AGENTS_PANEL_TEMPLATE =
  `<div class="agents-header">` +
  `<span class="agents-title">AGENT STATUS</span>` +
  `<span class="agents-summary"></span>` +
  `</div>` +
  `<table class="agents-table">` +
  `<thead><tr><th>Agent</th><th>Status</th><th>cb/s</th><th>Active</th><th>Trend</th><th>Cost</th></tr></thead>` +
  `<tbody></tbody>` +
  `</table>`;

/**
 * Ensure the .agents-panel wrapper exists inside `area` and return it.
 * Idempotent: only rebuilds when missing or when the prior render was an
 * empty-state placeholder.
 *
 * @param {HTMLElement} area
 * @returns {HTMLElement}
 */
function ensureAgentsPanelWrapper(area) {
  let panel = /** @type {HTMLElement | null} */ (area.querySelector(".agents-panel"));
  if (!panel || !panel.querySelector(".agents-table")) {
    area.innerHTML = "";
    panel = document.createElement("div");
    panel.className = "agents-panel";
    panel.innerHTML = AGENTS_PANEL_TEMPLATE;
    area.appendChild(panel);
  }
  return panel;
}

/**
 * Render the agents panel into `area`. Performs two fetches (stats and
 * cost-history) and patches the existing DOM in place. All fetches are
 * cancellable via the deps.signal AbortSignal so back-to-back polls do
 * not race.
 *
 * @param {HTMLElement} area
 * @param {{
 *   state: { sessions: Map<string, any> },
 *   fmtAgo: (ms: number | undefined) => string,
 *   onFocusSession: (name: string) => void,
 *   fetchFn?: typeof fetch,
 *   signal?: AbortSignal,
 * }} deps
 */
export async function renderAgentsPanel(area, deps) {
  if (!area) return;
  const sessionsAll = [...deps.state.sessions.entries()];
  if (sessionsAll.length === 0) {
    area.innerHTML = `<div class="agents-panel"><div class="agents-empty">No active sessions</div></div>`;
    return;
  }

  const panel = ensureAgentsPanelWrapper(area);
  const fetcher = deps.fetchFn || fetch.bind(window);

  try {
    const statsResp = await fetcher("/api/stats", { signal: deps.signal });
    const stats = await statsResp.json();
    const sessions = [...deps.state.sessions.entries()];
    const currentNames = new Set(sessions.map(([n]) => n));
    const statsMap = new Map(stats.map((/** @type {any} */ s) => [s.name, s]));

    const counters = computeAgentsCounters(sessions, statsMap);
    const summaryEl = panel.querySelector(".agents-summary");
    if (summaryEl) summaryEl.innerHTML = formatAgentsSummaryHtml(counters);

    const tbody = panel.querySelector("tbody");
    if (!tbody) return;
    removeStaleAgentRows(tbody, currentNames);
    for (const [name, info] of sessions) {
      upsertAgentRow(tbody, name, info, statsMap.get(name), {
        onFocusSession: deps.onFocusSession,
        fmtAgo: deps.fmtAgo,
      });
    }
    upsertAgentTotalRow(tbody, counters.totalCost);

    const histResp = await fetcher("/api/cost-history", { signal: deps.signal });
    const history = await histResp.json();
    paintSparklines(panel, computeCostSeries(history));
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    // Otherwise swallow — panel keeps its prior contents until the next poll succeeds.
  }
}

/**
 * Build an agents-panel runtime with explicit lifecycle. Manages a
 * single in-flight render via AbortController so overlapping polls
 * cannot patch a panel out from under each other, and exposes
 * start/stop/dispose for tests and for the right-panel coordinator.
 *
 * @param {{
 *   state: { sessions: Map<string, any> },
 *   byId: (id: string) => HTMLElement | null,
 *   fmtAgo: (ms: number | undefined) => string,
 *   onFocusSession: (name: string) => void,
 *   fetchFn?: typeof fetch,
 *   setIntervalFn?: typeof setInterval,
 *   clearIntervalFn?: typeof clearInterval,
 *   pollMs?: number,
 * }} deps
 */
export function createAgentsPanel(deps) {
  const setIntervalFn = deps.setIntervalFn || setInterval.bind(window);
  const clearIntervalFn = deps.clearIntervalFn || clearInterval.bind(window);
  const pollMs = deps.pollMs ?? 5000;
  /** @type {AbortController | null} */
  let inflight = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;

  async function render() {
    const area = deps.byId("agents-content");
    if (!area) return;
    if (inflight) inflight.abort();
    inflight = new AbortController();
    const myCtl = inflight;
    try {
      await renderAgentsPanel(area, {
        state: deps.state,
        fmtAgo: deps.fmtAgo,
        onFocusSession: deps.onFocusSession,
        fetchFn: deps.fetchFn,
        signal: myCtl.signal,
      });
    } finally {
      if (inflight === myCtl) inflight = null;
    }
  }

  function startPolling() {
    if (timer != null) return;
    timer = setIntervalFn(() => { render(); }, pollMs);
  }

  function stopPolling() {
    if (timer != null) {
      clearIntervalFn(timer);
      timer = null;
    }
  }

  function dispose() {
    stopPolling();
    if (inflight) { inflight.abort(); inflight = null; }
  }

  return { render, startPolling, stopPolling, dispose };
}
