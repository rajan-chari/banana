// @ts-check
//
// Pure DOM-patch helpers for the dashboard. Extracted from app.js's
// patchDashboard (originally Cx 20) so the per-card patch logic is
// testable with happy-dom and patchDashboard becomes a thin orchestrator.
//
// Side-effect-free: no app state, no event handlers, no fetches.
// All exports take an HTMLElement (or grid) + a SessionInfo and patch
// in place. They're idempotent — calling with the same info twice
// produces no DOM mutations (textContent compare before write).

/** @typedef {import('./state.js').SessionInfo} SessionInfo */

export const EMPTY_DASHBOARD_HTML = `
      <div class="dashboard-empty">
        // NO ACTIVE SESSIONS<br><br>
        Open a folder from the sidebar or press <kbd>Ctrl+P</kbd>
      </div>
    `;

/**
 * Patch the status pill on a dashboard card. Updates textContent and
 * the card's outer className when status changes. No-op if unchanged.
 * @param {HTMLElement} card
 * @param {SessionInfo} info
 * @returns {boolean} true if a change was applied
 */
export function patchCardStatus(card, info) {
  const statusEl = card.querySelector(".dashboard-card-status");
  if (!statusEl) return false;
  if (statusEl.textContent === info.status) return false;
  statusEl.textContent = info.status;
  statusEl.className = `dashboard-card-status ${info.status}`;
  card.className = `dashboard-card status-${info.status}`;
  return true;
}

/**
 * Patch the cost label on a dashboard card.
 * @param {HTMLElement} card
 * @param {SessionInfo} info
 * @returns {boolean} true if a change was applied
 */
export function patchCardCost(card, info) {
  const costEl = card.querySelector(".dashboard-card-cost");
  if (!costEl) return false;
  const costText = `$${(info.costUsd || 0).toFixed(2)}`;
  if (costEl.textContent === costText) return false;
  costEl.textContent = costText;
  return true;
}

/**
 * Patch the unread badge on a dashboard card.
 * @param {HTMLElement} card
 * @param {SessionInfo} info
 * @returns {boolean} true if a change was applied
 */
export function patchCardBadge(card, info) {
  const badgeEl = card.querySelector(".dashboard-card-badge");
  if (!badgeEl) return false;
  const unread = info.unreadCount || 0;
  const text = String(unread);
  const cls = `dashboard-card-badge ${unread > 0 ? "show" : ""}`;
  if (badgeEl.textContent === text && badgeEl.className === cls) return false;
  badgeEl.textContent = text;
  badgeEl.className = cls;
  return true;
}

/**
 * Composer: patch status, cost, and badge in one call.
 * @param {HTMLElement} card
 * @param {SessionInfo} info
 */
export function patchCardFields(card, info) {
  patchCardStatus(card, info);
  patchCardCost(card, info);
  patchCardBadge(card, info);
}

/**
 * Remove dashboard cards whose session name is no longer in currentNames.
 * @param {Element} cardsGrid
 * @param {Set<string>} currentNames
 * @returns {number} count of cards removed
 */
export function removeStaleCards(cardsGrid, currentNames) {
  const existingCards = cardsGrid.querySelectorAll(".dashboard-card[data-session]");
  let removed = 0;
  for (const card of existingCards) {
    if (!(card instanceof HTMLElement)) continue;
    if (!currentNames.has(card.dataset["session"] ?? "")) {
      card.remove();
      removed++;
    }
  }
  return removed;
}
