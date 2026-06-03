// @ts-check
// Pure HTML renderers for tracker items. Extracted from app.js so the
// XSS-escape contract can be regression-tested. Returns string-encoded
// HTML; the caller is responsible for assigning it to innerHTML and
// wiring up element-level concerns (className, dataset, event handlers).
//
// Companion to tracker 8eb3a993 (modularize app.js, closed) and
// a396a9a8 (XSS hardening, closed). Adding focused render extractions
// here is the rubber-duck-endorsed pattern: narrow, testable kernels
// for the highest-risk DOM surface.

import { escapeHtml, fmtAge, fmtDate, staleClass } from "./format.js";

/** @typedef {import('./state.js').TrackerItem} TrackerItem */
/** @typedef {import('./state.js').TrackerHistoryEntry} TrackerHistoryEntry */

/**
 * Build the GitHub URL fragment "org/name" for a tracker item.
 * Tracker items historically store either the bare repo name
 * (e.g. "teams.net") or the fully-qualified "org/name"
 * (e.g. "microsoft/teams-cli"). For unscoped names we default
 * the org to "microsoft". For already-qualified names we use
 * them as-is to avoid double-prefixing.
 *
 * @param {string | null | undefined} repo
 * @returns {string}    "" if repo is missing
 */
export function githubOrgRepo(repo) {
  if (!repo) return "";
  return repo.includes("/") ? repo : `microsoft/${repo}`;
}

/**
 * Map a severity value to its CSS class. Unknown/missing -> sev-normal.
 * @param {string | null | undefined} severity
 * @returns {string}
 */
export function severityClass(severity) {
  if (severity === "critical") return "sev-critical";
  if (severity === "high") return "sev-high";
  if (severity === "low") return "sev-low";
  return "sev-normal";
}

/**
 * Render the inner HTML for a single tracker item row + detail panel.
 * Every user-controlled field is escaped via escapeHtml; the caller
 * may assign the result directly to el.innerHTML.
 *
 * @param {TrackerItem} item   tracker item from the API
 * @param {number} rowNum      the 1-based row number to display
 * @returns {string}
 */
