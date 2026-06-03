// @ts-check
// Tracker filter + sort — pure functions.
// Extracted from app.js as part of tracker e0ca3757 / 8eb3a993.
// app.js wraps these and supplies DOM/localStorage state at call time.

import { sevOrder } from "./format.js";

/** @typedef {import('./state.js').TrackerItem} TrackerItem */

/** @typedef {{ repo?: string, sev?: string, assignee?: string, cat?: string }} TrackerFilters */

/** @typedef {"ref" | "title" | "assignee" | "opened_by" | "responders" | "severity" | "age" | "updated" | "status"} TrackerSortField */
/** @typedef {"asc" | "desc"} TrackerSortDir */

/**
 * Derive the option lists used to populate filter `<select>`s from the
 * current tracker items: distinct repo values and distinct assignee
 * values, alphabetically sorted, with falsy/empty entries excluded.
 *
 * @param {TrackerItem[]} items
 * @returns {{ repos: string[], assignees: string[] }}
 */
export function extractFilterOptions(items) {
  const repos = [...new Set(items.map((i) => i.repo).filter(Boolean))].sort();
  const assignees = [...new Set(items.map((i) => i.assigned_to).filter(Boolean))].sort();
  return {
    repos: /** @type {string[]} */ (repos),
    assignees: /** @type {string[]} */ (assignees),
  };
}

/**
 * Filter tracker items by repo, severity, assignee, and label/category.
 * Empty/missing filter values are no-ops (don't restrict).
 *
 * @param {TrackerItem[]} items
 * @param {TrackerFilters} filters
 * @returns {TrackerItem[]}
 */
export function filterTrackerItems(items, filters) {
  const repo = filters.repo || "";
  const sev = filters.sev || "";
  const assignee = filters.assignee || "";
  const cat = filters.cat || "";
  return items.filter((i) =>
    (!repo || i.repo === repo) &&
    (!sev || i.severity === sev) &&
    (!assignee || i.assigned_to === assignee) &&
    (!cat || (Array.isArray(i.labels) && i.labels.includes(cat)))
  );
}

/**
 * Sort tracker items by the given field/direction. When sortField is "status"
 * the input order is preserved (callers handle status grouping).
 *
 * Does not mutate the input array.
 *
 * @param {TrackerItem[]} items
 * @param {TrackerSortField} sortField
 * @param {TrackerSortDir} sortDir
 * @returns {TrackerItem[]}
 */
/**
 * Project a tracker item to the value that should be used for a given sort field.
 * Returns a value comparable to the equivalent projection of another item.
 * Numbers compare numerically; strings compare via locale-aware compare in the caller.
 *
 * @param {TrackerItem} item
 * @param {Exclude<TrackerSortField, "status">} field
 * @returns {string | number}
 */
function trackerSortKey(item, field) {
  switch (field) {
    case "ref": return `${item.repo}#${item.number}`;
    case "title": return item.title || "";
    case "assignee": return item.assigned_to || "";
    case "opened_by": return item.opened_by || "";
    case "responders": return (item.responders || []).join(",");
    case "severity": return sevOrder(item.severity);
    case "age": return new Date(item.created_at || 0).getTime();
    case "updated": return new Date(item.updated_at || 0).getTime();
  }
}

/**
 * Compare two tracker sort keys. Strings → locale-aware compare; numbers → subtraction.
 * @param {string | number} a
 * @param {string | number} b
 * @returns {number}
 */
function compareSortKeys(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Sort tracker items by the chosen field/direction.
 * For `sortField === "status"` the input is returned unchanged
 * (the caller handles status grouping separately).
 *
 * @param {TrackerItem[]} items
 * @param {TrackerSortField} sortField
 * @param {TrackerSortDir} sortDir
 * @returns {TrackerItem[]}
 */
export function sortTrackerItems(items, sortField, sortDir) {
  if (sortField === "status") return items;
  const dir = sortDir === "asc" ? 1 : -1;
  const sorted = [...items];
  sorted.sort((a, b) => dir * compareSortKeys(trackerSortKey(a, sortField), trackerSortKey(b, sortField)));
  return sorted;
}
