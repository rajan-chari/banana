// @ts-check
// Tracker filter + sort — pure functions.
// Extracted from app.js as part of tracker e0ca3757 / 8eb3a993.
// app.js wraps these and supplies DOM/localStorage state at call time.

import { sevOrder } from "./format.js";

/** @typedef {{
 *   id: string,
 *   repo?: string,
 *   number?: number,
 *   title?: string,
 *   assigned_to?: string,
 *   opened_by?: string,
 *   responders?: string[],
 *   severity?: string,
 *   labels?: string[],
 *   created_at?: string,
 *   updated_at?: string,
 *   [key: string]: unknown,
 * }} TrackerItem */

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
export function sortTrackerItems(items, sortField, sortDir) {
  if (sortField === "status") return items;
  const sorted = [...items];
  const dir = sortDir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (sortField) {
      case "ref":
        return dir * (`${a.repo}#${a.number}`).localeCompare(`${b.repo}#${b.number}`);
      case "title":
        return dir * (a.title || "").localeCompare(b.title || "");
      case "assignee":
        return dir * (a.assigned_to || "").localeCompare(b.assigned_to || "");
      case "opened_by":
        return dir * (a.opened_by || "").localeCompare(b.opened_by || "");
      case "responders":
        return dir * ((a.responders || []).join(",")).localeCompare((b.responders || []).join(","));
      case "severity":
        return dir * (sevOrder(a.severity) - sevOrder(b.severity));
      case "age":
        return dir * (new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
      case "updated":
        return dir * (new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime());
      default:
        return 0;
    }
  });
  return sorted;
}
