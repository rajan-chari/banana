// @ts-check
//
// Tracker panel runtime. Owns DOM wiring, fetch, polling, localStorage,
// sort/filter state, and column-resize state. Pure rendering kernels
// live in tracker-render.js; pure filter/sort kernels live in
// tracker-filters.js. This module wires them together and returns a
// lifecycle object so app.js can compose right-panel runtimes.

import {
  renderTrackerItemHtml,
  renderTrackerHistoryEntries,
  patchTrackerItem,
  renderTrackerEmpty,
  removeTrackerEmpty,
  removeStaleTrackerItems,
  removeEmptyTrackerGroups,
  removeAllTrackerGroups,
  renderFlatTrackerItems,
  renderGroupedTrackerItems,
  buildTrackerChromeHtml,
  computeTrackerStats,
  renderTrackerChromeStats,
} from "./tracker-render.js";
import {
  filterTrackerItems as _filterTrackerItems,
  sortTrackerItems as _sortTrackerItems,
  extractFilterOptions,
} from "./tracker-filters.js";
import { staleClass, escapeHtml } from "./format.js";

const TRACKER_STATUS_ORDER = [
  "decision-pending", "investigating", "implementing", "monitoring",
  "blocked", "deferred", "merged", "closed", "ready-to-merge", "testing", "pr-up",
];
const TRACKER_DEFAULT_COLS = [22, 85, 0, 55, 55, 65, 40, 35, 40, 50];

/**
 * @typedef {HTMLElement & {
 *   _applyColWidths?: () => void,
 *   _colWidths?: number[],
 * }} TrackerContainer
 */

/**
 * @typedef {Object} TrackerPanelDeps
 * @property {(id: string) => HTMLElement | null} byId
 * @property {{ trackerItems?: any[], trackerDecisionCount?: number }} state
 * @property {typeof fetch} [fetchFn]
 * @property {typeof setInterval} [setIntervalFn]
 * @property {typeof clearInterval} [clearIntervalFn]
 * @property {number} [pollMs]
 * @property {Storage} [storage]
 */

/**
 * Build a tracker-panel runtime.
 * @param {TrackerPanelDeps} deps
 */
