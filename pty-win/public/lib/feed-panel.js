// @ts-check
// Feed panel UI. Extracted from app.js (was the initFeedPanel IIFE).
// Self-contained module owning the right-side emcom feed strip:
// identity picker, polling, sender colors, thread rendering, resize.
//
// Deps passed in by the caller because the panel coordinates with
// terminal state (pause/resume ResizeObservers during drag, refit
// after release). Browser globals (document, window, localStorage,
// fetch, setInterval, requestAnimationFrame) are used directly.

import { escapeHtml } from "./format.js";

/**
 * Deterministic sender-color palette. The hash function in
 * getSenderColor() maps an identity name to a stable index, so the
 * same agent always renders in the same color across sessions.
 */
export const SENDER_PALETTE = [
  "#61afef", "#c678dd", "#e06c75", "#98c379", "#d19a66", "#56b6c2",
  "#e5c07b", "#ff6ac1", "#7ee787", "#a2d2fb", "#ffa657", "#bc8cff",
];

const senderColorCache = new Map();

/**
 * Deterministic per-sender color lookup. The same `name` always maps
 * to the same color in SENDER_PALETTE. Results are memoized.
 *
 * Exported so the hash invariant can be regression-tested.
 *
 * @param {string} name
 * @returns {string}
 */
export function getSenderColor(name) {
  if (senderColorCache.has(name)) return senderColorCache.get(name);
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  const color = SENDER_PALETTE[Math.abs(hash) % SENDER_PALETTE.length];
  senderColorCache.set(name, color);
  return color;
}

/**
 * Format an ISO-8601 timestamp as "MM/DD HH:MM" in local time.
 * Exported for testability.
 *
 * @param {string} iso
 * @returns {string}
 */
