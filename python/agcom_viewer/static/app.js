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
    refreshInterval: null
};

// DOM Elements
const elements = {
    modeSelect: document.getElementById('mode-select'),
    userInput: document.getElementById('user-input'),
    loginBtn: document.getElementById('login-btn'),
    statusIndicator: document.getElementById('status-indicator'),
    statusText: document.getElementById('status-text'),
    threadsList: document.getElementById('threads-list'),
    messagesList: document.getElementById('messages-list'),
    messagesTitle: document.getElementById('messages-title'),
    refreshThreadsBtn: document.getElementById('refresh-threads-btn'),
    autoRefreshToggle: document.getElementById('auto-refresh-toggle'),
    statThreads: document.getElementById('stat-threads'),
    statMessages: document.getElementById('stat-messages'),
    statUsers: document.getElementById('stat-users')
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
    elements.refreshThreadsBtn.addEventListener('click', loadThreads);
    elements.autoRefreshToggle.addEventListener('change', toggleAutoRefresh);

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
}

// Mode change handler
function onModeChange() {
    state.mode = elements.modeSelect.value;
    // Re-login with new mode
    if (state.token) {
        login();
    }
}

// Login
async function login() {
    const user = elements.userInput.value.trim();
    if (!user) {
        alert('Please enter a user handle');
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

    elements.threadsList.innerHTML = state.threads.map(t => {
        const isSelected = state.selectedThread === t.thread_id;
        const time = formatTime(t.last_activity_at);
        const participants = t.participant_handles.join(', ');

        return `
            <div class="thread-item ${isSelected ? 'selected' : ''}"
                 data-thread-id="${t.thread_id}"
                 onclick="selectThread('${t.thread_id}')">
                <div class="thread-subject">${escapeHtml(t.subject)}</div>
                <div class="thread-meta">${escapeHtml(participants)} (${time})</div>
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

// Poll for new messages
async function pollMessages() {
    if (!state.token || state.mode !== 'admin') return;

    try {
        // Get new messages since last ID
        const endpoint = state.lastMessageId
            ? `/api/admin/messages?since_id=${state.lastMessageId}&limit=50`
            : '/api/admin/messages?limit=50';

        const data = await apiCall(endpoint);

        if (data.messages.length > 0) {
            // Update last message ID
            state.lastMessageId = data.messages[0].message_id;

            // Reload current thread if selected
            if (state.selectedThread) {
                // Check if any new messages belong to current thread
                const hasNewInThread = data.messages.some(m => m.thread_id === state.selectedThread);
                if (hasNewInThread) {
                    await selectThread(state.selectedThread);
                }
            }

            // Reload threads to update order
            await loadThreads();
            await loadStats();
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make selectThread available globally
window.selectThread = selectThread;

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
