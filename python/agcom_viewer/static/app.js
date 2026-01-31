/**
 * agcom Viewer - Frontend Application
 */

// State
const state = {
    apiUrl: 'http://localhost:8700',
    token: null,
    mode: 'admin',
    user: 'admin',
    selectedThread: null,
    threads: [],
    messages: [],
    lastMessageId: null,
    autoRefresh: true,
    refreshInterval: null,
    // New state for features
    availableUsers: [],
    currentView: 'threads',
    allMessages: [],
    allMessagesLastId: null,
    selectedMessage: null,
    // Search and sort
    searchQuery: '',
    threadSort: { field: 'time', asc: false },  // newest first
    messageSort: { field: 'time', asc: false }, // newest first
    // Keyboard nav
    focusedIndex: -1,
    // Time filter
    timeFilter: null,  // ISO timestamp string or null
    // Column widths persistence
    columnWidths: {
        threads: {},   // { subject: 200, participants: 150, count: 40, time: 75 }
        messages: {}   // { time: 70, from: 80, to: 80, subject: null }
    }
};

// DOM Elements
const elements = {
    modeSelect: document.getElementById('mode-select'),
    userSelect: document.getElementById('user-select'),
    userInput: document.getElementById('user-input'),
    loginBtn: document.getElementById('login-btn'),
    statusIndicator: document.getElementById('status-indicator'),
    statusText: document.getElementById('status-text'),
    threadsList: document.getElementById('threads-list'),
    messagesList: document.getElementById('messages-list'),
    messagesTitle: document.getElementById('messages-title'),
    messagesSubtitle: document.getElementById('messages-subtitle'),
    refreshBtn: document.getElementById('refresh-btn'),
    autoRefreshToggle: document.getElementById('auto-refresh-toggle'),
    statThreads: document.getElementById('stat-threads'),
    statMessages: document.getElementById('stat-messages'),
    statUsers: document.getElementById('stat-users'),
    // New elements for features
    threadsTab: document.getElementById('threads-tab'),
    messagesTab: document.getElementById('messages-tab'),
    threadsView: document.getElementById('threads-view'),
    messagesView: document.getElementById('messages-view'),
    allMessagesList: document.getElementById('all-messages-list'),
    // Search, sort, resize
    searchInput: document.getElementById('search-input'),
    resizeHandle: document.getElementById('resize-handle'),
    listPanel: document.getElementById('list-panel'),
    // Time filter
    timeFilter: document.getElementById('time-filter')
};

// Initialize
async function init() {
    // Load config from server
    try {
        const config = await fetch('/api/config').then(r => r.json());
        state.apiUrl = config.api_url;
    } catch (e) {
        console.warn('Could not load config, using defaults');
    }

    // Bind events
    elements.modeSelect.addEventListener('change', onModeChange);
    elements.loginBtn.addEventListener('click', login);
    elements.userInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') login();
    });
    elements.userSelect.addEventListener('change', onUserSelectChange);
    elements.refreshBtn.addEventListener('click', refresh);
    elements.autoRefreshToggle.addEventListener('change', toggleAutoRefresh);
    elements.threadsTab.addEventListener('click', () => switchView('threads'));
    elements.messagesTab.addEventListener('click', () => switchView('messages'));

    // Search
    elements.searchInput.addEventListener('input', onSearchInput);

    // Time filter
    elements.timeFilter.addEventListener('change', onTimeFilterChange);

    // Sort - delegate to header clicks
    elements.threadsView.querySelector('.list-header').addEventListener('click', e => onSortClick(e, 'threads'));
    elements.messagesView.querySelector('.list-header').addEventListener('click', e => onSortClick(e, 'messages'));

    // Keyboard navigation
    elements.threadsList.addEventListener('keydown', e => onListKeydown(e, 'threads'));
    elements.allMessagesList.addEventListener('keydown', e => onListKeydown(e, 'messages'));

    // Resize handle
    initResize();

    // Check if we have a user in URL params
    const params = new URLSearchParams(window.location.search);
    if (params.has('user')) {
        elements.userInput.value = params.get('user');
    }
    if (params.has('mode')) {
        elements.modeSelect.value = params.get('mode');
        state.mode = params.get('mode');
    }

    // Start auto-refresh
    toggleAutoRefresh();

    // Load available users
    loadAvailableUsers();
}

