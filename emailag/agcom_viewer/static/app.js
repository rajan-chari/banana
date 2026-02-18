/**
 * agcom-viewer: Real-time agent communication monitor.
 * Vanilla JS, no framework, no build step.
 */

(function () {
    "use strict";

    // ── State ──────────────────────────────────
    const state = {
        apiUrl: "",
        token: null,
        mode: "admin",           // "admin" | "user"
        userHandle: "",
        view: "messages",        // "messages" | "threads"
        autoRefresh: true,
        pollInterval: 3000,
        pollTimer: null,
        connected: false,
        loading: false,

        messages: [],
        threads: [],
        users: [],
        stats: { thread_count: 0, message_count: 0, user_count: 0 },

        // Sorting
        sortKey: "timestamp",
        sortDir: "desc",

        // Column widths (percentages for messages view)
        msgCols: [
            { key: "timestamp", label: "Time", width: 14 },
            { key: "sender", label: "Sender", width: 12 },
            { key: "recipients", label: "Recipients", width: 16 },
            { key: "subject", label: "Subject", width: 58 },
        ],
        threadCols: [
            { key: "subject", label: "Subject", width: 36 },
            { key: "participants", label: "Participants", width: 30 },
            { key: "message_count", label: "Msgs", width: 8 },
            { key: "last_activity", label: "Last Activity", width: 26 },
        ],

        selectedId: null,
        lastPollId: "",

        // Filter
        searchText: "",
        timeFrom: null,
        timeTo: null,
    };

    // ── DOM refs ───────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        connDot: $("#conn-dot"),
        connDotFooter: $("#conn-dot-footer"),
        connLabel: $("#conn-label"),
        loadingBar: $("#loading-bar"),
        listHeader: $("#list-header"),
        listBody: $("#list-body"),
        content: $("#content"),
        detailPanel: $("#detail-panel"),
        detailEmpty: $("#detail-empty"),
        detailContent: $("#detail-content"),
        userSelect: $("#user-select"),
        searchInput: $("#search-input"),
        timeFrom: $("#time-from"),
        timeTo: $("#time-to"),
        statThreads: $("#stat-threads"),
        statMessages: $("#stat-messages"),
        statUsers: $("#stat-users"),
        autoRefreshBtn: $("#auto-refresh-btn"),
        panelDivider: $("#panel-divider"),
    };

    // ── Utilities ──────────────────────────────

    function esc(str) {
        const d = document.createElement("div");
        d.textContent = str;
        return d.innerHTML;
    }

    function fmtTime(iso) {
        if (!iso) return "-";
        const d = new Date(iso);
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function fmtTimeShort(iso) {
        if (!iso) return "-";
        const d = new Date(iso);
        const pad = (n) => String(n).padStart(2, "0");
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    // ── API Layer ──────────────────────────────

    async function apiGet(path, params = {}) {
        const url = new URL(state.apiUrl + path);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
        });
        const headers = {};
        if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
        const res = await fetch(url, { headers });
        if (res.status === 401 || res.status === 403) {
            state.token = null; // force re-login on next poll
            throw new Error(`API ${res.status}: ${res.statusText}`);
        }
        if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
        return res.json();
    }

    async function apiPost(path, body) {
        const headers = { "Content-Type": "application/json" };
        if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
        const res = await fetch(state.apiUrl + path, { method: "POST", headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
        return res.json();
    }

    // ── Auth ───────────────────────────────────

    async function login(handle) {
        const data = await apiPost("/auth/login", { handle, display_name: handle });
        state.token = data.token;
        return data;
    }

    async function ensureAuth() {
        if (state.mode === "admin") {
            if (!state.token) await login("viewer-admin");
        } else {
            if (!state.userHandle) return;
            await login(state.userHandle);
        }
    }

    // ── Data Fetching ──────────────────────────

    async function fetchData() {
        if (state.loading) return;
        state.loading = true;
        dom.loadingBar.classList.add("active");

        try {
            await ensureAuth();
            if (!state.token) return;

            if (state.mode === "admin") {
                // Use admin endpoints
                const [msgs, threads, users, stats] = await Promise.all([
                    state.lastPollId
                        ? apiGet("/admin/messages/poll", { since_id: state.lastPollId, limit: 200 })
                        : apiGet("/admin/messages", { limit: 200 }),
                    apiGet("/admin/threads", { limit: 200 }),
                    apiGet("/admin/users"),
                    apiGet("/admin/stats"),
                ]);

                if (state.lastPollId && msgs.length > 0) {
                    // Incremental: merge new messages
                    const existingIds = new Set(state.messages.map((m) => m.id));
                    const newMsgs = msgs.filter((m) => !existingIds.has(m.id));
                    state.messages = [...state.messages, ...newMsgs];
                } else if (!state.lastPollId) {
                    state.messages = msgs;
                }

                if (state.messages.length > 0) {
                    state.lastPollId = state.messages[state.messages.length - 1].id;
                }

                state.threads = threads;
                state.users = users;
                state.stats = stats;
            } else {
                // User mode: scoped endpoints
                const [msgs, threads] = await Promise.all([
                    apiGet("/messages", { limit: 200 }),
                    apiGet("/threads", { limit: 200 }),
                ]);
                state.messages = msgs;
                state.threads = threads;
            }

            setConnected(true);
        } catch (err) {
            console.error("Fetch error:", err);
            setConnected(false);
            // Reset token on auth error
            if (err.message.includes("401")) state.token = null;
        } finally {
            state.loading = false;
            dom.loadingBar.classList.remove("active");
        }
    }

    // ── Connection Status ──────────────────────

    function setConnected(v) {
        state.connected = v;
        const cls = v ? "" : "disconnected";
        dom.connDot.className = "dot " + cls;
        dom.connDotFooter.className = "connection-dot " + cls;
        dom.connLabel.textContent = v ? "connected" : "disconnected";
    }

    // ── Rendering: List Header ─────────────────

    function renderHeader() {
        const cols = state.view === "messages" ? state.msgCols : state.threadCols;
        dom.listHeader.innerHTML = cols
            .map((c, i) => {
                const sorted = state.sortKey === c.key;
                const arrow = sorted ? (state.sortDir === "asc" ? "\u25B2" : "\u25BC") : "\u25BC";
                return `<div class="col ${sorted ? "sorted" : ""}" data-key="${c.key}" style="width:${c.width}%">
                    ${esc(c.label)}
                    <span class="sort-arrow">${arrow}</span>
                    <div class="col-resize" data-idx="${i}"></div>
                </div>`;
            })
            .join("");
    }

    // ── Rendering: List Body ───────────────────

    function getFilteredItems() {
        let items = state.view === "messages" ? state.messages : state.threads;

        // Text search
        if (state.searchText) {
            const q = state.searchText.toLowerCase();
            items = items.filter((item) => {
                if (state.view === "messages") {
                    return (
                        (item.subject || "").toLowerCase().includes(q) ||
                        (item.body || "").toLowerCase().includes(q) ||
                        (item.sender || "").toLowerCase().includes(q) ||
                        (item.recipients || []).join(" ").toLowerCase().includes(q)
                    );
                } else {
                    return (
                        (item.subject || "").toLowerCase().includes(q) ||
                        (item.participants || []).join(" ").toLowerCase().includes(q)
                    );
                }
            });
        }

        // Time range filter
        if (state.timeFrom) {
            const from = new Date(state.timeFrom).getTime();
            items = items.filter((item) => {
                const t = new Date(item.timestamp || item.last_activity).getTime();
                return t >= from;
            });
        }
        if (state.timeTo) {
            const to = new Date(state.timeTo).getTime();
            items = items.filter((item) => {
                const t = new Date(item.timestamp || item.last_activity).getTime();
                return t <= to;
            });
        }

        // Sort
        const key = state.sortKey;
        const dir = state.sortDir === "asc" ? 1 : -1;
        items = [...items].sort((a, b) => {
            let va = a[key];
            let vb = b[key];
            if (Array.isArray(va)) va = va.join(", ");
            if (Array.isArray(vb)) vb = vb.join(", ");
            if (va == null) va = "";
            if (vb == null) vb = "";
            if (typeof va === "string") return va.localeCompare(vb) * dir;
            return (va - vb) * dir;
        });

        return items;
    }

    function renderList() {
        const items = getFilteredItems();
        const cols = state.view === "messages" ? state.msgCols : state.threadCols;

        if (items.length === 0) {
            dom.listBody.innerHTML = `<div class="empty-list">
                <div class="empty-icon">\u2300</div>
                <div>No ${state.view} found</div>
            </div>`;
            return;
        }

        dom.listBody.innerHTML = items
            .map((item) => {
                const id = item.id;
                const selected = id === state.selectedId;
                const cells = cols
                    .map((c) => {
                        let val = "";
                        let cls = c.key;
                        if (state.view === "messages") {
                            switch (c.key) {
                                case "timestamp":
                                    val = fmtTime(item.timestamp);
                                    cls = "time";
                                    break;
                                case "sender":
                                    val = item.sender;
                                    cls = "sender";
                                    break;
                                case "recipients":
                                    val = (item.recipients || []).join(", ");
                                    cls = "recipients";
                                    break;
                                case "subject":
                                    val = item.subject;
                                    cls = "subject";
                                    break;
                            }
                        } else {
                            switch (c.key) {
                                case "subject":
                                    val = item.subject;
                                    cls = "subject";
                                    break;
                                case "participants":
                                    val = (item.participants || []).join(", ");
                                    cls = "participants";
                                    break;
                                case "message_count":
                                    val = "-";
                                    cls = "count";
                                    break;
                                case "last_activity":
                                    val = fmtTime(item.last_activity);
                                    cls = "time";
                                    break;
                            }
                        }
                        return `<div class="cell ${esc(cls)}" style="width:${c.width}%">${esc(val)}</div>`;
                    })
                    .join("");
                return `<div class="list-row ${selected ? "selected" : ""}" data-id="${esc(id)}" tabindex="-1">${cells}</div>`;
            })
            .join("");
    }

    // ── Rendering: Detail Panel ────────────────

    async function renderDetail(id) {
        if (!id) {
            dom.content.classList.add("detail-hidden");
            dom.detailEmpty.style.display = "";
            dom.detailContent.style.display = "none";
            return;
        }

        dom.content.classList.remove("detail-hidden");
        dom.detailEmpty.style.display = "none";
        dom.detailContent.style.display = "";

        if (state.view === "messages") {
            // Show single message, with link to thread
            const msg = state.messages.find((m) => m.id === id);
            if (!msg) return;
            dom.detailContent.innerHTML = `
                <div class="detail-header">
                    <h2>${esc(msg.subject)}</h2>
                    <a class="thread-link" data-thread="${esc(msg.thread_id)}">View Thread \u2192</a>
                </div>
                <div class="detail-meta">
                    <span><span class="meta-label">From:</span> <span class="meta-value">${esc(msg.sender)}</span></span>
                    <span><span class="meta-label">To:</span> <span class="meta-value">${esc((msg.recipients || []).join(", "))}</span></span>
                    <span><span class="meta-label">Time:</span> <span class="meta-value">${esc(fmtTime(msg.timestamp))}</span></span>
                </div>
                <div class="detail-messages">
                    ${renderMsgCard(msg)}
                </div>
            `;

            // Thread link click
            const threadLink = dom.detailContent.querySelector(".thread-link");
            if (threadLink) {
                threadLink.addEventListener("click", () => {
                    showThread(threadLink.dataset.thread);
                });
            }
        } else {
            // Show thread with all messages
            await showThread(id);
        }
    }

    async function showThread(threadId) {
        try {
            const data = await apiGet(`/threads/${threadId}/messages`);
            const thread = data;
            dom.detailContent.innerHTML = `
                <div class="detail-header">
                    <h2>${esc(thread.subject)}</h2>
                </div>
                <div class="detail-meta">
                    <span><span class="meta-label">Participants:</span> <span class="meta-value">${esc((thread.participants || []).join(", "))}</span></span>
                    <span><span class="meta-label">Messages:</span> <span class="meta-value">${thread.messages ? thread.messages.length : 0}</span></span>
                </div>
                <div class="detail-messages">
                    ${(thread.messages || []).map((m, i) => renderMsgCard(m, i)).join("")}
                </div>
            `;
        } catch (err) {
            dom.detailContent.innerHTML = `<div class="detail-empty">Failed to load thread</div>`;
        }
    }

    function renderMsgCard(msg, idx) {
        const delay = idx !== undefined ? `animation-delay: ${idx * 40}ms` : "";
        const tags = (msg.tags || [])
            .map((t) => `<span class="msg-tag">${esc(t)}</span>`)
            .join("");
        return `<div class="msg-card" style="${delay}">
            <div class="msg-card-header">
                <span class="msg-sender">${esc(msg.sender)}</span>
                <span class="msg-arrow">\u2192</span>
                <span class="msg-recipients">${esc((msg.recipients || []).join(", "))}</span>
                <span class="msg-time">${esc(fmtTime(msg.timestamp))}</span>
            </div>
            <div class="msg-subject">${esc(msg.subject)}</div>
            <div class="msg-body">${esc(msg.body)}</div>
            ${tags ? `<div class="msg-tags">${tags}</div>` : ""}
        </div>`;
    }

    // ── Rendering: Stats ───────────────────────

    function renderStats() {
        dom.statThreads.textContent = state.stats.thread_count ?? "-";
        dom.statMessages.textContent = state.stats.message_count ?? "-";
        dom.statUsers.textContent = state.stats.user_count ?? "-";
    }

    // ── Rendering: Users Select ────────────────

    function renderUsers() {
        const options = state.users
            .map((u) => `<option value="${esc(u.handle)}">${esc(u.handle)}${u.display_name ? " (" + esc(u.display_name) + ")" : ""}</option>`)
            .join("");
        dom.userSelect.innerHTML = `<option value="">Select agent...</option>${options}`;
        if (state.userHandle) dom.userSelect.value = state.userHandle;
    }

    // ── Full Render Cycle ──────────────────────

    function render() {
        renderHeader();
        renderList();
        renderStats();
        renderUsers();
    }

    // ── Polling Loop ───────────────────────────

    async function poll() {
        await fetchData();
        render();
    }

    function startPolling() {
        stopPolling();
        poll();
        state.pollTimer = setInterval(poll, state.pollInterval);
    }

    function stopPolling() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
    }

    // ── Event Handlers ─────────────────────────

    function initEvents() {
        // View tabs
        $$(".view-tabs button").forEach((btn) => {
            btn.addEventListener("click", () => {
                $$(".view-tabs button").forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                state.view = btn.dataset.view;
                state.selectedId = null;
                state.sortKey = state.view === "messages" ? "timestamp" : "last_activity";
                state.sortDir = "desc";
                renderDetail(null);
                render();
            });
        });

        // Mode switch
        $$(".mode-switch button").forEach((btn) => {
            btn.addEventListener("click", () => {
                $$(".mode-switch button").forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                state.mode = btn.dataset.mode;
                state.token = null;
                state.lastPollId = "";
                state.messages = [];
                state.threads = [];
                dom.userSelect.style.display = state.mode === "user" ? "" : "none";
                updateUrlParams();
                startPolling();
            });
        });

        // User select
        dom.userSelect.addEventListener("change", () => {
            state.userHandle = dom.userSelect.value;
            state.token = null;
            state.messages = [];
            state.threads = [];
            updateUrlParams();
            startPolling();
        });

        // Auto-refresh toggle
        dom.autoRefreshBtn.addEventListener("click", () => {
            state.autoRefresh = !state.autoRefresh;
            dom.autoRefreshBtn.classList.toggle("active", state.autoRefresh);
            if (state.autoRefresh) startPolling();
            else stopPolling();
        });

        // Search input
        dom.searchInput.addEventListener("input", () => {
            state.searchText = dom.searchInput.value;
            renderList();
        });

        // Time range filters
        dom.timeFrom.addEventListener("change", () => {
            state.timeFrom = dom.timeFrom.value || null;
            renderList();
        });
        dom.timeTo.addEventListener("change", () => {
            state.timeTo = dom.timeTo.value || null;
            renderList();
        });

        // Column sort (click on header)
        dom.listHeader.addEventListener("click", (e) => {
            const col = e.target.closest(".col");
            if (!col || e.target.classList.contains("col-resize")) return;
            const key = col.dataset.key;
            if (state.sortKey === key) {
                state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
            } else {
                state.sortKey = key;
                state.sortDir = "desc";
            }
            render();
        });

        // Column resize
        let resizeIdx = -1;
        let resizeStart = 0;
        let resizeWidthStart = 0;

        dom.listHeader.addEventListener("mousedown", (e) => {
            const handle = e.target.closest(".col-resize");
            if (!handle) return;
            e.preventDefault();
            resizeIdx = parseInt(handle.dataset.idx);
            resizeStart = e.clientX;
            const cols = state.view === "messages" ? state.msgCols : state.threadCols;
            resizeWidthStart = cols[resizeIdx].width;
            handle.classList.add("dragging");
            document.addEventListener("mousemove", onColResize);
            document.addEventListener("mouseup", onColResizeEnd);
        });

        function onColResize(e) {
            const cols = state.view === "messages" ? state.msgCols : state.threadCols;
            const totalWidth = dom.listHeader.offsetWidth;
            const delta = ((e.clientX - resizeStart) / totalWidth) * 100;
            cols[resizeIdx].width = Math.max(5, Math.min(80, resizeWidthStart + delta));
            renderHeader();
            renderList();
        }

        function onColResizeEnd() {
            document.removeEventListener("mousemove", onColResize);
            document.removeEventListener("mouseup", onColResizeEnd);
            $$(".col-resize.dragging").forEach((h) => h.classList.remove("dragging"));
            resizeIdx = -1;
        }

        // Row click
        dom.listBody.addEventListener("click", (e) => {
            const row = e.target.closest(".list-row");
            if (!row) return;
            const id = row.dataset.id;
            state.selectedId = id;
            renderList();
            renderDetail(id);
            dom.listBody.focus();
        });

        // Keyboard navigation in list
        dom.listBody.addEventListener("keydown", (e) => {
            const rows = [...dom.listBody.querySelectorAll(".list-row")];
            if (rows.length === 0) return;
            const currentIdx = rows.findIndex((r) => r.dataset.id === state.selectedId);

            if (e.key === "ArrowDown") {
                e.preventDefault();
                const next = Math.min(currentIdx + 1, rows.length - 1);
                selectRow(rows, next);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                const prev = Math.max(currentIdx - 1, 0);
                selectRow(rows, prev);
            } else if (e.key === "Enter" && currentIdx >= 0) {
                e.preventDefault();
                state.selectedId = rows[currentIdx].dataset.id;
                renderList();
                renderDetail(state.selectedId);
                dom.listBody.focus();
            }
        });

        function selectRow(rows, idx) {
            state.selectedId = rows[idx].dataset.id;
            renderList();
            renderDetail(state.selectedId);
            dom.listBody.focus();
            const sel = dom.listBody.querySelector(".list-row.selected");
            if (sel) sel.scrollIntoView({ block: "nearest" });
        }

        // Panel divider resize
        let panelDragging = false;
        dom.panelDivider.addEventListener("mousedown", (e) => {
            e.preventDefault();
            panelDragging = true;
            dom.panelDivider.classList.add("dragging");
            document.addEventListener("mousemove", onPanelResize);
            document.addEventListener("mouseup", onPanelResizeEnd);
        });

        function onPanelResize(e) {
            if (!panelDragging) return;
            const rect = dom.content.getBoundingClientRect();
            const pct = ((e.clientX - rect.left) / rect.width) * 100;
            const clamped = Math.max(20, Math.min(80, pct));
            dom.content.style.gridTemplateColumns = `${clamped}% 6px 1fr`;
        }

        function onPanelResizeEnd() {
            panelDragging = false;
            dom.panelDivider.classList.remove("dragging");
            document.removeEventListener("mousemove", onPanelResize);
            document.removeEventListener("mouseup", onPanelResizeEnd);
        }
    }

    // ── URL Params ─────────────────────────────

    function readUrlParams() {
        const p = new URLSearchParams(window.location.search);
        if (p.get("mode")) state.mode = p.get("mode");
        if (p.get("user")) state.userHandle = p.get("user");
        if (p.get("view")) state.view = p.get("view");

        // Reflect in UI
        $$(".mode-switch button").forEach((b) => b.classList.toggle("active", b.dataset.mode === state.mode));
        $$(".view-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
        dom.userSelect.style.display = state.mode === "user" ? "" : "none";
        if (state.mode === "user" && state.userHandle) dom.userSelect.value = state.userHandle;
    }

    function updateUrlParams() {
        const p = new URLSearchParams();
        p.set("mode", state.mode);
        if (state.mode === "user" && state.userHandle) p.set("user", state.userHandle);
        if (state.view !== "messages") p.set("view", state.view);
        window.history.replaceState({}, "", "?" + p.toString());
    }

    // ── Init ───────────────────────────────────

    async function init() {
        try {
            const configRes = await fetch("/config");
            const config = await configRes.json();
            state.apiUrl = config.api_url;
        } catch {
            state.apiUrl = "http://127.0.0.1:8700";
        }

        readUrlParams();
        initEvents();

        // Set initial sort based on view
        state.sortKey = state.view === "messages" ? "timestamp" : "last_activity";

        startPolling();
    }

    init();
})();
