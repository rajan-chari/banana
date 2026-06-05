// @ts-check
//
// Right-panel coordinator. Owns tab switching for the FEED / TRACKER /
// AGENTS columns and bootstraps the tracker and agents panel runtimes
// via lifecycle objects supplied by the caller. This lets app.js read
// like a composition root for the right column.

/**
 * @typedef {Object} PanelRuntime
 * @property {() => void | Promise<void>} render
 * @property {() => void} startPolling
 * @property {() => void} [stopPolling]
 * @property {() => void} [dispose]
 */

/**
 * @typedef {Object} InitRightPanelDeps
 * @property {(id: string) => HTMLElement | null} byId
 * @property {{
 *   tracker: PanelRuntime,
 *   agents: PanelRuntime,
 * }} panels
 * @property {Document} [doc]
 */

/**
 * Wire up the right-panel tab buttons to switch active content and call
 * the relevant runtime's render() when its tab activates. Also fires off
 * each runtime's initial render and starts its polling loop so the
 * tracker badge stays current even when the feed tab is foregrounded.
 *
 * Returns a dispose() that stops polling and disposes any in-flight
 * fetches in either runtime. Useful for tests; production never calls it.
 *
 * @param {InitRightPanelDeps} deps
 */
export function initRightPanel(deps) {
  const doc = deps.doc || document;
  const tabs = doc.querySelectorAll("#right-panel-tabs .rp-tab");
  const feedContent = deps.byId("feed-content");
  const trackerContent = deps.byId("tracker-content");
  const agentsContent = deps.byId("agents-content");

  tabs.forEach((tab) => {
    if (!(tab instanceof HTMLElement)) return;
    tab.onclick = () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const panel = tab.dataset["panel"];
      if (feedContent) feedContent.classList.toggle("active", panel === "feed");
      if (trackerContent) trackerContent.classList.toggle("active", panel === "tracker");
      if (agentsContent) agentsContent.classList.toggle("active", panel === "agents");
      if (panel === "tracker") {
        // Wipe stale chrome so the tracker renderer can rebuild from scratch
        // on every tab activation; tracker-panel preserves data-wired so
        // wireControls only runs once.
        const existing = trackerContent?.querySelector(".tracker-view");
        if (existing) existing.remove();
        deps.panels.tracker.render();
      }
      if (panel === "agents") deps.panels.agents.render();
    };
  });

  // Kick off initial renders and start background polling so badges stay
  // current independent of which tab is foregrounded.
  deps.panels.tracker.render();
  deps.panels.tracker.startPolling();
  deps.panels.agents.render();
  deps.panels.agents.startPolling();

  function dispose() {
    deps.panels.tracker.dispose?.();
    deps.panels.agents.dispose?.();
  }
  return { dispose };
}
