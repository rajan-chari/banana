# Teams-Like Collaboration App - Specification

Version: 1.0 | Date: 2026-02-06

---

## 1. Executive Summary

This document specifies a **Microsoft Teams-like real-time collaboration application** with:

- **1:1 and group chat** with rich text, replies, @mentions, reactions, link previews, and attachments
- **Teams & channels** with RBAC (owner/member/guest roles), private/shared channels, and communities
- **Real-time infrastructure** via WebSocket with presence, typing indicators, read receipts, and offline sync
- **Modern UI** with three-column layout, dark/light themes, responsive design

The four detailed specs are included inline below:

| Spec | Coverage |
|------|----------|
| [Core Messaging](#2-core-messaging--chat-system) | 10 data models, 16 API endpoints, 7 UI components, 14 edge cases |
| [Organization](#3-teams-channels--organizational-structure) | 8 data models, 20+ API endpoints, RBAC permission matrix |
| [Infrastructure](#4-real-time-infrastructure--notification-system) | WebSocket protocol, notification pipeline, search, scaling, failure modes |
| [UI/UX Design](#5-uiux-design-system--layout-architecture) | Layout, 50+ design tokens, responsive breakpoints, component library |

---

## 2. Core Messaging & Chat System

> Full spec: [specs/01-messaging.md](specs/01-messaging.md)

### 2.1 Data Models

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| User | id, display_name, email, avatar_url, status | User identity |
| Chat | id, type (direct/group), title, last_message_at | Conversation container |
| ChatMember | chat_id, user_id, role, last_read_message_id | Membership + per-user settings |
| Message | id, chat_id, sender_id, content (HTML), reply_to_id, is_edited | Core message |
| MessageMention | message_id, mentioned_user_id, offset, length | @mention tracking |
| MessageReaction | message_id, user_id, emoji | Emoji reactions (toggle) |
| MessageAttachment | message_id, file_name, file_size, mime_type, storage_url | File attachments |
| LinkPreview | message_id, url, title, description, image_url, domain | URL preview cards |
| ReadReceipt | chat_id, user_id, message_id | Watermark-based read tracking |
| TypingIndicator | chat_id, user_id (ephemeral, not persisted) | Real-time typing state |

### 2.2 API Endpoints (16)

| Group | Endpoints |
|-------|-----------|
| Chats | `GET /chats`, `POST /chats`, `GET /chats/:id`, `PATCH /chats/:id`, `POST /chats/:id/leave` |
| Members | `POST /chats/:id/members`, `DELETE /chats/:id/members/:uid`, `PATCH /chats/:id/members/me` |
| Messages | `GET /chats/:id/messages`, `POST /chats/:id/messages`, `PATCH /chats/:id/messages/:mid`, `DELETE /chats/:id/messages/:mid`, `POST /chats/:id/messages/:mid/reactions` |
| Read/Typing | `POST /chats/:id/read`, `GET /chats/:id/read-receipts`, `POST /chats/:id/typing` |
| Attachments | `POST /chats/:id/attachments`, `GET /chats/:id/attachments/:aid/download` |
| Search | `GET /chats/search` (full-text, filters: chat_id, from, date range, has:attachment/link/mention) |

### 2.3 Key Business Rules

- Direct chats: exactly 2 members, unique per pair
- Group chats: 3-250 members, title required
- Messages: max 28,000 chars, flat replies only (no nesting)
- Reactions: toggle behavior, max 20 distinct emoji per message
- Attachments: max 250 MB each, max 10 per message
- Read receipts: watermark model (latest read position per user per chat)
- Rate limits: 30 msgs/min/user/chat, 10 edits/min, 60 reactions/min

### 2.4 WebSocket Events (11 types)

`message.created`, `message.updated`, `message.deleted`, `reaction.added`, `reaction.removed`, `typing.started`, `typing.stopped`, `read_receipt.updated`, `member.added`, `member.removed`, `chat.updated`

---

## 3. Teams, Channels & Organizational Structure

> Full spec: [specs/02-organization.md](specs/02-organization.md)

### 3.1 Data Models

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| Team | id, name, visibility (public/private), is_archived | Team container |
| TeamMembership | team_id, user_id, role (owner/member/guest) | Team membership |
| Channel | id, team_id, name, type (standard/private/shared), is_general | Channel within team |
| ChannelMembership | channel_id, user_id, role | Private/shared channel access |
| Community | id, name, join_policy (open/approval/invite) | Cross-team interest groups |
| CommunityMembership | community_id, user_id, role (owner/moderator/member) | Community membership |
| UserPresence | user_id, status, status_message, last_active_at | Real-time presence |
| UserProfile | user_id, display_name, title, department, location | Profile card data |

### 3.2 Hierarchy

```
Organization
  └── Team (public/private, owner/member/guest roles)
        └── Channel (standard/private/shared)
              └── Conversation Thread
                    └── Message / Reply
```

### 3.3 RBAC Permission Matrix

**Team Roles:**

| Action | Owner | Member | Guest |
|--------|:-----:|:------:|:-----:|
| View standard channels | Y | Y | Y |
| Post in standard channels | Y | Y | N |
| Create channels | Y | Y | N |
| Edit team info | Y | N | N |
| Add/remove members | Y | Y* | N |
| Delete team | Y | N | N |

*Members can add other members but not owners/guests.

**Channel Roles (private/shared):** Owner can add/remove members, edit, delete. Members can view and post.

**Community Roles:** Owner > Moderator > Member. Moderators can approve joins and remove members.

### 3.4 Key Rules

- Each team auto-creates a "General" channel (undeletable, always standard)
- Standard channels inherit team membership; private channels require explicit membership
- Presence visible only to users who share a team or active chat
- Auto-away after 5 min idle, auto-offline after 60s disconnect
- Limits: 250 teams/user, 200 standard + 30 private + 10 shared channels/team, 25,000 members/team

---

## 4. Real-time Infrastructure & Notification System

> Full spec: [specs/03-infrastructure.md](specs/03-infrastructure.md)

### 4.1 Architecture

```
Clients --> Load Balancer --> WS Gateways --> Pub/Sub (Redis Streams)
                                                  |
                              +---+---+---+---+---+---+
                              |   |   |   |   |   |   |
                           Router Presence Notify Search Sync
                              |               |       |
                           Postgres        Push    Elasticsearch
                           + Redis         Services
```

### 4.2 WebSocket Protocol

**Frame format:** JSON with `type`, `id`, `timestamp`, `payload`

**Client -> Server (10 types):** message.send, message.edit, message.delete, message.react, typing.start, typing.stop, read.mark, presence.update, sync.request, search.query

**Server -> Client (13 types):** message.new, message.updated, message.deleted, message.reaction, typing.indicator, read.receipt, presence.changed, notification.badge, notification.toast, sync.response, search.results, ack, error

**Delivery:** At-least-once with client-side idempotency (UUID dedup). Ordering by server-assigned sequence number per chat.

### 4.3 Notification Pipeline

```
New Message --> Evaluator --> Check DND + Preferences
                                |
                    +-----------+-----------+
                    |           |           |
                  Badge     Toast       Push Queue
                  Counter   Generator   (offline users)
                    |           |           |
                  WS frame   WS frame   FCM/APNs/WNS
```

- **Notification levels per chat:** all | mentions_only | off
- **DND:** Suppresses toast/push, still updates badges. Urgent messages (max 3/hour) bypass DND.
- **Aggregation:** Badge on Chat nav icon = total across all chats. Per-chat badges in sidebar.

### 4.4 Presence System

States: Available (green) -> Away (yellow, auto after 5min) -> DND (red) -> Offline (gray)

Lazy propagation: clients subscribe only to visible contacts. Batch updates every 2 seconds.

### 4.5 Search

- Elasticsearch with message index (near real-time, ~1-2s lag)
- Scopes: global, in-chat, people, files
- Query parsing: `from:alice budget meeting last week`
- Access-controlled: results filtered by user's memberships

### 4.6 Offline & Sync

- IndexedDB client cache (~50 MB budget)
- Reconnection gap-fill via sequence numbers
- Optimistic UI for sends, reactions, reads, edits, deletes
- Offline queue for pending messages

### 4.7 Scaling

| Tier | Connections | Gateways | Redis |
|------|------------|----------|-------|
| Small (<10K) | ~5K | 2 | 1+1 |
| Medium (10-100K) | ~50K | 5-10 | 3+3 |
| Large (100K-1M) | ~500K | 20-50 | 6+6 cluster |

### 4.8 Technology Stack

| Component | Choice | Alternative |
|-----------|--------|-------------|
| WS Gateway | Node.js (uWebSockets.js) or Go | Rust |
| Pub/Sub | Redis Streams | NATS, Kafka |
| Message Store | PostgreSQL | CockroachDB |
| Cache | Redis | Dragonfly |
| Search | Elasticsearch | Meilisearch |
| File Store | S3-compatible | Azure Blob |
| Push | FCM + APNs | OneSignal |

---

## 5. UI/UX Design System & Layout Architecture

> Full spec: [specs/04-ui-design.md](specs/04-ui-design.md)

### 5.1 Layout

```
+------------------------------------------------------------------+
|                          TOP BAR (48px)                           |
| [<] [>]  [Logo]     [ Search (Ctrl+E)        ]   [?][A][_][O][X] |
+------+----------+-------------------------------------------+----+
|      |          |         CHAT HEADER (56px)                |    |
| NAV  | SIDEBAR  | [Chat] [Shared] [Recap] [Q&A] [+1] [+]  |    |
| RAIL | (320px)  |          Right: 38 members, search, etc.  |    |
| 48px |----------+-------------------------------------------+    |
|      | Filters  |         MESSAGE AREA (flex, scroll)       |    |
|      | Chat     |         Messages + date dividers          |    |
|      | List     |         [New messages indicator]          |    |
|      |          +-------------------------------------------+    |
|      | Teams &  |         COMPOSE BAR (52-120px)            |    |
|      | Channels | [Type a message...        ] [emoji][send] |    |
+------+----------+-------------------------------------------+----+
```

### 5.2 Design Tokens (Dark Theme)

| Category | Key Values |
|----------|-----------|
| Backgrounds | App: #1b1b1b, Sidebar: #292929, Content: #1f1f1f, Hover: #383838 |
| Text | Primary: #ffffff, Secondary: #adadad, Tertiary: #8a8a8a |
| Accent | Primary: #6264a7 (Teams purple) |
| Status | Online: #92c353 (green), Away: #f8d22a (yellow), Busy: #c4314b (red), Offline: #8a8a8a |
| Badges | Background: #c4314b (red), Text: #ffffff |
| Mentions | Background: rgba(98,100,167,0.3), Text: #a4a5d6 |

### 5.3 Typography

- Font: Segoe UI, system fallbacks
- Scale: 10px (badges) -> 12px (captions) -> 14px (body) -> 16-24px (headings)
- Spacing: 4px base grid

### 5.4 Responsive Breakpoints

| Breakpoint | Layout |
|-----------|--------|
| xs (0-479) | Single column, bottom tab nav, full-screen sidebar overlay |
| sm (480-767) | Single column, bottom tab nav, sidebar overlay |
| md (768-1023) | Nav rail + content, sidebar as hamburger overlay |
| lg (1024-1365) | Nav rail + narrow sidebar (280px) + content |
| xl (1366-1919) | Full layout, sidebar 320px |
| 2xl (1920+) | Full layout, sidebar 360px |

### 5.5 Component Library (Atomic Design)

| Level | Components |
|-------|-----------|
| **Atoms** | Avatar, Badge, Button, Divider, Icon, Input, Pill, Spinner, Tag, Tooltip, ToggleSwitch, DropdownMenu |
| **Molecules** | ChatListItem, SearchBar, TabBar, QuotedMessage, LinkPreviewCard, DateDivider, MemberCount, MessageActions, FilterTabs, FormatToolbar |
| **Organisms** | NavRail, Sidebar, ChatHeader, MessageArea, ComposeBar, MessageThread |
| **Templates** | AppShell, ChatView, SettingsView |

### 5.6 Accessibility (WCAG 2.1 AA)

- Color contrast: >= 4.5:1 normal text, >= 3:1 large text / UI components
- Full keyboard navigation with documented shortcuts
- ARIA landmarks, roles, and live regions for all components
- Reduced motion support via `prefers-reduced-motion`
- Skip links, focus management, screen reader support

---

## 6. Unified Data Model

```
User 1──* TeamMembership *──1 Team 1──* Channel
User 1──* ChatMember *──1 Chat
User 1──* Message *──1 Chat
User 1──* CommunityMembership *──1 Community
User 1──1 UserPresence
User 1──1 UserProfile
Message 1──* MessageMention
Message 1──* MessageReaction
Message 1──* MessageAttachment
Message 1──* LinkPreview
Message 0..1──* Message (reply_to_id)
User 1──1 ReadReceipt ──1 Chat
Channel ──< ChannelMembership (private/shared only)
```

**Total entities: 18** (User, Chat, ChatMember, Message, MessageMention, MessageReaction, MessageAttachment, LinkPreview, ReadReceipt, Team, TeamMembership, Channel, ChannelMembership, Community, CommunityMembership, UserPresence, UserProfile, TypingIndicator)

---

## 7. API Reference Summary

| Domain | Endpoints | Base Path |
|--------|----------|-----------|
| Chats & Messages | 16 | `/api/v1/chats` |
| Teams | 5 | `/api/v1/teams` |
| Team Members | 4 | `/api/v1/teams/:id/members` |
| Channels | 5 | `/api/v1/teams/:id/channels` |
| Channel Members | 3 | `/api/v1/teams/:id/channels/:id/members` |
| Communities | 4 | `/api/v1/communities` |
| Presence | 2 | `/api/v1/users/:id/presence` |
| Profile | 2 | `/api/v1/users/:id/profile` |
| Conversations | 1 | `/api/v1/conversations` |
| Search | 1 | `/api/v1/search` |
| WebSocket | 1 | `/ws` |
| **Total** | **~44** | |

---

## 8. Tech Stack Recommendations

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | React/TypeScript | Atomic design component library |
| **Styling** | CSS Modules + Custom Properties | Dark/light theme via `data-theme` |
| **WS Gateway** | Node.js or Go | ~10K connections per instance |
| **REST API** | Node.js (Express/Fastify) or Go | Standard REST with JWT auth |
| **Database** | PostgreSQL | Partitioned by chat_id + time archival |
| **Cache** | Redis | Presence, badges, pub/sub |
| **Pub/Sub** | Redis Streams | Start here; Kafka if >1M users |
| **Search** | Elasticsearch | Near real-time indexing |
| **File Storage** | S3/Azure Blob | CDN for reads |
| **Push** | FCM + APNs + WNS | Platform-native push |
| **Desktop** | Electron or Tauri | Frameless window, tray icon |
| **Mobile** | React Native | Shared business logic |

---

## 9. MVP Scope

> **Last audited: 2026-02-07 (updated after UI polish session)**

### Phase 1: Core Chat — COMPLETE
- [x] User auth (JWT) — register, login, token validation, WS auth via query param
- [x] 1:1 and group chat (create, list, send messages) — direct + group types, member management
- [x] Rich text messages (bold, italic, code) — RichText atom parses markdown-style formatting, code blocks
- [x] Message editing and deletion — REST + WS, optimistic UI, soft delete with permission checks
- [x] WebSocket real-time delivery — 7 client frame types, 10 server event types, reconnect with backoff
- [x] Basic UI: nav rail, sidebar, message area, compose bar — all organisms implemented
- [x] Dark theme — full token set matching spec colors exactly

### Phase 2: Rich Messaging — COMPLETE
- [x] @mentions with autocomplete — MentionAutocomplete component, user search API, RichText highlight rendering
- [x] Message replies/quotes — reply button, reply preview in ComposeBar, QuotedMessage in MessageBubble
- [x] Emoji reactions — EmojiPicker (6 quick emojis), ReactionBar with toggle, optimistic UI, WS sync
- [x] File attachments (upload, download, inline images) — XHR upload with progress, drag/drop, AttachmentPreview with lightbox
- [x] Link previews — background OG fetch on server, LinkPreviewCard component, WS broadcast
- [x] Read receipts and unread badges — watermark model, avatar indicators in MessageArea, sidebar badges
- [x] Typing indicators — WS events, auto-expire 5s, debounced send with 3s stop

### Phase 3: Teams & Channels — NOT STARTED (except filter tabs)
- [ ] Team CRUD with roles — no Team/TeamMembership models or API
- [ ] Standard and private channels — no Channel/ChannelMembership models or API
- [ ] Channel conversations — no MessageThread organism
- [ ] Member management — no team/channel member management UI
- [x] Filter tabs (Unread, Channels, Chats) — Sidebar has All/Unread/Channels/Chats tabs, pill/chip style

### Phase 4: Polish & Scale — PARTIALLY COMPLETE
- [ ] Full-text search (Elasticsearch) — no search implementation
- [ ] User presence system — UserStatus enum exists on model + Avatar shows status dot, but no presence tracking/WS events/endpoints
- [ ] Notification preferences (per-chat mute, DND) — is_muted field exists on ChatMember but no settings UI or notification pipeline
- [ ] Offline support (IndexedDB cache, message queue) — not started
- [x] Light theme — full light palette defined alongside dark theme
- [ ] Responsive/mobile layout — no @media breakpoint queries implemented
- [ ] Communities — no Community models or UI
- [ ] Accessibility audit — ARIA roles, focus-visible, skip link, reduced motion present; missing keyboard shortcuts docs and comprehensive testing
- [x] **UI Polish — "Obsidian Glow" design system** (added 2026-02-07):
  - Custom typography: Outfit (display) + Figtree (body) via Google Fonts
  - "Obsidian Glow" dark theme: deep blacks (#111116), electric accent (#7c5cfc), strong glow effects
  - 30+ SVG icons redesigned: stroke-based Lucide-inspired with responsive strokeWidth scaling
  - Own messages right-aligned with accent-subtle bubble background
  - Other messages left-aligned with card bubble backgrounds (compact, max-width: 70%)
  - Unified compose bar: textarea + emoji/attach/send icons in single container
  - Pill/chip filter tabs in sidebar and chat header
  - Resizable sidebar (200-600px drag handle)
  - 8+ global keyframe animations (fadeIn, fadeInUp, popIn, breathe, shimmer, glowPulse)
  - Glassmorphism effects (backdrop-filter blur on login, emoji picker, dialogs)
  - Frosted glass login card with gradient mesh background
  - Staggered list entrance animations
  - Scrollbar styling (6px, transparent track)
  - Reduced motion support (@media prefers-reduced-motion)

### Implementation Stats

| Layer | Metric |
|-------|--------|
| **Backend endpoints** | 21 REST + 1 WebSocket |
| **DB models** | 8 (User, Chat, ChatMember, Message, MessageReaction, MessageMention, MessageAttachment, LinkPreview) |
| **Frontend components** | 20 (4 atoms, 8 molecules, 5 organisms, 2 templates, 1 page) |
| **API client methods** | 18 |
| **WS event types** | 10 client-side, 7 server frame handlers |
| **Custom hooks** | 5 (useAuth, useChats, useMessages, useTyping, useReadReceipts) |
| **CSS custom properties** | 120+ design tokens (expanded with glass, glow, surface tokens) |
| **SVG icons** | 30 stroke-based, multi-path, responsive strokeWidth |
| **Animations** | 8 global keyframes + per-component entrance animations |

### Not Yet Implemented (from spec)

**Backend:** Rate limiting (30 msgs/min), HTML sanitization for rich text, Team/Channel/Community models, presence tracking, full-text search, offline sync endpoints, notification pipeline.

**Frontend atoms missing:** Button, Input, Spinner, Tag, Tooltip, ToggleSwitch, DropdownMenu (functionality exists inline but not as reusable atoms).

**Frontend features missing:** SettingsView, MessageThread, FormatToolbar, responsive breakpoints, keyboard shortcut system.

---

## 10. Future Considerations

- **Video/audio calls** (WebRTC)
- **Screen sharing**
- **End-to-end encryption** (Signal protocol for 1:1)
- **Bots & integrations** (webhook-based, app marketplace)
- **Threads** (channel-level threaded conversations)
- **AI features** (chat recap/summary, smart replies)
- **Federation** (cross-organization channels)
- **Message scheduling** (send later)
- **Polls & forms** (inline interactive elements)
- **Custom emoji** (per-team emoji packs)

---

*Detailed specs are in the `specs/` directory:*
- [01-messaging.md](specs/01-messaging.md) - Core messaging & chat
- [02-organization.md](specs/02-organization.md) - Teams, channels & org structure
- [03-infrastructure.md](specs/03-infrastructure.md) - Real-time infrastructure
- [04-ui-design.md](specs/04-ui-design.md) - UI/UX design system
