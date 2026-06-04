// @ts-check
//
// Dashboard diag-panel render helpers (Round 27 of lint extraction).
//
// Shape mirrors agents-panel.js but with the diag-table schema
// (6 cells: name/status/active/cb-per-sec/kb-per-sec/cost) and the
// "hot" highlight for high callbacks-per-sec rows. No "needs input"
// concept here.

/**
 * @typedef {Object} DiagSessionInfo
 * @property {string=} status
 * @property {number=} costUsd
 * @property {number=} lastActiveMs
 */

/**
 * @typedef {Object} DiagStatsEntry
 * @property {{ callbacksPerSec: number, bytesPerSec: number }} busy
 */

/** Threshold above which a row gets the "diag-hot" highlight. */
export const DIAG_HOT_CBS_THRESHOLD = 100;

/**
 * Compute the total cost across the supplied sessions.
 *
 * @param {Array<[string, DiagSessionInfo]>} sessions
 * @returns {number}
 */
export function computeDiagTotalCost(sessions) {
  let sum = 0;
  for (const [, info] of sessions) sum += Number(info.costUsd) || 0;
  return sum;
}

/**
 * Whether the row should be flagged as "hot" (very high cb/s).
 *
 * @param {DiagStatsEntry | undefined} stats
 * @returns {boolean}
 */
export function isDiagRowHot(stats) {
  if (!stats) return false;
  return stats.busy.callbacksPerSec > DIAG_HOT_CBS_THRESHOLD;
}

/**
 * Remove .diag-row rows for sessions no longer in currentNames.
 *
 * @param {HTMLElement | Element} tbody
 * @param {Set<string>} currentNames
 */
export function removeStaleDiagRows(tbody, currentNames) {
  const rows = tbody.querySelectorAll(".diag-row");
  for (const row of [...rows]) {
    if (!(row instanceof HTMLElement)) continue;
    if (!currentNames.has(row.dataset["session"] ?? "")) row.remove();
  }
}

/**
 * Find a .diag-row by session name. Scans rows instead of using a
 * CSS.escape selector so happy-dom tests don't need polyfills and
 * names containing special characters are safe.
 *
 * @param {HTMLElement | Element} tbody
 * @param {string} name
 * @returns {HTMLTableRowElement | null}
 */
export function findDiagRow(tbody, name) {
  const rows = tbody.querySelectorAll(".diag-row");
  for (const row of rows) {
    if (row instanceof HTMLTableRowElement && row.dataset["session"] === name) {
      return row;
    }
  }
  return null;
}

/**
 * Create or patch the per-session row inside tbody. Per-cell text
 * diffing is preserved to avoid reflows on every poll.
 *
 * @param {HTMLElement | Element} tbody
 * @param {string} name
 * @param {DiagSessionInfo} info
 * @param {DiagStatsEntry | undefined} stats
 * @param {{
 *   onFocusSession: (name: string) => void,
 *   fmtAgo: (ms: number | undefined) => string,
 * }} deps
 * @returns {HTMLTableRowElement}
 */
export function upsertDiagRow(tbody, name, info, stats, deps) {
  let row = findDiagRow(tbody, name);
  if (!row) {
    row = document.createElement("tr");
    row.className = "diag-row";
    row.dataset["session"] = name;
    row.style.cursor = "pointer";
    row.onclick = () => deps.onFocusSession(name);
    row.innerHTML =
      `<td class="diag-name"></td>` +
      `<td class="diag-status"></td>` +
      `<td class="diag-ago"></td>` +
      `<td class="diag-cbs"></td>` +
      `<td class="diag-kbs"></td>` +
      `<td class="diag-cost"></td>`;
    const totalRow = tbody.querySelector(".diag-cost-total");
    tbody.insertBefore(row, totalRow);
  }

  const hot = isDiagRowHot(stats);
  const newRowClass = `diag-row ${hot ? "diag-hot" : ""}`;
  if (row.className !== newRowClass) row.className = newRowClass;

  const cells = row.children;
  if (cells[0].textContent !== name) cells[0].textContent = name;

  const statusText = info.status ?? "";
  if (cells[1].textContent !== statusText) {
    cells[1].textContent = statusText;
    cells[1].className = `diag-status ${info.status ?? ""}`;
  }

  const agoText = deps.fmtAgo(info.lastActiveMs);
  if (cells[2].textContent !== agoText) cells[2].textContent = agoText;

  const cbsText = stats ? String(stats.busy.callbacksPerSec) : "0";
  if (cells[3].textContent !== cbsText) {
    cells[3].textContent = cbsText;
    cells[3].className = hot ? "diag-hot-val" : "";
  }

  const kbsText = stats ? (stats.busy.bytesPerSec / 1024).toFixed(1) : "0.0";
  if (cells[4].textContent !== kbsText) cells[4].textContent = kbsText;

  const costText = `$${(Number(info.costUsd) || 0).toFixed(2)}`;
  if (cells[5].textContent !== costText) cells[5].textContent = costText;

  return row;
}

/**
 * Create, patch, or remove the diag total row based on totalCost.
 *
 * @param {HTMLElement | Element} tbody
 * @param {number} totalCost
 */
export function upsertDiagTotalRow(tbody, totalCost) {
  let totalRow = /** @type {HTMLElement | null} */ (tbody.querySelector(".diag-cost-total"));
  if (totalCost > 0) {
    if (!totalRow) {
      totalRow = document.createElement("tr");
      totalRow.className = "diag-cost-total";
      totalRow.innerHTML = `<td colspan="5">Total</td><td class="diag-cost"></td>`;
      tbody.appendChild(totalRow);
    }
    const totalCell = totalRow.querySelector(".diag-cost");
    const totalText = `$${totalCost.toFixed(2)}`;
    if (totalCell && totalCell.textContent !== totalText) totalCell.textContent = totalText;
  } else if (totalRow) {
    totalRow.remove();
  }
}