export function renderTrackerItemHtml(item, rowNum) {
  const sevClass = severityClass(item.severity);
  const ageDate = item.date_found || item.created_at;
  const ageStale = staleClass(ageDate);
  const activeStale = item.last_github_activity ? staleClass(item.last_github_activity) : "";
  const isClosedLike = ["closed", "merged", "deferred"].includes(item.status ?? "");

  const refHtml = item.number
    ? `<span class="tracker-ref-repo">${escapeHtml(item.repo)}</span><span class="tracker-ref-num">#${escapeHtml(item.number)}</span>`
    : `<span class="tracker-ref-repo">${escapeHtml(item.repo)}</span>`;

  return `
    <div class="tracker-item-row">
      <span class="tracker-row-num">${rowNum}</span>
      <span class="tracker-ref">${refHtml}</span>
      <span class="tracker-item-title">${escapeHtml(item.title)}${item.github_author ? `<span class="tracker-author-tag">by ${escapeHtml(item.github_author)}</span>` : ""}${isClosedLike ? `<span class="tracker-closed-badge badge-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>` : ""}</span>
      <span class="tracker-assignee">${item.assigned_to ? "@" + escapeHtml(item.assigned_to) : ""}</span>
      <span class="tracker-opened-by">${escapeHtml(item.opened_by || "")}</span>
      <span class="tracker-responders">${Array.isArray(item.responders) && item.responders.length ? escapeHtml(item.responders.join(", ")) : ""}</span>
      <span class="tracker-severity ${sevClass}">${escapeHtml(item.severity || "normal")}</span>
      <span class="tracker-age ${ageStale}">${fmtAge(ageDate)}</span>
      <span class="tracker-activity ${activeStale}">${item.last_github_activity ? fmtAge(item.last_github_activity) : "-"}</span>
      <span class="tracker-updated">${fmtDate(item.updated_at)}</span>
    </div>
    <div class="tracker-item-detail">
      ${item.number ? `<div class="tracker-detail-section"><a class="tracker-gh-link" href="https://github.com/${escapeHtml(githubOrgRepo(item.repo))}/issues/${escapeHtml(item.number)}" target="_blank">${escapeHtml(item.repo)}#${escapeHtml(item.number)} on GitHub &#x2197;</a></div>` : ""}
      ${item.blocker ? `<div class="tracker-blocker-badge">${escapeHtml(item.blocker)}</div>` : ""}
      ${item.findings ? `<div class="tracker-detail-section"><div class="tracker-detail-label">Findings</div><div class="tracker-detail-value">${escapeHtml(item.findings)}</div></div>` : ""}
      ${item.decision ? `<div class="tracker-detail-section"><div class="tracker-detail-label">Decision</div><div class="tracker-detail-value">${escapeHtml(item.decision)}</div></div>` : ""}
      ${item.decision_rationale ? `<div class="tracker-detail-section"><div class="tracker-detail-label">Rationale</div><div class="tracker-detail-value">${escapeHtml(item.decision_rationale)}</div></div>` : ""}
      ${item.notes ? `<div class="tracker-detail-section"><div class="tracker-detail-label">Notes</div><div class="tracker-detail-value">${escapeHtml(item.notes)}</div></div>` : ""}
      ${item.labels?.length ? `<div class="tracker-detail-section">${item.labels.map(/** @param {string} l */ (l) => `<span class="tracker-label">${escapeHtml(l)}</span>`).join(" ")}</div>` : ""}
      <div class="tracker-detail-meta">
        <span>Opened by <strong>${escapeHtml(item.opened_by || item.github_author || item.created_by || "?")}</strong></span>
        ${item.github_last_commenter ? `<span>Last reply: <strong>${escapeHtml(item.github_last_commenter)}</strong></span>` : ""}
        <span>${item.created_at ? new Date(item.created_at).toLocaleString() : ""}</span>
        <span>Updated ${item.updated_at ? new Date(item.updated_at).toLocaleString() : ""}</span>
        <span>Status: ${escapeHtml(item.status)}</span>
      </div>
    </div>`;
}

/**
 * Render the inner HTML for the tracker history timeline -- one
 * `<div class="tracker-timeline-entry">` per history entry, joined.
 * Returns "" for an empty history. The caller wraps with the
 * "History" title and either-state.
 *
 * @param {TrackerHistoryEntry[]} history
 * @returns {string}
 */
export function renderTrackerHistoryEntries(history) {
  if (!Array.isArray(history) || history.length === 0) return "";

  const fmtTs = (/** @type {string | undefined} */ ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return history.map(h => {
    let what = "";
    if (h.field === "status") {
      what = `<span class="tl-arrow">\u2192</span> ${escapeHtml(h.new_value)}`;
    } else if (h.field === "assigned_to") {
      what = `assigned \u2192 ${escapeHtml(h.new_value || "unassigned")}`;
    } else if (h.field === "blocker") {
      what = h.new_value ? `blocker: ${escapeHtml(h.new_value)}` : "blocker cleared";
    } else {
      what = `${escapeHtml(h.field)}: ${escapeHtml(h.new_value || "(cleared)")}`;
    }
    if (h.comment) what += ` <span class="tl-comment">${escapeHtml(h.comment)}</span>`;

    return `<div class="tracker-timeline-entry">
      <span class="tracker-timeline-date">${fmtTs(h.changed_at)}</span>
      <span class="tracker-timeline-who">[${escapeHtml(h.changed_by)}]</span>
      <span class="tracker-timeline-what">${what}</span>
    </div>`;
  }).join("");
}

/**
 * Update simple text-only fields on a rendered tracker row.
 * Skips writes when textContent is already correct (avoids triggering
 * unnecessary mutation observers / reflows).
 *
 * @param {Element} el
 * @param {TrackerItem} item
 */
function patchTextFields(el, item) {
  const titleEl = el.querySelector(".tracker-item-title");
  if (titleEl && titleEl.textContent !== item.title) titleEl.textContent = item.title ?? "";

  const assigneeEl = el.querySelector(".tracker-assignee");
  const assigneeText = item.assigned_to ? "@" + item.assigned_to : "";
  if (assigneeEl && assigneeEl.textContent !== assigneeText) assigneeEl.textContent = assigneeText;

  const openedByEl = el.querySelector(".tracker-opened-by");
  if (openedByEl) openedByEl.textContent = item.opened_by || "";

  const respondersEl = el.querySelector(".tracker-responders");
  if (respondersEl) respondersEl.textContent = Array.isArray(item.responders) && item.responders.length ? item.responders.join(", ") : "";

  const updEl = el.querySelector(".tracker-updated");
  if (updEl) updEl.textContent = fmtDate(item.updated_at);
}

/**
 * Update the severity badge text + sev-* class. Uses severityClass()
 * so the patched row stays consistent with renderTrackerItemHtml --
 * the prior inline ternary missed "low" (always rendered sev-normal).
 *
 * @param {Element} el
 * @param {TrackerItem} item
 */
function patchSeverityField(el, item) {
  const sevEl = el.querySelector(".tracker-severity");
  if (!sevEl) return;
  const sevText = item.severity || "normal";
  if (sevEl.textContent === sevText) return;
  sevEl.textContent = sevText;
  sevEl.className = `tracker-severity ${severityClass(item.severity)}`;
}

/**
 * Update the age + last-activity fields with their text + stale-* class.
 *
 * @param {Element} el
 * @param {TrackerItem} item
 */
function patchAgeFields(el, item) {
  const ageDate = item.date_found || item.created_at;
  const ageEl = el.querySelector(".tracker-age");
  if (ageEl) { ageEl.textContent = fmtAge(ageDate); ageEl.className = `tracker-age ${staleClass(ageDate)}`; }
  const actEl = el.querySelector(".tracker-activity");
  if (actEl) {
    actEl.textContent = item.last_github_activity ? fmtAge(item.last_github_activity) : "-";
    actEl.className = `tracker-activity ${item.last_github_activity ? staleClass(item.last_github_activity) : ""}`;
  }
}

/**
 * Toggle row-level classes (`stale-row`, `tracker-item-done`) based on status/age.
 *
 * @param {Element} el
 * @param {TrackerItem} item
 */
function patchRowClasses(el, item) {
  const ageDate = item.date_found || item.created_at;
  el.classList.toggle("stale-row", staleClass(ageDate) === "stale-red");
  el.classList.toggle("tracker-item-done", ["closed", "merged", "deferred"].includes(item.status ?? ""));
}

/**
 * Patch a previously-rendered tracker item row in-place with fresh data.
 * Companion to renderTrackerItemHtml -- the row is built once with that
 * function, then patched here on subsequent renders to avoid full
 * innerHTML rebuilds (preserves focus, scroll, and prevents flicker).
 *
 * Composed of four focused field-group patchers -- each is independently
 * testable in happy-dom.
 *
 * @param {Element} el
 * @param {TrackerItem} item
 */
export function patchTrackerItem(el, item) {
  patchTextFields(el, item);
  patchSeverityField(el, item);
  patchAgeFields(el, item);
  patchRowClasses(el, item);
}