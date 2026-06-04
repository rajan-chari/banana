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