export function fmtFeedTime(iso) {
  const d = new Date(iso);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hr = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mo}/${day} ${hr}:${min}`;
}

/**
 * @typedef {object} FeedPanelDeps
 * @property {(id: string) => HTMLElement} byId
 * @property {(id: string) => HTMLInputElement} inputById
 * @property {(id: string) => HTMLSelectElement} selectById
 * @property {{ terminals: Map<string, any>, workspaces: any[], activeWorkspaceId: string | null }} state
 * @property {(node: any) => void} fitAllTerminals
 */

/**
 * Wire up the feed panel. Called once at startup. Returns nothing --
 * effects live in DOM listeners + a setInterval poll loop.
 *
 * This is an init-pattern function: it captures private state
 * (feedIdentity, pickerOpen, expandedItems, etc.) in closure and
 * registers handlers against the DOM. Splitting it into chunked
 * helpers would require turning that private state into module-level
 * mutables -- a regression in encapsulation. Same rationale that
 * drove IIFEs:false in eslint.config.js; this is an init function
 * by another spelling.
 *
 * @param {FeedPanelDeps} deps
 */
// eslint-disable-next-line max-lines-per-function -- init wirer; see jsdoc above
export function initFeedPanel(deps) {
  const { byId, inputById, selectById, state, fitAllTerminals } = deps;
  const FEED_POLL_MS = 10_000;
  const panel = byId("feed-panel");
  const strip = byId("feed-strip");
  const body = byId("feed-body");
  const collapseBtn = byId("feed-collapse-btn");
  const expandBtn = byId("feed-expand-btn");
  const titleEl = byId("feed-title");
  const unreadBadge = byId("feed-unread-badge");
  const stripBadge = byId("feed-strip-badge");
  const identityBadge = byId("feed-identity-badge");

  let feedIdentity = localStorage.getItem("pty-win-feed-identity") || "";

  // --- Expand/collapse all ---
  byId("feed-expand-all").onclick = () => {
    body.querySelectorAll(".feed-item").forEach(el => {
      if (!(el instanceof HTMLElement)) return;
      const id = el.dataset["msgId"];
      if (id) expandedItems.add(id);
      el.classList.add("expanded");
    });
  };
  byId("feed-collapse-all").onclick = () => {
    expandedItems.clear();
    body.querySelectorAll(".feed-item").forEach(el => el.classList.remove("expanded"));
  };

  // --- Restore saved width ---
  const savedFeedWidth = parseInt(localStorage.getItem("pty-win-feed-width") || "", 10);
  if (savedFeedWidth && savedFeedWidth >= 150) panel.style.width = `${savedFeedWidth}px`;

  // --- Resize handle ---
  const feedHandle = byId("feed-resize-handle");
  feedHandle.addEventListener("mousedown", /** @param {MouseEvent} e */ (e) => {
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    // Pause ResizeObservers during drag to prevent fit() on every frame
    for (const entry of state.terminals.values()) entry.resizeObserver?.disconnect();
    let rafPending = false;
    const onMove = /** @param {MouseEvent} ev */ (ev) => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const newWidth = Math.max(150, window.innerWidth - ev.clientX);
        panel.style.width = `${newWidth}px`;
      });
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      localStorage.setItem("pty-win-feed-width", String(parseInt(panel.style.width, 10)));
      // Reconnect ResizeObservers + fit once
      const ws = state.workspaces.find(w => w.id === state.activeWorkspaceId);
      for (const [name, entry] of state.terminals) {
        const el = document.querySelector(`.pane[data-session="${name}"] .pane-terminal`);
        if (el && entry.resizeObserver) entry.resizeObserver.observe(el);
      }
      if (ws?.layout) requestAnimationFrame(() => requestAnimationFrame(() => fitAllTerminals(ws.layout)));
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  // --- Collapse / expand ---
  const isOpen = localStorage.getItem("pty-win-feed-open") !== "false";
  if (!isOpen) { panel.classList.add("hidden"); strip.classList.remove("hidden"); }
  else { strip.classList.add("hidden"); }

  collapseBtn.onclick = () => {
    panel.classList.add("hidden");
    strip.classList.remove("hidden");
    localStorage.setItem("pty-win-feed-open", "false");
  };
  expandBtn.onclick = () => {
    panel.classList.remove("hidden");
    strip.classList.add("hidden");
    localStorage.setItem("pty-win-feed-open", "true");
    if (feedIdentity) renderFeed(); else showIdentityPicker();
  };

  // --- Header ---
  function updateTitle() {
    titleEl.textContent = "EMCOM FEED";
    identityBadge.textContent = feedIdentity || "";
    identityBadge.onclick = feedIdentity ? /** @param {MouseEvent} e */ (e) => {
      e.stopPropagation();
      if (pickerOpen) { pickerOpen = false; lastFeedJson = ""; renderFeed(); }
      else showIdentityPicker();
    } : null;
  }

  /**
   * @param {number} count
   */
  function updateUnreadBadge(count) {
    if (count > 0) {
      unreadBadge.textContent = String(count); unreadBadge.classList.remove("hidden");
      stripBadge.textContent = String(count); stripBadge.classList.remove("hidden");
    } else {
      unreadBadge.classList.add("hidden");
      stripBadge.classList.add("hidden");
    }
  }

  // --- Identity picker ---
  let pickerOpen = false;
  function showIdentityPicker() {
    pickerOpen = true;
    body.innerHTML = '<div class="feed-empty">// LOADING IDENTITIES...</div>';
    fetch(`/api/emcom/who?_=${Date.now()}`)
      .then(r => r.json())
      .then(/** @param {any[]} identities */ identities => {
        body.innerHTML = "";
        if (!identities || identities.length === 0) {
          body.innerHTML = '<div class="feed-empty">// NO REGISTERED IDENTITIES<br>&gt; awaiting signal...</div>';
          return;
        }
        const picker = document.createElement("div");
        picker.className = "feed-identity-picker";
        picker.innerHTML = '<div class="feed-picker-title">Select identity</div>';
        for (const id of identities) {
          const btn = document.createElement("div");
          btn.className = `feed-identity-option${id.name === feedIdentity ? " active" : ""}`;
          const dot = document.createElement("span");
          dot.className = `feed-id-status ${id.active ? "active" : "inactive"}`;
          btn.appendChild(dot);
          const nameSpan = document.createElement("span");
          nameSpan.className = "feed-id-name";
          nameSpan.textContent = id.name;
          btn.appendChild(nameSpan);
          if (id.description) {
            const desc = document.createElement("span");
            desc.className = "feed-id-desc";
            desc.textContent = id.description;
            btn.appendChild(desc);
          }
          btn.onclick = () => {
            pickerOpen = false;
            feedIdentity = id.name;
            localStorage.setItem("pty-win-feed-identity", feedIdentity);
            updateTitle();
            renderFeed();
          };
          picker.appendChild(btn);
        }
        body.appendChild(picker);
      })
      .catch(() => { body.innerHTML = '<div class="feed-empty">// CONNECTION FAILED<br>&gt; server unavailable</div>'; });
  }

  // --- State ---
  const expandedItems = new Set();
  let previousIds = new Set();
  let lastFeedJson = "";
  let sortNewest = true;
  let threadsCollapsed = false;
  let filterSender = "";
  let filterText = "";

  // --- Toolbar controls ---
  const searchInput = inputById("feed-search");
  const senderSelect = selectById("feed-sender-filter");
  const sortBtn = byId("feed-sort-btn");
  const threadsBtn = byId("feed-threads-btn");

  searchInput.oninput = () => { filterText = searchInput.value.toLowerCase(); lastFeedJson = ""; renderFeed(); };
  senderSelect.onchange = () => { filterSender = senderSelect.value; lastFeedJson = ""; renderFeed(); };
  sortBtn.onclick = () => {
    sortNewest = !sortNewest;
    sortBtn.innerHTML = sortNewest ? "&#x25BC;" : "&#x25B2;";
    sortBtn.title = sortNewest ? "Newest first" : "Oldest first";
    lastFeedJson = "";
    renderFeed();
  };
  threadsBtn.onclick = () => {
    threadsCollapsed = !threadsCollapsed;
    threadsBtn.classList.toggle("active", threadsCollapsed);
    threadsBtn.title = threadsCollapsed ? "Threads collapsed" : "Threads expanded";
    lastFeedJson = "";
    renderFeed();
  };

  /**
   * @param {string} str
   */
  function escHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  // --- Render feed ---
  function renderFeed() {
    if (panel.classList.contains("hidden")) return;
    if (pickerOpen) return;
    if (!feedIdentity) { showIdentityPicker(); return; }
    fetch(`/api/emcom-feed?identity=${encodeURIComponent(feedIdentity)}`)
      .then(r => r.text())
      .then(/** @param {string} text */ text => {
        if (text === lastFeedJson) return; // skip re-render if unchanged
        lastFeedJson = text;
        let emails;
        try { emails = JSON.parse(text); } catch { emails = { error: "parse error" }; }
        if (!Array.isArray(emails)) {
          body.innerHTML = `<div class="feed-empty">// ${escapeHtml((emails.error || "UNAVAILABLE").toUpperCase())}</div>`;
          updateUnreadBadge(0);
          return;
        }
        if (emails.length === 0) {
          body.innerHTML = '<div class="feed-empty">// NO MESSAGES<br><br>&gt; awaiting signal...</div>';
          updateUnreadBadge(0);
          return;
        }

        // Sort
        emails.sort(/**
         * @param {any} a
         * @param {any} b
         */
        (a, b) => sortNewest
          ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          : new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        // Populate sender dropdown (preserve current selection)
        const senders = [...new Set(emails.map(/** @param {any} e */ e => e.sender))].sort();
        const prevSender = senderSelect.value;
        senderSelect.innerHTML = '<option value="">all</option>';
        for (const s of senders) {
          const opt = document.createElement("option");
          opt.value = s; opt.textContent = s;
          if (s === prevSender) opt.selected = true;
          senderSelect.appendChild(opt);
        }

        // Filter
        let filtered = emails;
        if (filterSender) filtered = filtered.filter(/** @param {any} e */ e => e.sender === filterSender);
        if (filterText) filtered = filtered.filter(/** @param {any} e */ e =>
          (e.subject || "").toLowerCase().includes(filterText) ||
          (e.body || "").toLowerCase().includes(filterText) ||
          (e.sender || "").toLowerCase().includes(filterText));

        const threadMap = new Map();
        for (const e of filtered) {
          if (!threadMap.has(e.thread_id)) threadMap.set(e.thread_id, []);
          threadMap.get(e.thread_id).push(e);
        }
        const seen = new Set();
        const items = [];
        for (const e of filtered) {
          if (!seen.has(e.thread_id)) {
            seen.add(e.thread_id);
            const thread = threadMap.get(e.thread_id);
            items.push({ root: thread[0], replies: thread.slice(1) });
          }
        }

        let unreadCount = 0;
        for (const e of emails) { if (e.tags?.includes("unread")) unreadCount++; }
        updateUnreadBadge(unreadCount);

        const currentIds = new Set(emails.map(/** @param {any} e */ e => e.id));
        const scrollTop = body.scrollTop;

        body.classList.add("feed-no-transition");
        body.innerHTML = "";
        for (const { root, replies } of items) {
          const threadDiv = document.createElement("div");
          threadDiv.className = "feed-thread";

          const isUnread = root.tags?.includes("unread");
          const isExpanded = expandedItems.has(root.id);
          const isNew = !previousIds.has(root.id) && previousIds.size > 0;
          const senderColor = getSenderColor(root.sender);
          const div = document.createElement("div");
          div.className = `feed-item${isUnread ? " unread" : ""}${isExpanded ? " expanded" : ""}${isNew ? " feed-new" : ""}`;
          div.dataset["msgId"] = root.id;
          div.style.setProperty("--sender-color", senderColor);
          div.innerHTML = `
            <div class="feed-meta">
              <span class="feed-sender" style="color:${senderColor}">${isUnread ? '<span class="feed-unread-dot"></span>' : ""}${escHtml(root.sender)}${root.to?.length ? `<span class="feed-arrow">\u2192</span><span class="feed-recipient">${escHtml(root.to.join(", "))}</span>` : ""}</span>
              <span class="feed-time">${fmtFeedTime(root.created_at)}</span>
            </div>
            <div class="feed-subject">${escHtml(root.subject)}${replies.length > 0 ? `<span class="feed-thread-count">[${replies.length + 1}]</span>` : ""}</div>
            <div class="feed-preview">${escHtml((root.body || "").slice(0, 100))}</div>
            <div class="feed-body-text">${escHtml(root.body || "")}</div>`;
          div.onclick = (e) => {
            const t = e.target instanceof Element ? e.target : null;
            if (t && t.closest(".feed-body-text")) return;
            if (expandedItems.has(root.id)) expandedItems.delete(root.id);
            else expandedItems.add(root.id);
            div.classList.toggle("expanded");
          };
          threadDiv.appendChild(div);

          for (const reply of (threadsCollapsed ? [] : replies)) {
            const rUnread = reply.tags?.includes("unread");
            const rExpanded = expandedItems.has(reply.id);
            const rNew = !previousIds.has(reply.id) && previousIds.size > 0;
            const rColor = getSenderColor(reply.sender);
            const rdiv = document.createElement("div");
            rdiv.className = `feed-item feed-reply${rUnread ? " unread" : ""}${rExpanded ? " expanded" : ""}${rNew ? " feed-new" : ""}`;
            rdiv.dataset["msgId"] = reply.id;
            rdiv.style.setProperty("--sender-color", rColor);
            rdiv.innerHTML = `
              <div class="feed-meta">
                <span class="feed-sender" style="color:${rColor}">${rUnread ? '<span class="feed-unread-dot"></span>' : ""}${escHtml(reply.sender)}${reply.to?.length ? `<span class="feed-arrow">\u2192</span><span class="feed-recipient">${escHtml(reply.to.join(", "))}</span>` : ""}</span>
                <span class="feed-time">${fmtFeedTime(reply.created_at)}</span>
              </div>
              <div class="feed-preview">${escHtml((reply.body || "").slice(0, 100))}</div>
              <div class="feed-body-text">${escHtml(reply.body || "")}</div>`;
            rdiv.onclick = (e) => {
              const t = e.target instanceof Element ? e.target : null;
              if (t && t.closest(".feed-body-text")) return;
              if (expandedItems.has(reply.id)) expandedItems.delete(reply.id);
              else expandedItems.add(reply.id);
              rdiv.classList.toggle("expanded");
            };
            threadDiv.appendChild(rdiv);
          }

          body.appendChild(threadDiv);
        }

        body.scrollTop = scrollTop;
        requestAnimationFrame(() => body.classList.remove("feed-no-transition"));
        previousIds = currentIds;
      })
      .catch(() => {
        body.innerHTML = '<div class="feed-empty">// CONNECTION LOST<br>&gt; server unavailable</div>';
        updateUnreadBadge(0);
      });
  }

  // --- Initialize ---
  updateTitle();
  if (feedIdentity) { renderFeed(); }
  else if (isOpen) showIdentityPicker();
  setInterval(() => { if (feedIdentity) renderFeed(); }, FEED_POLL_MS);

  // Listen for identity changes from pane topbar clicks
  window.addEventListener("feed-identity-change", (e) => {
    feedIdentity = /** @type {CustomEvent} */ (e).detail;
    pickerOpen = false;
    lastFeedJson = "";
    updateTitle();
    renderFeed();
  });
}