// eslint-disable-next-line max-lines-per-function -- init wirer; closures share sort/filter/timer state
export function createTrackerPanel(deps) {
  const fetcher = deps.fetchFn || fetch.bind(window);
  const setIntervalFn = deps.setIntervalFn || setInterval.bind(window);
  const clearIntervalFn = deps.clearIntervalFn || clearInterval.bind(window);
  const storage = deps.storage || (typeof localStorage !== "undefined" ? localStorage : null);
  const pollMs = deps.pollMs ?? 10000;

  /** @type {import('./tracker-filters.js').TrackerSortField} */
  let sortField = "status";
  /** @type {import('./tracker-filters.js').TrackerSortDir} */
  let sortDir = "asc";
  /** @type {Map<string, any>} */
  let prevItems = new Map();
  let rowNum = 0;
  /** @type {AbortController | null} */
  let inflight = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;

  function readPref(/** @type {string} */ key) {
    return storage ? storage.getItem(key) : null;
  }
  function writePref(/** @type {string} */ key, /** @type {string} */ value) {
    if (storage) storage.setItem(key, value);
  }

  function filterItems(/** @type {any[]} */ items) {
    return _filterTrackerItems(items, {
      repo: /** @type {HTMLSelectElement|null} */ (deps.byId("tracker-filter-repo"))?.value || "",
      sev: /** @type {HTMLSelectElement|null} */ (deps.byId("tracker-filter-sev"))?.value || "",
      assignee: /** @type {HTMLSelectElement|null} */ (deps.byId("tracker-filter-assignee"))?.value || "",
      cat: readPref("pty-win-tracker-cat") || "",
    });
  }

  function populateFilters(/** @type {any[]} */ items) {
    const repoSel = /** @type {HTMLSelectElement | null} */ (deps.byId("tracker-filter-repo"));
    const assigneeSel = /** @type {HTMLSelectElement | null} */ (deps.byId("tracker-filter-assignee"));
    if (!repoSel || !assigneeSel) return;
    const { repos, assignees } = extractFilterOptions(items);

    const updateOptions = (/** @type {HTMLSelectElement} */ sel, /** @type {string[]} */ options) => {
      const saved = readPref(`pty-win-${sel.id}`) || "";
      const current = sel.value;
      if (sel.options.length - 1 === options.length) return;
      const firstLabel = sel.options[0].textContent;
      sel.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>` +
        options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
      sel.value = saved || current;
    };

    updateOptions(repoSel, repos);
    updateOptions(assigneeSel, assignees);
  }

  /**
   * @param {import('./state.js').TrackerItem} item
   */
  function buildItem(item) {
    const el = document.createElement("div");
    el.className = "tracker-item";
    el.dataset["id"] = item.id;
    el.style.contain = "content";
    const ageDate = item.date_found || item.created_at;
    if (staleClass(ageDate) === "stale-red") el.classList.add("stale-row");
    if (["closed", "merged", "deferred"].includes(item.status ?? "")) el.classList.add("tracker-item-done");
    el.innerHTML = renderTrackerItemHtml(item, ++rowNum);
    el.querySelector(".tracker-item-row")?.addEventListener("click", () => {
      const wasExpanded = el.classList.contains("expanded");
      el.classList.toggle("expanded");
      if (!wasExpanded && !el.dataset["historyLoaded"]) {
        loadHistory(el, item.id);
      }
    });
    return el;
  }

  /**
   * @param {HTMLElement} el
   * @param {string} itemId
   */
  function loadHistory(el, itemId) {
    const identity = readPref("pty-win-feed-identity") || "";
    const detail = el.querySelector(".tracker-item-detail");
    if (!detail) return;
    let timeline = detail.querySelector(".tracker-timeline");
    if (!timeline) {
      timeline = document.createElement("div");
      timeline.className = "tracker-timeline";
      timeline.innerHTML = `<div class="tracker-timeline-title">History</div><div class="tracker-timeline-loading">Loading...</div>`;
      detail.appendChild(timeline);
    }
    fetcher(`/api/emcom-proxy/tracker/${itemId}`, { headers: { "X-Emcom-Name": identity } })
      .then(r => r.json())
      .then(data => {
        el.dataset["historyLoaded"] = "true";
        const history = data.history || [];
        if (history.length === 0) {
          timeline.innerHTML = `<div class="tracker-timeline-title">History</div><div class="tracker-timeline-loading">No history</div>`;
          return;
        }
        const entries = renderTrackerHistoryEntries(history);
        timeline.innerHTML = `<div class="tracker-timeline-title">History</div>${entries}`;
      })
      .catch(() => {
        timeline.innerHTML = `<div class="tracker-timeline-title">History</div><div class="tracker-timeline-loading">Failed to load</div>`;
      });
  }

  /**
   * @param {TrackerContainer} container
   */
  function initColumnResize(container) {
    const thead = /** @type {HTMLElement | null} */ (container.querySelector(".tracker-thead"));
    if (!thead) return;
    const theadEl = thead;
    const ths = /** @type {HTMLElement[]} */ ([...theadEl.querySelectorAll(".tracker-th")]);

    /** @type {number[]} */
    let colWidths;
    try {
      const saved = readPref("pty-win-tracker-col-widths");
      const parsed = saved ? JSON.parse(saved) : null;
      colWidths = (parsed && parsed.length === TRACKER_DEFAULT_COLS.length) ? parsed : [...TRACKER_DEFAULT_COLS];
    } catch { colWidths = [...TRACKER_DEFAULT_COLS]; }

    function applyWidths() {
      const tpl = colWidths.map(w => w === 0 ? "minmax(0,1fr)" : `${w}px`).join(" ");
      theadEl.style.gridTemplateColumns = tpl;
      container.querySelectorAll(".tracker-item-row").forEach(r => {
        if (r instanceof HTMLElement) r.style.gridTemplateColumns = tpl;
      });
    }

    applyWidths();
    container._applyColWidths = applyWidths;
    container._colWidths = colWidths;

    for (let i = 0; i < ths.length - 1; i++) {
      const handle = document.createElement("div");
      handle.className = "tracker-col-resize";
      ths[i].appendChild(handle);
      handle.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        handle.classList.add("dragging");
        const startX = e.clientX;
        const startW = ths[i].offsetWidth;
        const onMove = (/** @type {MouseEvent} */ ev) => {
          const delta = ev.clientX - startX;
          colWidths[i] = Math.max(30, startW + delta);
          applyWidths();
        };
        const onUp = () => {
          handle.classList.remove("dragging");
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          writePref("pty-win-tracker-col-widths", JSON.stringify(colWidths));
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      };
    }
  }

  /**
   * @param {TrackerContainer} container
   */
  function wireControls(container) {
    const c = container;
    c.querySelectorAll(".tracker-th").forEach(th => {
      if (!(th instanceof HTMLElement)) return;
      th.onclick = () => {
        const field = /** @type {import('./tracker-filters.js').TrackerSortField} */ (th.dataset["sort"] || "status");
        if (sortField === field) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortField = field;
          sortDir = "asc";
        }
        c.querySelectorAll(".tracker-th").forEach(h => {
          if (!(h instanceof HTMLElement)) return;
          h.classList.toggle("sort-active", h.dataset["sort"] === sortField);
          const arrow = h.querySelector(".sort-arrow");
          if (arrow) arrow.textContent = h.dataset["sort"] === sortField ? (sortDir === "asc" ? "\u25b4" : "\u25be") : "";
        });
        renderBody(c, filterItems(deps.state.trackerItems || []));
      };
    });

    const refreshBtn = /** @type {HTMLElement | null} */ (c.querySelector("#tracker-refresh-btn"));
    if (refreshBtn) refreshBtn.onclick = () => { render(); };

    const closedToggle = /** @type {HTMLInputElement | null} */ (c.querySelector("#tracker-closed-toggle"));
    if (closedToggle) {
      closedToggle.checked = readPref("pty-win-tracker-show-closed") === "true";
      closedToggle.onchange = () => {
        writePref("pty-win-tracker-show-closed", String(closedToggle.checked));
        render();
      };
    }

    initColumnResize(c);

    const wireFilter = (/** @type {string} */ id) => {
      const el = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (c.querySelector(`#${id}`));
      if (!el) return;
      const saved = readPref(`pty-win-${id}`);
      if (saved) el.value = saved;
      el.onchange = () => {
        writePref(`pty-win-${id}`, el.value);
        renderBody(c, filterItems(deps.state.trackerItems || []));
      };
    };
    wireFilter("tracker-filter-repo");
    wireFilter("tracker-filter-sev");
    wireFilter("tracker-filter-assignee");

    const savedCat = readPref("pty-win-tracker-cat") || "";
    c.querySelectorAll(".tracker-cat-btn").forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      if (btn.dataset["cat"] === savedCat) {
        c.querySelectorAll(".tracker-cat-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      }
      btn.onclick = () => {
        c.querySelectorAll(".tracker-cat-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        writePref("pty-win-tracker-cat", btn.dataset["cat"] ?? "");
        renderBody(c, filterItems(deps.state.trackerItems || []));
      };
    });
  }

  /**
   * @param {TrackerContainer} container
   * @param {any[]} items
   */
  function renderBody(container, items) {
    const body = /** @type {HTMLElement | null} */ (container.querySelector(".tracker-body"));
    if (!body) return;
    rowNum = 0;
    removeTrackerEmpty(body);

    if (items.length === 0) {
      renderTrackerEmpty(body);
      prevItems.clear();
      return;
    }

    const currentIds = new Set(items.map((i) => i.id));
    const newItemMap = new Map(items.map((i) => [i.id, i]));
    removeStaleTrackerItems(body, currentIds);
    removeEmptyTrackerGroups(body);

    const ops = { buildItem, patchItem: patchTrackerItem };
    if (sortField !== "status") {
      removeAllTrackerGroups(body);
      renderFlatTrackerItems(body, _sortTrackerItems(items, sortField, sortDir), ops);
    } else {
      renderGroupedTrackerItems(body, items, TRACKER_STATUS_ORDER, newItemMap, ops);
    }
    prevItems = newItemMap;
    if (container._applyColWidths) container._applyColWidths();
  }

  async function render() {
    const area = deps.byId("tracker-content");
    if (!area) return;
    const identity = readPref("pty-win-feed-identity") || "";

    let container = /** @type {TrackerContainer | null} */ (area.querySelector(".tracker-view"));
    if (!container) {
      area.innerHTML = "";
      container = /** @type {TrackerContainer} */ (document.createElement("div"));
      container.className = "tracker-view";
      container.innerHTML = buildTrackerChromeHtml();
      area.appendChild(container);
    }
    const c = container;
    if (!c.dataset["wired"]) {
      c.dataset["wired"] = "1";
      wireControls(c);
    }

    if (inflight) inflight.abort();
    inflight = new AbortController();
    const myCtl = inflight;

    const showClosed = readPref("pty-win-tracker-show-closed") === "true";
    try {
      const resp = await fetcher(
        `/api/emcom-proxy/tracker${showClosed ? "" : "?status=open"}`,
        { headers: { "X-Emcom-Name": identity }, signal: myCtl.signal },
      );
      const items = await resp.json();
      deps.state.trackerItems = items;
      const stats = computeTrackerStats(items);
      deps.state.trackerDecisionCount = stats.decisionPending;

      const badge = deps.byId("tracker-tab-badge");
      if (badge) {
        badge.textContent = stats.decisionPending > 0 ? ` (${stats.decisionPending})` : "";
        badge.classList.toggle("hidden", stats.decisionPending === 0);
      }

      renderTrackerChromeStats(c.querySelector(".tracker-chrome-stats"), stats);
      populateFilters(items);
      renderBody(c, filterItems(items));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const body = c.querySelector(".tracker-body");
      if (body) body.innerHTML = `<div class="tracker-error">// CONNECTION FAILED</div>`;
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
