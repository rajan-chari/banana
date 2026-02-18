# agcom-viewer -- Agent Communication Web Viewer Specification

## Overview

agcom-viewer is a web-based dashboard for monitoring and inspecting multi-agent communication. It provides a real-time, read-only view of messages and threads flowing through the [agcom-api](agcom-api-spec.md), supporting both an admin mode (see everything) and a user mode (see one agent's perspective). Its primary audience is developers debugging and observing agent team behavior.

## Core Concepts

### Dual-Mode Viewing
The viewer operates in two modes:
- **Admin mode**: God-mode view of all messages and threads across all agents -- for system-wide monitoring
- **User mode**: Filtered view showing only messages visible to a selected agent -- for perspective-checking and debugging individual agent behavior

### Master-Detail Layout
The UI follows a two-panel pattern: a scrollable list panel (threads or messages) on the left, and a detail panel on the right showing the selected thread's full conversation or a single message's content.

### Real-Time Monitoring
The viewer auto-refreshes on a short polling interval, providing near-real-time observation of agent communication without manual page reloads.

## Functional Requirements

### Authentication and Mode Selection
- Users can switch between Admin and User mode
- In User mode, users can select which agent's perspective to view (from a list of known agents)
- The viewer authenticates against the agcom-api to obtain a session token
- Connection status is visually indicated (connected/disconnected)
- Mode and user selection can be set via URL parameters for bookmarking

### Message Browsing
- Users can view a flat list of all messages with key columns: time, sender, recipients, subject
- Users can view a list of threads with columns: subject, participants, message count, last activity time
- Users can switch between Messages and Threads views via tabs
- Selecting a thread shows all its messages in chronological order as styled cards
- Selecting a message shows its details with a link to view the full thread
- Message cards display: sender, recipients, timestamp, subject, body, and tags

### Search and Filtering
- Users can filter the message/thread list by text search (across subject, body, sender, recipient fields)
- Users can filter by time range using a date/time picker
- Filters apply in real-time to the displayed list

### Column Interaction
- All list columns are sortable (click to toggle ascending/descending)
- Sort direction is visually indicated
- Column widths are resizable via drag handles

### Navigation
- Keyboard navigation: arrow keys to move through list rows, Enter to select
- From a message in the flat view, users can navigate to its parent thread
- Panel width is resizable via drag handle

### Real-Time Updates
- Auto-refresh polls for new data on a configurable interval (default ~3 seconds)
- Auto-refresh can be toggled on/off
- Incremental updates fetch only new messages since the last poll (in admin mode)

### Status Display
- Footer shows aggregate stats: thread count, message count, user count
- Connection status indicator with visual feedback (color, animation)

## Data Model

The viewer is a read-only client. It consumes the following data from the [agcom-api](agcom-api-spec.md):

| Data | Source Endpoint | Usage |
|------|----------------|-------|
| Messages | Messages list, admin messages | Flat message list, thread detail |
| Threads | Threads list, admin threads | Thread list, thread detail |
| Users | Admin users list | User mode agent selector |
| Stats | Admin stats | Footer counters |

The viewer maintains client-side state for: current mode, selected user, auth token, sort settings, column widths, selected item, and cached data.

## Integration Points

- **Depends on**: [agcom-api](agcom-api-spec.md) (all data comes from the REST API)
- **Depended on by**: Nothing -- the viewer is a leaf node in the dependency graph
- **Serving**: Runs as a lightweight static file server with a single config endpoint that provides the API URL
- **Discovery**: The viewer discovers the API URL dynamically via its own backend config endpoint, using the request hostname to avoid CORS issues

## Non-Functional Requirements

- **Read-only**: The viewer is strictly for observation -- no message composition or data modification
- **No build step**: Static assets (HTML, CSS, JS) should be servable without bundling or transpilation
- **Minimal dependencies**: No frontend framework required; vanilla web technologies preferred
- **Dark theme**: Optimized for extended monitoring sessions with a dark color scheme
- **Responsive columns**: Resizable and sortable columns for flexible data inspection
- **Keyboard accessible**: Full keyboard navigation for power users
- **Safe rendering**: All user-generated content (message bodies, subjects, handles) must be HTML-escaped to prevent injection
- **Graceful degradation**: Should handle API unavailability gracefully with clear connection status feedback
- **Low latency polling**: Auto-refresh should use incremental fetching (e.g., `since_id`) to minimize redundant data transfer
- **Lightweight serving**: The viewer's own backend should be minimal -- just static file hosting and a config endpoint