// Mode change handler
function onModeChange() {
    state.mode = elements.modeSelect.value;
    // Re-login with new mode
    if (state.token) {
        login();
    }
}

// Load available users via temp admin login
async function loadAvailableUsers() {
    try {
        // Login as admin temporarily to get user list
        const loginRes = await fetch(`${state.apiUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle: 'admin' })
        });

        if (!loginRes.ok) {
            console.warn('loadAvailableUsers: admin login failed:', loginRes.status);
            return;
        }

        const loginData = await loginRes.json();
        const tempToken = loginData.token;

        // Fetch users
        const usersRes = await fetch(`${state.apiUrl}/api/admin/users`, {
            headers: { 'Authorization': `Bearer ${tempToken}` }
        });

        if (!usersRes.ok) {
            console.warn('loadAvailableUsers: /api/admin/users failed:', usersRes.status);
            return;
        }

        const usersData = await usersRes.json();
        state.availableUsers = usersData.users || [];
        console.log('loadAvailableUsers: loaded', state.availableUsers.length, 'users');

        // Populate dropdown
        populateUserDropdown();

    } catch (e) {
        console.warn('loadAvailableUsers: network error (is agcom-api running?):', e.message);
    }
}

// Populate user dropdown
function populateUserDropdown() {
    // Clear existing options except first
    elements.userSelect.innerHTML = '<option value="">-- Select user --</option>';

    // Add users
    state.availableUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.handle;
        option.textContent = user.handle;
        elements.userSelect.appendChild(option);
    });
}

// User select change handler
function onUserSelectChange() {
    const selected = elements.userSelect.value;
    if (selected) {
        elements.userInput.value = selected;
        elements.userInput.classList.add('hidden');
    } else {
        elements.userInput.classList.remove('hidden');
    }
}

// Switch between threads and all-messages views
function switchView(view) {
    state.currentView = view;

    // Update tab states
    elements.threadsTab.classList.toggle('active', view === 'threads');
    elements.messagesTab.classList.toggle('active', view === 'messages');

    // Show/hide view containers
    elements.threadsView.classList.toggle('hidden', view !== 'threads');
    elements.messagesView.classList.toggle('hidden', view !== 'messages');

    // Update title
    if (view === 'threads') {
        elements.messagesTitle.textContent = state.selectedThread ?
            (state.threads.find(t => t.thread_id === state.selectedThread)?.subject || 'Messages') :
            'Messages';
        elements.messagesSubtitle.textContent = '';
    } else {
        elements.messagesTitle.textContent = 'All Messages';
        elements.messagesSubtitle.textContent = state.allMessages.length ?
            `(${state.allMessages.length} messages)` : '';
        loadAllMessages();
    }
}

// Refresh handler
async function refresh() {
    if (state.currentView === 'threads') {
        await loadThreads();
    } else {
        await loadAllMessages();
    }
}

// Search input handler
function onSearchInput(e) {
    state.searchQuery = e.target.value.toLowerCase();
    state.focusedIndex = -1;
    if (state.currentView === 'threads') {
        renderThreads();
    } else {
        renderAllMessages();
    }
}

// Time filter change handler
function onTimeFilterChange(e) {
    state.timeFilter = e.target.value ? new Date(e.target.value).toISOString() : null;
    state.focusedIndex = -1;
    if (state.currentView === 'threads') {
        renderThreads();
    } else {
        renderAllMessages();
    }
}

// Sort click handler
function onSortClick(e, view) {
    const sortable = e.target.closest('.sortable');
    if (!sortable) return;

    const field = sortable.dataset.sort;
    const sortState = view === 'threads' ? state.threadSort : state.messageSort;

    // Toggle direction if same field, otherwise set new field
    if (sortState.field === field) {
        sortState.asc = !sortState.asc;
    } else {
        sortState.field = field;
        sortState.asc = true;
    }

    // Update header icons
    updateSortIcons(view);

    // Re-render
    if (view === 'threads') {
        renderThreads();
    } else {
        renderAllMessages();
    }
}

// Update sort icons in headers
function updateSortIcons(view) {
    const container = view === 'threads' ? elements.threadsView : elements.messagesView;
    const sortState = view === 'threads' ? state.threadSort : state.messageSort;

    container.querySelectorAll('.sortable').forEach(el => {
        const icon = el.querySelector('.sort-icon');
        const isActive = el.dataset.sort === sortState.field;
        el.classList.toggle('active', isActive);
        icon.textContent = isActive ? (sortState.asc ? '▲' : '▼') : '';
    });
}

// Keyboard navigation
function onListKeydown(e, view) {
    const items = view === 'threads' ?
        elements.threadsList.querySelectorAll('.list-row') :
        elements.allMessagesList.querySelectorAll('.list-row');

    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.focusedIndex = Math.min(state.focusedIndex + 1, items.length - 1);
        updateFocus(items);
        // Auto-select on arrow nav
        items[state.focusedIndex].click();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.focusedIndex = Math.max(state.focusedIndex - 1, 0);
        updateFocus(items);
        // Auto-select on arrow nav
        items[state.focusedIndex].click();
    } else if (e.key === 'Enter' && state.focusedIndex >= 0) {
        e.preventDefault();
        items[state.focusedIndex].click();
    }
}

// Update focus highlight
function updateFocus(items) {
    items.forEach((item, i) => {
        item.classList.toggle('focused', i === state.focusedIndex);
        if (i === state.focusedIndex) {
            item.scrollIntoView({ block: 'nearest' });
        }
    });
}

// Initialize resize functionality
function initResize() {
    // Panel resize
    let isResizing = false;
    let startX, startWidth;

    elements.resizeHandle.addEventListener('mousedown', e => {
        isResizing = true;
        startX = e.clientX;
        startWidth = elements.listPanel.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', e => {
        if (!isResizing) return;
        const diff = e.clientX - startX;
        const newWidth = Math.max(300, Math.min(800, startWidth + diff));
        elements.listPanel.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });

    // Column resize
    initColumnResize();
}

// Column resize functionality
function initColumnResize() {
    let activeResize = null;
    let startX, startWidth;

    // Handle mousedown on resize handles
    document.addEventListener('mousedown', e => {
        const handle = e.target.closest('.col-resize');
        if (!handle) return;

        e.preventDefault();
        e.stopPropagation();

        const col = handle.parentElement;
        activeResize = {
            col: col,
            colName: col.dataset.col,
            view: col.closest('.view-content').id
        };
        startX = e.clientX;
        startWidth = col.offsetWidth;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', e => {
        if (!activeResize) return;

        const diff = e.clientX - startX;
        const newWidth = Math.max(50, startWidth + diff);

        // Apply to header
        activeResize.col.style.flex = `0 0 ${newWidth}px`;
        activeResize.col.style.minWidth = `${newWidth}px`;

        // Apply to all rows in the list
        const viewId = activeResize.view;
        const colClass = `.col-${activeResize.colName}`;
        const listId = viewId === 'threads-view' ? 'threads-list' : 'all-messages-list';

        document.querySelectorAll(`#${listId} ${colClass}`).forEach(cell => {
            cell.style.flex = `0 0 ${newWidth}px`;
            cell.style.minWidth = `${newWidth}px`;
        });
    });

    document.addEventListener('mouseup', () => {
        if (activeResize) {
            // Store the final width for persistence
            const viewKey = activeResize.view === 'threads-view' ? 'threads' : 'messages';
            const newWidth = activeResize.col.offsetWidth;
            state.columnWidths[viewKey][activeResize.colName] = newWidth;

            activeResize = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// Get inline style for column based on stored width
function getColumnStyle(view, colName) {
    const width = state.columnWidths[view]?.[colName];
    return width ? `style="flex: 0 0 ${width}px; min-width: ${width}px;"` : '';
}

// Login
async function login() {
    // Prefer dropdown, fallback to text input
    const user = elements.userSelect.value || elements.userInput.value.trim();
    if (!user) {
        alert('Please select or enter a user handle');
        return;
    }

    state.user = user;
    setStatus('connecting', 'Connecting...');

    try {
        const res = await fetch(`${state.apiUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle: user })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Login failed');
        }

        const data = await res.json();
        state.token = data.token;
        setStatus('connected', `Connected as ${user}`);

        // Load data
        await loadThreads();
        await loadStats();

    } catch (e) {
        setStatus('disconnected', `Error: ${e.message}`);
        state.token = null;
    }
}

// Set connection status
function setStatus(status, text) {
    elements.statusIndicator.className = status;
    elements.statusText.textContent = text;
}

// API call helper
async function apiCall(endpoint, options = {}) {
    if (!state.token) {
        throw new Error('Not logged in');
    }

    const headers = {
        'Authorization': `Bearer ${state.token}`,
        ...options.headers
    };

    const res = await fetch(`${state.apiUrl}${endpoint}`, {
        ...options,
        headers
    });

    if (!res.ok) {
        if (res.status === 401) {
            state.token = null;
            setStatus('disconnected', 'Session expired');
            throw new Error('Session expired');
        }
        if (res.status === 403) {
            throw new Error('Admin privileges required');
        }
        const err = await res.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(err.detail || err.message || 'Request failed');
    }

    return res.json();
}

// Load threads
async function loadThreads() {
    if (!state.token) return;

    try {
        let data;
        if (state.mode === 'admin') {
            data = await apiCall('/api/admin/threads?limit=100');
        } else {
            data = await apiCall('/api/threads?limit=100');
        }

        state.threads = data.threads;
        renderThreads();

    } catch (e) {
        console.error('Failed to load threads:', e);
        elements.threadsList.innerHTML = `<div class="error">${e.message}</div>`;
    }
}

// Render threads
function renderThreads() {
    if (state.threads.length === 0) {
        elements.threadsList.innerHTML = '<p class="placeholder">No threads found</p>';
        return;
    }

    // Filter by time
    let filtered = state.threads;
    if (state.timeFilter) {
        filtered = filtered.filter(t => t.last_activity_at >= state.timeFilter);
    }

    // Filter by search
    if (state.searchQuery) {
        filtered = filtered.filter(t =>
            t.subject.toLowerCase().includes(state.searchQuery) ||
            t.participant_handles.some(p => p.toLowerCase().includes(state.searchQuery))
        );
    }

    // Sort
    const { field, asc } = state.threadSort;
    filtered = [...filtered].sort((a, b) => {
        let cmp = 0;
        if (field === 'subject') {
            cmp = a.subject.localeCompare(b.subject);
        } else if (field === 'participants') {
            cmp = a.participant_handles.join(',').localeCompare(b.participant_handles.join(','));
        } else if (field === 'count') {
            cmp = (a.message_count || 0) - (b.message_count || 0);
        } else if (field === 'time') {
            cmp = new Date(a.last_activity_at) - new Date(b.last_activity_at);
        }
        return asc ? cmp : -cmp;
    });

    if (filtered.length === 0) {
        elements.threadsList.innerHTML = '<p class="placeholder">No matches</p>';
        return;
    }

    elements.threadsList.innerHTML = filtered.map((t, i) => {
        const isSelected = state.selectedThread === t.thread_id;
        const isFocused = state.focusedIndex === i;
        const time = formatTime(t.last_activity_at);
        const participants = t.participant_handles.join(', ');
        const count = t.message_count || '-';

        return `
            <div class="list-row ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}"
                 data-thread-id="${t.thread_id}"
                 onclick="selectThread('${t.thread_id}')">
                <span class="col-subject" ${getColumnStyle('threads', 'subject')}>${escapeHtml(t.subject)}</span>
                <span class="col-participants" ${getColumnStyle('threads', 'participants')}>${escapeHtml(participants)}</span>
                <span class="col-count" ${getColumnStyle('threads', 'count')}>${count}</span>
                <span class="col-time" ${getColumnStyle('threads', 'time')}>${time}</span>
            </div>
        `;
    }).join('');
}

// Select thread
async function selectThread(threadId) {
    state.selectedThread = threadId;
    renderThreads();

    try {
        let data;
        if (state.mode === 'admin') {
            data = await apiCall(`/api/admin/threads/${threadId}/messages`);
        } else {
            data = await apiCall(`/api/threads/${threadId}/messages`);
        }

        state.messages = data.messages;
        elements.messagesTitle.textContent = data.thread.subject;
        renderMessages();

        // Update last message ID for polling
        if (state.messages.length > 0) {
            state.lastMessageId = state.messages[state.messages.length - 1].message_id;
        }

    } catch (e) {
        console.error('Failed to load messages:', e);
        elements.messagesList.innerHTML = `<div class="error">${e.message}</div>`;
    }
}

// Render messages
function renderMessages() {
    if (state.messages.length === 0) {
        elements.messagesList.innerHTML = '<p class="placeholder">No messages in this thread</p>';
        return;
    }

    elements.messagesList.innerHTML = state.messages.map(m => {
        const time = formatTime(m.created_at);
        const toList = m.to_handles.join(', ');
        const tags = m.tags ? m.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('') : '';

        return `
            <div class="message-item" data-message-id="${m.message_id}">
                <div class="message-header">
                    <div>
                        <span class="message-from">${escapeHtml(m.from_handle)}</span>
                        <span class="message-to">→ ${escapeHtml(toList)}</span>
                    </div>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-subject">${escapeHtml(m.subject)}</div>
                <div class="message-body">${escapeHtml(m.body)}</div>
                ${tags ? `<div class="message-tags">${tags}</div>` : ''}
            </div>
        `;
    }).join('');

    // Scroll to bottom
    elements.messagesList.scrollTop = elements.messagesList.scrollHeight;
}

// Load stats (admin only)
async function loadStats() {
    if (!state.token || state.mode !== 'admin') {
        elements.statThreads.textContent = '-';
        elements.statMessages.textContent = '-';
        elements.statUsers.textContent = '-';
        return;
    }

    try {
        const data = await apiCall('/api/admin/stats');
        elements.statThreads.textContent = data.threads;
        elements.statMessages.textContent = data.messages;
        elements.statUsers.textContent = data.users;
    } catch (e) {
        console.error('Failed to load stats:', e);
    }
}

// Load all messages (admin or user mode)
async function loadAllMessages() {
    if (!state.token) return;

    try {
        let allMessages = [];

        if (state.mode === 'admin') {
            // Admin: fetch all messages directly
            const data = await apiCall('/api/admin/messages?limit=100');
            allMessages = data.messages || [];
        } else {
            // User mode: aggregate messages from user's threads
            const threadsData = await apiCall('/api/threads?limit=100');
            const threads = threadsData.threads || [];

            // Fetch messages from each thread (limit to first 20 threads to avoid too many requests)
            const threadPromises = threads.slice(0, 20).map(t =>
                apiCall(`/api/threads/${t.thread_id}/messages`).catch(() => ({ messages: [] }))
            );
            const results = await Promise.all(threadPromises);

            // Combine all messages
            results.forEach(r => {
                allMessages.push(...(r.messages || []));
            });

            // Sort by created_at descending (newest first, like admin endpoint)
            allMessages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            // Limit to 100
            allMessages = allMessages.slice(0, 100);
        }

        state.allMessages = allMessages;

        // Update last ID for polling
        if (state.allMessages.length > 0) {
            state.allMessagesLastId = state.allMessages[0].message_id;
        }

        renderAllMessages();
        elements.messagesSubtitle.textContent = `(${state.allMessages.length} messages)`;

    } catch (e) {
        console.error('Failed to load all messages:', e);
        elements.allMessagesList.innerHTML = `<div class="error">${e.message}</div>`;
    }
}

// Render all messages (with filter and sort)
function renderAllMessages() {
    if (state.allMessages.length === 0) {
        elements.allMessagesList.innerHTML = '<p class="placeholder">No messages found</p>';
        return;
    }

    // Filter by time
    let filtered = state.allMessages;
    if (state.timeFilter) {
        filtered = filtered.filter(m => m.created_at >= state.timeFilter);
    }

    // Filter by search
    if (state.searchQuery) {
        filtered = filtered.filter(m =>
            m.subject.toLowerCase().includes(state.searchQuery) ||
            m.body.toLowerCase().includes(state.searchQuery) ||
            m.from_handle.toLowerCase().includes(state.searchQuery) ||
            m.to_handles.some(t => t.toLowerCase().includes(state.searchQuery))
        );
    }

    // Sort
    const { field, asc } = state.messageSort;
    filtered = [...filtered].sort((a, b) => {
        let cmp = 0;
        if (field === 'time') {
            cmp = new Date(a.created_at) - new Date(b.created_at);
        } else if (field === 'from') {
            cmp = a.from_handle.localeCompare(b.from_handle);
        } else if (field === 'to') {
            cmp = a.to_handles.join(',').localeCompare(b.to_handles.join(','));
        } else if (field === 'subject') {
            cmp = a.subject.localeCompare(b.subject);
        }
        return asc ? cmp : -cmp;
    });

    if (filtered.length === 0) {
        elements.allMessagesList.innerHTML = '<p class="placeholder">No matches</p>';
        return;
    }

    elements.allMessagesList.innerHTML = filtered.map((m, i) => {
        const time = formatTimeShort(m.created_at);
        const toList = m.to_handles.join(', ');
        const isSelected = state.selectedMessage === m.message_id;
        const isFocused = state.focusedIndex === i;

        return `
            <div class="list-row ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}"
                 data-message-id="${m.message_id}"
                 data-thread-id="${m.thread_id}"
                 onclick="selectMessage('${m.message_id}', '${m.thread_id}')">
                <span class="col-time" ${getColumnStyle('messages', 'time')}>${time}</span>
                <span class="col-from" ${getColumnStyle('messages', 'from')}>${escapeHtml(m.from_handle)}</span>
                <span class="col-to" ${getColumnStyle('messages', 'to')}>${escapeHtml(toList)}</span>
                <span class="col-subject" ${getColumnStyle('messages', 'subject')}>${escapeHtml(m.subject)}</span>
            </div>
        `;
    }).join('');
}

// Jump to thread from all-messages view
async function jumpToThread(threadId) {
    switchView('threads');
    await selectThread(threadId);
}

// Select a single message and show in detail pane
function selectMessage(messageId, threadId) {
    state.selectedMessage = messageId;
    renderAllMessages(); // Re-render to update selection

    // Find the message in state
    const message = state.allMessages.find(m => m.message_id === messageId);
    if (!message) return;

    // Show single message in the detail pane
    elements.messagesTitle.textContent = message.subject;
    elements.messagesSubtitle.textContent = '';

    const time = formatTime(message.created_at);
    const toList = message.to_handles.join(', ');
    const tags = message.tags ? message.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('') : '';

    elements.messagesList.innerHTML = `
        <div class="message-item" data-message-id="${message.message_id}">
            <div class="message-header">
                <div>
                    <span class="message-from">${escapeHtml(message.from_handle)}</span>
                    <span class="message-to">→ ${escapeHtml(toList)}</span>
                </div>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-subject">${escapeHtml(message.subject)}</div>
            <div class="message-body">${escapeHtml(message.body)}</div>
            ${tags ? `<div class="message-tags">${tags}</div>` : ''}
            <div class="message-actions">
                <button onclick="jumpToThread('${threadId}')" class="link-btn">View full thread →</button>
            </div>
        </div>
    `;
}

// Poll for new messages
async function pollMessages() {
    if (!state.token) return;

    try {
        if (state.mode === 'admin') {
            // Admin mode: use admin endpoint with since_id
            const endpoint = state.lastMessageId
                ? `/api/admin/messages?since_id=${state.lastMessageId}&limit=50`
                : '/api/admin/messages?limit=50';

            const data = await apiCall(endpoint);

            if (data.messages.length > 0) {
                // Update last message ID
                state.lastMessageId = data.messages[0].message_id;

                // Reload current thread if selected
                if (state.selectedThread) {
                    const hasNewInThread = data.messages.some(m => m.thread_id === state.selectedThread);
                    if (hasNewInThread) {
                        await selectThread(state.selectedThread);
                    }
                }

                // Reload threads to update order
                await loadThreads();
                await loadStats();

                // Also reload all-messages if that view is active
                if (state.currentView === 'messages') {
                    await loadAllMessages();
                }
            }
        } else {
            // User mode: just reload threads and all-messages periodically
            await loadThreads();

            if (state.currentView === 'messages') {
                await loadAllMessages();
            }

            // Reload selected thread if any
            if (state.selectedThread) {
                await selectThread(state.selectedThread);
            }
        }
    } catch (e) {
        console.error('Poll error:', e);
    }
}

// Toggle auto-refresh
function toggleAutoRefresh() {
    state.autoRefresh = elements.autoRefreshToggle.checked;

    if (state.refreshInterval) {
        clearInterval(state.refreshInterval);
        state.refreshInterval = null;
    }

    if (state.autoRefresh) {
        state.refreshInterval = setInterval(pollMessages, 3000);
    }
}

// Utilities
function formatTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;

    // Within last minute
    if (diff < 60000) {
        return 'just now';
    }
    // Within last hour
    if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return `${mins}m ago`;
    }
    // Within last 24 hours
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours}h ago`;
    }
    // Older
    return date.toLocaleDateString();
}

// Short time format for all-messages view (with seconds)
function formatTimeShort(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions available globally
window.selectThread = selectThread;
window.jumpToThread = jumpToThread;
window.selectMessage = selectMessage;

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
