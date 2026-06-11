// @ts-check
//
// Pane runtime — extracted from app.js as Phase 4c of the
// modularization campaign. Owns the lifecycle of an individual
// pane: creation, terminal entry (xterm/fit/web-links/key-handlers),
// chrome (topbar, statusbar, toggle), focus, status updates, and the
// fit-resize lifecycle.
//
// Inter-module callbacks (closeFocusedPane, navigatePanes, etc.) are
// injected as `actions` — never imported — to avoid cycles with the
// lifecycle/nav modules that will be extracted next. The factory
// also owns the per-session paste-guard set so a Ctrl+V handler in
// one pane never suppresses onData from another.

import { escapeHtml, truncatePath } from "./format.js";
import { resolveCtrlShiftKeyAction } from "./key-shortcuts.js";
import { getPaneGroup } from "./pane-groups.js";

const ALLOWED_STATUS_DOT = new Set(["starting", "busy", "idle", "dead"]);

/**
 * @param {string | undefined} status
 * @returns {string}
 */
function normaliseStatusDot(status) {
  return status && ALLOWED_STATUS_DOT.has(status) ? status : "starting";
}

/**
 * @param {string} groupName
 * @param {string | null | undefined} focusedPane
 * @param {any} info
 * @returns {string}
 */
function paneClassName(groupName, focusedPane, info) {
  const classes = ["pane"];
  if (groupName === focusedPane) classes.push("focused");
  if (info?.status === "dead") classes.push("dead");
  if (info?.pendingPermission) classes.push("pending-permission");
  return classes.join(" ");
}

/**
 * @typedef {Object} PaneRuntimeDeps
 * @property {any} state            Shared state (sessions/activePaneTypes/terminals/ws/focusedPane/workspaces/activeWorkspaceId).
 * @property {{ byName: (name: string) => any }} sessions
 * @property {{ set: (name: string, type: "claude"|"pwsh") => void }} activePaneTypes
 * @property {(id: string) => HTMLElement} byId
 * @property {Document} [doc]
 * @property {{
 *   requestAnimationFrame?: (cb: () => void) => number,
 *   setTimeout?: (cb: () => void, ms: number) => any,
 *   ResizeObserver?: typeof ResizeObserver,
 *   fetch?: typeof fetch,
 *   navigator?: { clipboard?: { readText: () => Promise<string> } },
 *   localStorage?: { setItem: (k: string, v: string) => void },
 *   win?: Window,
 * }} [env]
 * @property {{
 *   Terminal: any,
 *   FitAddon: any,
 *   WebLinksAddon: any,
 *   theme: any,
 * }} xterm
 * @property {{
 *   openQuickOpen: () => void,
 *   switchToDashboard: () => void,
 *   switchToWorkspace: (id: string) => void,
 *   toggleSidebar: () => void,
 *   closeFocusedPane: () => void,
 *   navigatePanes: (k: string) => void,
 *   resizeFocused: (k: string) => void,
 *   killSession: (name: string) => void,
 *   showPaneContextMenu: (e: MouseEvent, groupName: string) => void,
 *   startPaneDrag: (e: MouseEvent, groupName: string) => void,
 *   getAiPresetForCommand: (cmd: string) => { name: string, icon: string } | null,
 *   renderActiveWorkspace: () => void,
 * }} actions
 * @property {{
 *   focus: {
 *     set: (name: string | null) => boolean,
 *   },
 * }} helpers
 */

/**
 * @param {PaneRuntimeDeps} deps
 */
