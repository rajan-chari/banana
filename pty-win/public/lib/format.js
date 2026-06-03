// @ts-check
// Format helpers — pure path/date/severity formatters used across the app.
// Extracted from app.js as part of tracker e0ca3757 / 8eb3a993.

/**
 * Normalize a filesystem path for comparison: backslashes -> forward,
 * lowercased (case-insensitive on Windows).
 * @param {string | null | undefined} p
 * @returns {string}
 */
export function normPath(p) {
  return p ? p.replace(/\\/g, "/").toLowerCase() : "";
}

/**
 * Turn an arbitrary path into a value safe to use as a CSS id / class
 * (alphanumeric + underscore).
 * @param {string} path
 * @returns {string}
 */
export function cssId(path) {
  return path.replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Truncate a long path to the last two segments, prefixed with ".../".
 * Paths with three or fewer segments are returned unchanged.
 * @param {string | null | undefined} p
 * @returns {string}
 */
export function truncatePath(p) {
  if (!p) return "";
  const parts = p.replace(/\\/g, "/").split("/");
  if (parts.length <= 3) return p;
  return ".../" + parts.slice(-2).join("/");
}

/**
 * Format the age of an ISO date string as "Nm" / "Nh" / "Nd".
 * Returns "-" for falsy input. Compared against Date.now().
 * @param {string | null | undefined} dateStr
 * @returns {string}
 */
export function fmtAge(dateStr) {
  if (!dateStr) return "-";
  const ms = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(ms / 3600000);
  if (hrs < 1) return `${Math.floor(ms / 60000)}m`;
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

/**
 * Format an absolute timestamp (ms since epoch) as a relative "ago" string:
 * "Ns" / "Nm" / "NhMm". Returns "-" for falsy input.
 * @param {number | null | undefined} ms
 * @returns {string}
 */
export function fmtAgo(ms) {
  if (!ms) return "-";
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h${min % 60}m`;
}

/**
 * Bucket an ISO date string into a staleness CSS class.
 *   < 3d  -> stale-green
 *   3-7d  -> stale-yellow
 *   > 7d  -> stale-red
 *   null  -> stale-green
 * @param {string | null | undefined} dateStr
 * @returns {"stale-green" | "stale-yellow" | "stale-red"}
 */
export function staleClass(dateStr) {
  if (!dateStr) return "stale-green";
  const days = (Date.now() - new Date(dateStr).getTime()) / 86400000;
  if (days > 7) return "stale-red";
  if (days > 3) return "stale-yellow";
  return "stale-green";
}

/**
 * Format an ISO date string as "MM/DD". Returns "-" for falsy input.
 * @param {string | null | undefined} dateStr
 * @returns {string}
 */
export function fmtDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
}

/**
 * Order key for severity sorting: critical < high < everything else.
 * @param {string | null | undefined} s
 * @returns {0 | 1 | 2}
 */
export function sevOrder(s) {
  return s === "critical" ? 0 : s === "high" ? 1 : 2;
}
