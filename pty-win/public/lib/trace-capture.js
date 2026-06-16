// @ts-check

import { escapeHtml } from "./format.js";

/**
 * @typedef {Object} TraceCaptureDeps
 * @property {string} sessionName
 * @property {Document} [doc]
 * @property {typeof fetch} [fetchFn]
 * @property {{ clipboard?: { writeText?: (text: string) => Promise<void> } }} [navigator]
 * @property {{ href?: string }} [location]
 */

/**
 * @param {any} obj
 * @param {string[]} path
 * @param {any} fallback
 * @returns {any}
 */
function valueAt(obj, path, fallback) {
  let cur = obj;
  for (const key of path) {
    if (cur == null) return fallback;
    cur = cur[key];
  }
  return cur ?? fallback;
}

/**
 * @param {any} value
 * @returns {number | string}
 */
function arrayLength(value) {
  return Array.isArray(value) ? value.length : "?";
}

/**
 * @param {any} trace
 * @returns {string}
 */
export function buildTraceSummary(trace) {
  return [
    `traceVersion: ${valueAt(trace, ["traceVersion"], "?")}`,
    `capturedAt: ${valueAt(trace, ["capturedAt"], "?")}`,
    `session: ${valueAt(trace, ["session", "name"], valueAt(trace, ["session", "info", "name"], "?"))}`,
    `command: ${valueAt(trace, ["session", "command"], valueAt(trace, ["session", "info", "command"], "?"))}`,
    `cwd: ${valueAt(trace, ["session", "workingDir"], valueAt(trace, ["session", "info", "workingDir"], "?"))}`,
    `status: ${valueAt(trace, ["session", "pendingPermission"], false) ? "permission" : valueAt(trace, ["session", "status"], "?")}`,
    `pendingMessages: ${String(!!valueAt(trace, ["session", "pendingMessages"], false))}`,
    `unreadCount: ${String(valueAt(trace, ["session", "unreadCount"], 0))}`,
    `inputBoxDirty: ${String(!!valueAt(trace, ["session", "inputBoxDirty"], false))}`,
    `pollerActive: ${String(!!valueAt(trace, ["session", "pollerActive"], false))}`,
    `rawIncluded: ${String(!!valueAt(trace, ["privacy", "rawIncluded"], false))}`,
    `injections: ${arrayLength(valueAt(trace, ["histories", "injections"], null))}`,
    `stateEvents: ${arrayLength(valueAt(trace, ["histories", "stateEvents"], null))}`,
    `detectionTicks: ${arrayLength(valueAt(trace, ["histories", "detection"], null))}`,
    `build: pty-win ${valueAt(trace, ["server", "build", "version"], "?")} ${valueAt(trace, ["server", "build", "commit"], "?")} (${valueAt(trace, ["server", "build", "fellowAgentsRelease"], "dev")})`,
    `note: ${valueAt(trace, ["user", "note"], "")}`,
  ].join("\n");
}

/**
 * @param {string} sessionName
 * @returns {string}
 */
function buildTraceModalHtml(sessionName) {
  return `
    <div class="trace-modal-panel" role="dialog" aria-modal="true" aria-label="Capture trace">
      <div class="trace-modal-header">
        <div>
          <div class="trace-modal-title">Capture emcom/idle trace</div>
          <div class="trace-modal-subtitle">${escapeHtml(sessionName)}</div>
        </div>
        <button class="trace-close" type="button" aria-label="Close">&times;</button>
      </div>
      <label class="trace-label">What went wrong?
        <textarea class="trace-note" rows="3" placeholder="e.g. unread badge stayed red; Enter did not submit"></textarea>
      </label>
      <label class="trace-raw-row">
        <input class="trace-include-raw" type="checkbox">
        Include raw terminal tail after preview (may contain sensitive content)
      </label>
      <div class="trace-actions">
        <button class="trace-refresh" type="button">Preview</button>
        <button class="trace-copy" type="button">Copy summary</button>
        <button class="trace-download" type="button">Download JSON</button>
      </div>
      <div class="trace-status">Loading redacted preview...</div>
      <pre class="trace-preview"></pre>
    </div>
  `;
}

/**
 * @param {number} status
 * @param {string} sessionName
 * @param {string} pageUrl
 * @returns {string}
 */