// eslint-disable-next-line max-lines-per-function, complexity -- factory groups ~12 mutually-recursive pane lifecycle helpers; complexity comes from switch in handleCtrlShiftKey + branchy env shims; splitting forces leaking state/actions/env across modules
export function createPaneRuntime(deps) {
  const doc = deps.doc || (typeof document !== "undefined" ? document : null);
  const env = deps.env || {};
  const raf = env.requestAnimationFrame || (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : (/** @type {() => void} */ cb) => { cb(); return 0; });
  const setTimeoutFn = env.setTimeout || (typeof setTimeout !== "undefined" ? setTimeout : (cb, _ms) => cb());
  const ResizeObs = env.ResizeObserver || (typeof ResizeObserver !== "undefined" ? ResizeObserver : null);
  const fetchFn = env.fetch || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
  const navi = env.navigator || (typeof navigator !== "undefined" ? navigator : null);
  const storage = env.localStorage || (typeof localStorage !== "undefined" ? localStorage : null);
  const win = env.win || (typeof window !== "undefined" ? window : null);
  let paneStateRefreshSeq = 0;

  // Per-session paste guard: when the Ctrl+V handler reads the clipboard and
  // sends the payload via WS, the terminal's own onData also fires for the
  // pasted text — set the guard while the clipboard read is in flight so we
  // don't double-send. Keyed by session so a paste in pane A never
  // suppresses data from pane B.
  /** @type {Set<string>} */
  const pasteGuards = new Set();

  /**
   * Handle Ctrl+Shift+<key> shortcuts inside an xterm pane.
   * @param {KeyboardEvent} e
   * @param {string} sessionName
   * @returns {boolean} false if handled (suppress default), true otherwise
   */
  function handleCtrlShiftKey(e, sessionName) {
    const action = resolveCtrlShiftKeyAction(e.key);
    switch (action.type) {
      case "clearInputDirty":
        deps.state.ws?.send(JSON.stringify({ type: "clear-input-dirty", session: sessionName }));
        return false;
      case "switchToDashboard": deps.actions.switchToDashboard(); return false;
      case "closeFocusedPane": deps.actions.closeFocusedPane(); return false;
      case "toggleSidebar": deps.actions.toggleSidebar(); return false;
      case "switchWorkspace":
        if (deps.state.workspaces[action.index]) deps.actions.switchToWorkspace(deps.state.workspaces[action.index].id);
        return false;
      case "resize": deps.actions.resizeFocused(action.direction); return false;
      case "noop": return false;
      case "passthrough": return true;
    }
    return true;
  }

  /**
   * Handle Ctrl+<key> (no shift) shortcuts inside an xterm pane.
   * @param {KeyboardEvent} e
   * @param {string} sessionName
   * @returns {boolean} false if handled (suppress default), true otherwise
   */
  function handleCtrlOnlyKey(e, sessionName) {
    if (e.key === "p") {
      deps.actions.openQuickOpen();
      return false;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      deps.actions.navigatePanes(e.key);
      return false;
    }
    if (e.key === "v") {
      pasteGuards.add(sessionName);
      const read = navi?.clipboard?.readText();
      if (read && typeof read.then === "function") {
        read.then((text) => {
          if (text) deps.state.ws?.send(JSON.stringify({ type: "input", session: sessionName, payload: text }));
        }).catch(() => {}).finally(() => {
          setTimeoutFn(() => { pasteGuards.delete(sessionName); }, 50);
        });
      } else {
        setTimeoutFn(() => { pasteGuards.delete(sessionName); }, 50);
      }
      return false;
    }
    return true;
  }

  /**
   * @param {"claude" | "pwsh"} activeType
   * @returns {string}
   */
  function buildPaneToggleHtml(activeType) {
    const claudeActive = activeType === "claude" ? "active" : "";
    const pwshActive = activeType === "pwsh" ? "active" : "";
    return `<span class="pane-toggle">
        <button class="toggle-btn toggle-claude ${claudeActive}" title="Claude">C</button>
        <button class="toggle-btn toggle-pwsh ${pwshActive}" title="PowerShell">&gt;_</button>
      </span>`;
  }

  /**
   * @param {HTMLElement} topbar
   * @param {string} groupName
   */
  function attachPaneToggleHandlers(topbar, groupName) {
    topbar.querySelector(".toggle-claude")?.addEventListener("click", (e) => {
      e.stopPropagation();
      switchPaneType(groupName, "claude");
    });
    topbar.querySelector(".toggle-pwsh")?.addEventListener("click", (e) => {
      e.stopPropagation();
      switchPaneType(groupName, "pwsh");
    });
  }

  /**
   * Build the top bar of a pane.
   * @param {{ activeType?: string, claude?: string, pwsh?: string } | undefined} pg
   * @param {"claude" | "pwsh"} activeType
   * @param {any} info
   * @param {string} groupName
   * @param {boolean} hasBoth
   * @param {string} activeSessionName
   * @returns {HTMLElement}
   */
  function buildPaneTopbar(pg, activeType, info, groupName, hasBoth, activeSessionName) {
    if (!doc) throw new Error("pane-runtime: no document");
    const topbar = doc.createElement("div");
    topbar.className = "pane-topbar";

    const toggleHtml = hasBoth ? buildPaneToggleHtml(activeType) : "";
    const identityHtml = info?.emcomIdentity
      ? `<span class="pane-identity">${escapeHtml(info.emcomIdentity)}</span>`
      : "";
    const aiPreset = (activeType !== "pwsh" && info?.command)
      ? deps.actions.getAiPresetForCommand(info.command)
      : null;
    const presetBadge = aiPreset
      ? `<span class="pane-ai-preset" title="${escapeHtml(aiPreset.name)}">${escapeHtml(aiPreset.icon)} ${escapeHtml(aiPreset.name)}</span>`
      : "";
    const wd = info?.workingDir || "";
    topbar.innerHTML = `
      <span class="pane-name">${escapeHtml(groupName)}</span>
      ${toggleHtml}
      ${presetBadge}
      <button class="pane-action state" title="Diagnostics" type="button">ⓘ</button>
      <span class="pane-action cmd-tag code" title="Open in VS Code">&lt;/&gt;</span>
      ${identityHtml}
      <span class="pane-cwd" title="${escapeHtml(wd)}">${escapeHtml(truncatePath(wd))}</span>
      <span class="pane-close" title="Kill session">&times;</span>
    `;

    if (hasBoth) attachPaneToggleHandlers(topbar, groupName);
    attachPaneTopbarActions(topbar, groupName, info, activeSessionName);
    return topbar;
  }

  /**
   * Wire the code button, close button, identity click, right-click
   * context menu and topbar drag handler.
   * @param {HTMLElement} topbar
   * @param {string} groupName
   * @param {any} info
   * @param {string} activeSessionName
   */
  function attachPaneTopbarActions(topbar, groupName, info, activeSessionName) {
    const codeBtn = /** @type {HTMLElement | null} */ (topbar.querySelector(".pane-action.code"));
    if (codeBtn) codeBtn.onclick = (e) => {
      e.stopPropagation();
      if (doc?.fullscreenElement) doc.exitFullscreen().catch(() => {});
      if (fetchFn) fetchFn("/api/open-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: info?.workingDir || "" }),
      });
    };

    const stateBtn = /** @type {HTMLElement | null} */ (topbar.querySelector(".pane-action.state"));
    if (stateBtn) stateBtn.onclick = (e) => {
      e.stopPropagation();
      showPaneStatePopover(topbar, activeSessionName);
    };

    const closeBtn = /** @type {HTMLElement | null} */ (topbar.querySelector(".pane-close"));
    if (closeBtn) closeBtn.onclick = (e) => {
      e.stopPropagation();
      deps.actions.killSession(activeSessionName);
    };

    topbar.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deps.actions.showPaneContextMenu(e, groupName);
    });

    const identityEl = /** @type {HTMLElement | null} */ (topbar.querySelector(".pane-identity"));
    if (identityEl && info?.emcomIdentity) {
      const identity = info.emcomIdentity;
      identityEl.style.cursor = "pointer";
      identityEl.title = `Switch feed to ${identity}`;
      identityEl.onclick = (e) => {
        e.stopPropagation();
        storage?.setItem("pty-win-feed-identity", identity);
        win?.dispatchEvent(new CustomEvent("feed-identity-change", { detail: identity }));
      };
    }

    topbar.addEventListener("mousedown", (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t && t.closest("button, .pane-close, .pane-action, .pane-identity, .toggle-btn")) return;
      if (e.button !== 0) return;
      deps.actions.startPaneDrag(e, groupName);
    });
  }

  /**
   * @param {HTMLElement} topbar
   * @param {string} sessionName
   */
  function showPaneStatePopover(topbar, sessionName) {
    if (!doc) return;
    doc.querySelectorAll(".pane-state-popover").forEach((el) => el.remove());
    const pane = topbar.closest(".pane");
    if (!pane) return;
    const pop = doc.createElement("div");
    pop.className = "pane-state-popover";
    pop.innerHTML = buildPaneStateShell("Loading session state...");
    attachPaneStateActions(pop, sessionName);
    pane.appendChild(pop);
    if (!fetchFn) {
      pop.innerHTML = buildPaneStateShell("Debug state unavailable: fetch is not available.");
      attachPaneStateActions(pop, sessionName);
      return;
    }
    startPaneStateRefresh(pop, sessionName);
  }

  /**
   * @param {string} bodyHtml
   * @returns {string}
   */
  function buildPaneStateShell(bodyHtml) {
    return `
      <div class="pane-state-actions">
        <button class="pane-state-refresh" type="button" title="Refresh state panel">↻</button>
        <button class="pane-state-close" type="button" title="Close state panel">&times;</button>
      </div>
      <div class="pane-state-body">${bodyHtml}</div>
    `;
  }

  /**
   * @param {HTMLElement} pop
   * @param {string} sessionName
   */
  function attachPaneStateActions(pop, sessionName) {
    const refresh = /** @type {HTMLElement | null} */ (pop.querySelector(".pane-state-refresh"));
    if (refresh) refresh.onclick = (e) => {
      e.stopPropagation();
      startPaneStateRefresh(pop, sessionName);
    };
    const close = /** @type {HTMLElement | null} */ (pop.querySelector(".pane-state-close"));
    if (close) close.onclick = (e) => {
      e.stopPropagation();
      pop.dataset["refreshToken"] = "";
      pop.remove();
    };
  }

  /**
   * @param {HTMLElement} pop
   * @param {string} sessionName
   */
  function startPaneStateRefresh(pop, sessionName) {
    const token = String(++paneStateRefreshSeq);
    pop.dataset["refreshToken"] = token;
    refreshPaneStatePopover(pop, sessionName, token);
  }

  /**
   * @param {HTMLElement} pop
   * @param {string} sessionName
   * @param {string} token
   */
  function refreshPaneStatePopover(pop, sessionName, token) {
    if (!fetchFn) return;
    const body = pop.querySelector(".pane-state-body");
    if (body) body.textContent = "Refreshing session state...";
    fetchPaneState(sessionName)
      .then((data) => {
        if (!isCurrentPaneStatePopover(pop, token)) return;
        pop.innerHTML = buildPaneStateShell(buildPaneStateHtml(sessionName, data));
        attachPaneStateActions(pop, sessionName);
        schedulePaneStateRefresh(pop, sessionName, token);
      })
      .catch((err) => {
        if (!isCurrentPaneStatePopover(pop, token)) return;
        pop.innerHTML = buildPaneStateShell(`Debug state unavailable: ${escapeHtml(err instanceof Error ? err.message : String(err))}`);
        attachPaneStateActions(pop, sessionName);
        schedulePaneStateRefresh(pop, sessionName, token);
      });
  }

  /**
   * @param {HTMLElement} pop
   * @param {string} token
   * @returns {boolean}
   */
  function isCurrentPaneStatePopover(pop, token) {
    return !!pop.parentElement && pop.dataset["refreshToken"] === token;
  }

  /**
   * @param {HTMLElement} pop
   * @param {string} sessionName
   * @param {string} token
   */
  function schedulePaneStateRefresh(pop, sessionName, token) {
    setTimeoutFn(() => {
      if (isCurrentPaneStatePopover(pop, token)) refreshPaneStatePopover(pop, sessionName, token);
    }, 1000);
  }

  /**
   * @param {string} sessionName
   */
  async function fetchPaneState(sessionName) {
    if (!fetchFn) throw new Error("fetch is not available");
    const name = encodeURIComponent(sessionName);
    const [stateRes, injectionRes, detectionRes] = await Promise.all([
      fetchFn(`/api/debug/sessions/${name}`),
      fetchFn(`/api/debug/sessions/${name}/injections`),
      fetchFn(`/api/debug/sessions/${name}/detection/history`),
    ]);
    if (!stateRes.ok) throw new Error(`debug endpoint returned ${stateRes.status}`);
    return {
      state: await stateRes.json(),
      injections: injectionRes.ok ? await injectionRes.json() : null,
      detection: detectionRes.ok ? await detectionRes.json() : null,
    };
  }

  /**
   * @param {string} sessionName
   * @param {{ state: any, injections: any, detection: any }} data
   * @returns {string}
   */
  function buildPaneStateHtml(sessionName, data) {
    const s = data.state || {};
    const injections = (data.injections?.injections || s.injectionHistory || []).slice(-5).reverse();
    const stateEvents = (s.stateEventHistory || data.detection?.ticks || s.detectionHistory || []).slice(-8).reverse();
    return `
      <div class="pane-state-title">Diagnostics — ${escapeHtml(sessionName)}</div>
      <dl class="pane-state-grid">
        <dt>effective state</dt><dd>${escapeHtml(s.pendingPermission ? "permission" : (s.status || "?"))}</dd>
        <dt>raw status</dt><dd>${escapeHtml(s.status || "?")}</dd>
        <dt>command</dt><dd>${escapeHtml(s.command || "?")}</dd>
        <dt>pending messages</dt><dd>${escapeHtml(String(!!s.pendingMessages))}</dd>
        <dt>unread</dt><dd>${escapeHtml(String(s.unreadCount ?? 0))}</dd>
        <dt>input dirty</dt><dd>${escapeHtml(String(!!s.inputBoxDirty))}</dd>
        <dt>permission</dt><dd>${escapeHtml(String(!!s.pendingPermission))}</dd>
        <dt>hook permission</dt><dd>${escapeHtml(String(!!s.hookPermissionActive))}</dd>
        <dt>screen permission</dt><dd>${escapeHtml(String(!!s.screenPermissionActive))}</dd>
        <dt>quiet</dt><dd>${escapeHtml(formatMs(s.quietMs))}</dd>
        <dt>heuristic timer</dt><dd>${escapeHtml(String(!!s.heuristicTimerActive))}</dd>
      </dl>
      <div class="pane-state-section">Recent injections</div>
      ${formatPaneStateEvents(injections, "No injections recorded.")}
      <div class="pane-state-section">Recent state events</div>
      ${formatPaneStateEvents(stateEvents, "No state events recorded.")}
    `;
  }

  /**
   * @param {any[]} events
   * @param {string} empty
   * @returns {string}
   */
  function formatPaneStateEvents(events, empty) {
    if (!events.length) return `<div class="pane-state-empty">${escapeHtml(empty)}</div>`;
    return `<pre class="pane-state-events">${escapeHtml(events.map(formatStateEvent).join("\n\n"))}</pre>`;
  }

  /**
   * @param {any} event
   * @returns {string}
   */
  function formatStateEvent(event) {
    const t = typeof event.time === "number" ? new Date(event.time).toLocaleTimeString() : "";
    const details = { ...event };
    delete details.prompt;
    return `${t ? `${t} ` : ""}${JSON.stringify(details, null, 2)}`;
  }

  /**
   * @param {unknown} ms
   * @returns {string}
   */
  function formatMs(ms) {
    return typeof ms === "number" ? `${Math.round(ms)}ms` : "?";
  }

  /**
   * Build the bottom status bar for a pane (status dot, label, unread).
   * @param {any} info
   * @returns {HTMLElement}
   */
  function buildPaneStatusbar(info) {
    if (!doc) throw new Error("pane-runtime: no document");
    const statusbar = doc.createElement("div");
    statusbar.className = "pane-statusbar";
    const status = normaliseStatusDot(info?.status);
    const unread = Number(info?.unreadCount) || 0;
    const dotClass = info?.pendingPermission ? "permission" : status;
    const label = info?.pendingPermission ? "permission" : status;
    statusbar.innerHTML = `
      <span class="status-dot ${escapeHtml(dotClass)}"></span>
      <span class="pane-status-label">${escapeHtml(label)}</span>
      <span class="pane-unread ${unread > 0 ? "show" : ""}">${unread}</span>
    `;
    return statusbar;
  }

  /**
   * Set up the xterm fit/resize lifecycle for the terminal entry inside
   * the pane's terminal area.
   * @param {any} entry
   * @param {HTMLElement} termArea
   * @param {string} activeSessionName
   */
  function setupPaneFitLifecycle(entry, termArea, activeSessionName) {
    const fitAndSync = () => {
      try {
        if (!termArea.isConnected) return;
        const h = termArea.offsetHeight;
        if (h < 50) return;
        const prevCols = entry.term.cols;
        const prevRows = entry.term.rows;
        entry.fitAddon.fit();
        const { cols, rows } = entry.term;
        if (cols !== prevCols || rows !== prevRows) {
          deps.state.ws?.send(JSON.stringify({ type: "resize", session: activeSessionName, payload: { cols, rows } }));
        }
      } catch {}
    };

    raf(() => {
      if (!termArea.isConnected) return;
      if (!entry.opened) {
        termArea.appendChild(entry.wrapperEl);
        entry.term.open(entry.wrapperEl);
        entry.opened = true;
      } else {
        termArea.appendChild(entry.wrapperEl);
      }

      let fitRetries = 0;
      const retryFit = () => {
        if (!termArea.isConnected) return;
        fitAndSync();
        if (termArea.offsetHeight < 50 && fitRetries < 20) {
          fitRetries++;
          setTimeoutFn(retryFit, 100);
        }
      };
      retryFit();
      setTimeoutFn(fitAndSync, 300);
      setTimeoutFn(fitAndSync, 1000);

      entry.resizeObserver?.disconnect();
      if (!ResizeObs) return;
      let lastW = 0, lastH = 0;
      entry.resizeObserver = new ResizeObs((entries) => {
        const rect = entries[0]?.contentRect;
        if (!rect || rect.height < 50) return;
        const w = Math.round(rect.width), h = Math.round(rect.height);
        if (w === lastW && h === lastH) return;
        lastW = w; lastH = h;
        fitAndSync();
      });
      entry.resizeObserver.observe(termArea);
    });
  }

  /**
   * @param {string} groupName
   */
  function createPane(groupName) {
    if (!doc) throw new Error("pane-runtime: no document");
    const pg = getPaneGroup(deps.state.sessions, groupName, deps.state.activePaneTypes);
    const activeType = pg?.activeType || "claude";
    const activeSessionName = activeType === "pwsh" ? (pg?.pwsh || groupName) : (pg?.claude || groupName);
    const info = deps.sessions.byName(activeSessionName);
    const hasBoth = !!(pg?.claude && pg?.pwsh);

    const pane = doc.createElement("div");
    pane.className = paneClassName(groupName, deps.state.focusedPane, info);
    pane.dataset["session"] = groupName;
    pane.addEventListener("mousedown", () => focusPane(groupName));

    pane.appendChild(buildPaneTopbar(pg, activeType, info, groupName, hasBoth, activeSessionName));

    const termArea = doc.createElement("div");
    termArea.className = "pane-terminal";
    pane.appendChild(termArea);

    pane.appendChild(buildPaneStatusbar(info));

    const entry = ensureTerminal(activeSessionName);
    setupPaneFitLifecycle(entry, termArea, activeSessionName);

    return pane;
  }

  /**
   * @param {string} sessionName
   */
  function ensureTerminal(sessionName) {
    let entry = deps.state.terminals.get(sessionName);
    if (entry) return entry;

    const { Terminal, FitAddon, WebLinksAddon, theme } = deps.xterm;
    const term = new Terminal({
      theme,
      fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.onData(/** @param {string} data */ (data) => {
      if (pasteGuards.has(sessionName)) return;
      deps.state.ws?.send(JSON.stringify({ type: "input", session: sessionName, payload: data }));
    });

    term.onResize(/** @param {{cols: number, rows: number}} dim */ ({ cols, rows }) => {
      deps.state.ws?.send(JSON.stringify({ type: "resize", session: sessionName, payload: { cols, rows } }));
    });

    term.attachCustomKeyEventHandler(/** @param {KeyboardEvent} e */ (e) => {
      if (e.type !== "keydown") return true;
      if (e.ctrlKey && e.shiftKey) return handleCtrlShiftKey(e, sessionName);
      if (e.ctrlKey && !e.shiftKey) return handleCtrlOnlyKey(e, sessionName);
      return true;
    });

    if (!doc) throw new Error("pane-runtime: no document");
    const wrapperEl = doc.createElement("div");
    wrapperEl.style.position = "absolute";
    wrapperEl.style.inset = "0";

    entry = { term, fitAddon, opened: false, wrapperEl };
    deps.state.terminals.set(sessionName, entry);
    return entry;
  }

  /**
   * @param {string} groupName
   * @param {"claude" | "pwsh"} type
   */
  function switchPaneType(groupName, type) {
    const pg = getPaneGroup(deps.state.sessions, groupName, deps.state.activePaneTypes);
    if (!pg) return;
    deps.activePaneTypes.set(groupName, type);
    deps.actions.renderActiveWorkspace();
    focusPane(groupName);
  }

  /**
   * @param {string} sessionName
   */
  function updatePaneStatus(sessionName) {
    if (!doc) return;
    const info = deps.sessions.byName(sessionName);
    if (!info) return;
    const groupName = info.group || sessionName;
    const pg = getPaneGroup(deps.state.sessions, groupName, deps.state.activePaneTypes);
    const activeSessionName = pg ? (pg.activeType === "pwsh" ? pg.pwsh : pg.claude) : sessionName;
    if (activeSessionName !== sessionName) return;
    doc.querySelectorAll(`.pane[data-session="${groupName}"]`).forEach((pane) => {
      const dot = pane.querySelector(".status-dot");
      const label = pane.querySelector(".pane-status-label");
      const unread = pane.querySelector(".pane-unread");
      const dotClass = info.pendingPermission ? "permission" : normaliseStatusDot(info.status);
      const labelText = info.pendingPermission ? "permission" : dotClass;
      if (dot) dot.className = `status-dot ${dotClass}`;
      if (label) label.textContent = labelText;
      if (unread) {
        const unreadN = Number(info.unreadCount) || 0;
        unread.textContent = String(unreadN);
        unread.classList.toggle("show", unreadN > 0);
      }
      pane.classList.toggle("dead", info.status === "dead");
      pane.classList.toggle("pending-permission", !!info.pendingPermission);
    });
  }

  /**
   * @param {string} groupName
   */
  function focusPane(groupName) {
    if (!doc) return;
    deps.helpers.focus.set(groupName);
    doc.querySelectorAll(".pane").forEach((p) => {
      if (!(p instanceof HTMLElement)) return;
      p.classList.toggle("focused", p.dataset["session"] === groupName);
    });
    doc.querySelectorAll(".session-row").forEach((r) => r.classList.remove("active"));
    doc.querySelector(`.session-row[data-group="${groupName}"]`)?.classList.add("active");
    const pg = getPaneGroup(deps.state.sessions, groupName, deps.state.activePaneTypes);
    const activeSessionName = pg ? (pg.activeType === "pwsh" ? pg.pwsh : pg.claude) : groupName;
    const entry = deps.state.terminals.get(activeSessionName || groupName);
    if (entry) {
      entry.term.focus();
      raf(() => entry.term.focus());
    }
  }

  return {
    createPane,
    ensureTerminal,
    switchPaneType,
    focusPane,
    updatePaneStatus,
    // Exposed for tests; not part of documented contract.
    _handleCtrlShiftKey: handleCtrlShiftKey,
    _handleCtrlOnlyKey: handleCtrlOnlyKey,
    _buildPaneTopbar: buildPaneTopbar,
    _buildPaneStatusbar: buildPaneStatusbar,
    _normaliseStatusDot: normaliseStatusDot,
    _pasteGuards: pasteGuards,
  };
}