export function traceFetchErrorMessage(status, sessionName, pageUrl) {
  if (status === 404) {
    return [
      "Trace endpoint missing on this pty-win server (404).",
      "Refresh the page, verify the URL/port, or restart pty-win with build >= daf196b.",
      `Page: ${pageUrl || "unknown"}`,
      `Session: ${sessionName}`,
    ].join(" ");
  }
  return `trace endpoint returned ${status}`;
}

/**
 * @param {typeof fetch} fetchFn
 * @param {string} sessionName
 * @param {string} note
 * @param {boolean} includeRaw
 * @param {string} pageUrl
 */
async function fetchTrace(fetchFn, sessionName, note, includeRaw, pageUrl) {
  const res = await fetchFn(`/api/debug/sessions/${encodeURIComponent(sessionName)}/trace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note, includeRaw }),
  });
  if (!res.ok) throw new Error(traceFetchErrorMessage(res.status, sessionName, pageUrl));
  return res.json();
}

/**
 * @param {Document} doc
 * @param {any} trace
 * @param {string} sessionName
 */
function downloadTrace(doc, trace, sessionName) {
  const text = JSON.stringify(trace, null, 2);
  const a = doc.createElement("a");
  a.download = `pty-win-trace-${sessionName}-${Date.now()}.json`;
  a.href = `data:application/json;charset=utf-8,${encodeURIComponent(text)}`;
  a.click();
}

/**
 * @param {TraceCaptureDeps} deps
 */
export function showTraceCaptureModal(deps) {
  const doc = deps.doc || (typeof document !== "undefined" ? document : null);
  const fetchFn = deps.fetchFn || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
  if (!doc || !fetchFn) return;
  doc.querySelectorAll(".trace-modal-overlay").forEach((el) => el.remove());
  const overlay = doc.createElement("div");
  overlay.className = "trace-modal-overlay";
  overlay.innerHTML = buildTraceModalHtml(deps.sessionName);
  doc.body.appendChild(overlay);
  wireTraceModal({ ...deps, doc, fetchFn, overlay });
}

/**
 * @param {TraceCaptureDeps & { doc: Document, fetchFn: typeof fetch, overlay: HTMLElement }} deps
 */
function wireTraceModal(deps) {
  const note = /** @type {HTMLTextAreaElement | null} */ (deps.overlay.querySelector(".trace-note"));
  const raw = /** @type {HTMLInputElement | null} */ (deps.overlay.querySelector(".trace-include-raw"));
  const status = /** @type {HTMLElement | null} */ (deps.overlay.querySelector(".trace-status"));
  const preview = /** @type {HTMLElement | null} */ (deps.overlay.querySelector(".trace-preview"));
  /** @type {any} */
  let latestTrace = null;
  const close = () => deps.overlay.remove();
  const pageUrl = deps.location?.href || deps.doc.defaultView?.location?.href || "";
  const refresh = async () => {
    try {
      if (status) status.textContent = "Refreshing trace preview...";
      latestTrace = await fetchTrace(deps.fetchFn, deps.sessionName, note?.value || "", !!raw?.checked, pageUrl);
      if (preview) preview.textContent = buildTraceSummary(latestTrace);
      if (status) status.textContent = latestTrace?.privacy?.rawIncluded ? "Preview includes raw terminal tail." : "Redacted preview. Raw terminal tail omitted.";
    } catch (err) {
      if (status) status.textContent = `Trace unavailable: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
  deps.overlay.querySelector(".trace-close")?.addEventListener("click", close);
  deps.overlay.querySelector(".trace-refresh")?.addEventListener("click", () => { void refresh(); });
  deps.overlay.querySelector(".trace-copy")?.addEventListener("click", () => {
    const text = latestTrace ? buildTraceSummary(latestTrace) : preview?.textContent || "";
    void deps.navigator?.clipboard?.writeText?.(text);
  });
  deps.overlay.querySelector(".trace-download")?.addEventListener("click", () => {
    if (latestTrace) downloadTrace(deps.doc, latestTrace, deps.sessionName);
  });
  deps.overlay.addEventListener("mousedown", (e) => { if (e.target === deps.overlay) close(); });
  void refresh();
}
