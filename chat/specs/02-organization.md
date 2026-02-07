# 02 - Teams, Channels & Organizational Structure

## 1. Feature Overview

This spec defines the organizational hierarchy for the chat application, modeled after Microsoft Teams. The hierarchy is:

```
Organization (implicit/single-tenant)
  └── Team
        └── Channel (standard | private | shared)
              └── Conversation Thread
                    └── Message / Reply
```

Users belong to one or more Teams. Each Team contains one or more Channels. Channels host threaded conversations. A role-based access control (RBAC) system governs who can do what at each level.

Additionally, the system supports:
- **Communities** -- open-membership spaces for cross-team interest groups
- **Chat categories & filtering** -- Unread, Channels, Chats, Communities tabs
- **User presence & profiles** -- real-time availability indicators
- **Global search** -- unified search across teams, channels, messages, and people

---

## 2. Data Models

### 2.1 Team

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | Unique team identifier |
| `name` | `string` | max 256 chars, unique per tenant | Display name |
| `description` | `string` | max 1024 chars, nullable | Team description |
| `avatar_url` | `string` | nullable | Team avatar/icon URL |
| `visibility` | `enum` | `public \| private` | Whether team appears in directory |
| `is_archived` | `boolean` | default `false` | Archived teams are read-only |
| `created_by` | `uuid` | FK -> User | Creator (becomes first owner) |
| `created_at` | `datetime` | auto | Creation timestamp |
| `updated_at` | `datetime` | auto | Last modification timestamp |

### 2.2 TeamMembership

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | Membership record ID |
| `team_id` | `uuid` | FK -> Team | Which team |
| `user_id` | `uuid` | FK -> User | Which user |
| `role` | `enum` | `owner \| member \| guest` | Role within team |
| `joined_at` | `datetime` | auto | When user joined |
| `invited_by` | `uuid` | FK -> User, nullable | Who invited them |

**Unique constraint:** `(team_id, user_id)`

### 2.3 Channel

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | Unique channel identifier |
| `team_id` | `uuid` | FK -> Team | Parent team |
| `name` | `string` | max 256 chars, unique per team | Display name |
| `description` | `string` | max 1024 chars, nullable | Channel topic/description |
| `type` | `enum` | `standard \| private \| shared` | Channel visibility type |
| `is_general` | `boolean` | default `false` | General channel (one per team, undeletable) |
| `is_archived` | `boolean` | default `false` | Archived channels are read-only |
| `created_by` | `uuid` | FK -> User | Channel creator |
| `created_at` | `datetime` | auto | Creation timestamp |
| `updated_at` | `datetime` | auto | Last modification timestamp |

**Business rule:** Each team has exactly one channel where `is_general = true`. It is created automatically with the team and cannot be deleted or converted to private.

### 2.4 ChannelMembership

Only used for `private` and `shared` channels. Standard channels inherit team membership.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | Membership record ID |
| `channel_id` | `uuid` | FK -> Channel | Which channel |
| `user_id` | `uuid` | FK -> User | Which user |
| `role` | `enum` | `owner \| member` | Role within private channel |
| `joined_at` | `datetime` | auto | When user was added |

**Unique constraint:** `(channel_id, user_id)`

### 2.5 Community

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | Unique community identifier |
| `name` | `string` | max 256 chars | Display name |
| `description` | `string` | max 2048 chars, nullable | Community description |
| `avatar_url` | `string` | nullable | Community avatar |
| `join_policy` | `enum` | `open \| approval_required \| invite_only` | How users join |
| `created_by` | `uuid` | FK -> User | Creator |
| `created_at` | `datetime` | auto | Creation timestamp |
| `updated_at` | `datetime` | auto | Last modification timestamp |

### 2.6 CommunityMembership

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | Membership record ID |
| `community_id` | `uuid` | FK -> Community | Which community |
| `user_id` | `uuid` | FK -> User | Which user |
| `role` | `enum` | `owner \| moderator \| member` | Role within community |
| `joined_at` | `datetime` | auto | When user joined |

**Unique constraint:** `(community_id, user_id)`

### 2.7 UserPresence

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `user_id` | `uuid` | PK, FK -> User | User reference |
| `status` | `enum` | `available \| busy \| dnd \| away \| offline \| appear_offline` | Current presence |
| `status_message` | `string` | max 280 chars, nullable | Custom status text |
| `status_emoji` | `string` | nullable | Custom status emoji |
| `status_expiry` | `datetime` | nullable | When custom status clears |
| `last_active_at` | `datetime` | auto | Last activity timestamp |
| `updated_at` | `datetime` | auto | Last presence change |

### 2.8 UserProfile

Extends the base User model (defined in 01-messaging spec) with profile-card fields.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `user_id` | `uuid` | PK, FK -> User | User reference |
| `display_name` | `string` | max 256 chars | Full display name |
| `title` | `string` | max 256 chars, nullable | Job title |
| `department` | `string` | max 256 chars, nullable | Department |
| `location` | `string` | max 256 chars, nullable | Office location |
| `phone` | `string` | max 32 chars, nullable | Phone number |
| `avatar_url` | `string` | nullable | Profile photo URL |
| `timezone` | `string` | IANA tz, nullable | User timezone |

### 2.9 Entity-Relationship Summary

```
User ──< TeamMembership >── Team ──< Channel
  │                                     │
  │                                  (standard channels: membership inherited from team)
  │                                  (private/shared channels: explicit ChannelMembership)
  │                                     │
  ├── UserPresence (1:1)             Channel ──< ConversationThread ──< Message
  ├── UserProfile  (1:1)
  │
  └──< CommunityMembership >── Community
```

---

## 3. API Endpoints

Base path: `/api/v1`

### 3.1 Teams

#### `POST /teams` -- Create team

```jsonc
// Request
{
  "name": "Engineering",
  "description": "Engineering department team",
  "visibility": "private"  // optional, default "private"
}

// Response 201
{
  "id": "uuid",
  "name": "Engineering",
  "description": "Engineering department team",
  "visibility": "private",
  "is_archived": false,
  "created_by": "uuid",
  "created_at": "2026-02-06T10:00:00Z",
  "member_count": 1,
  "channels": [
    {
      "id": "uuid",
      "name": "General",
      "type": "standard",
      "is_general": true
    }
  ]
}
```

#### `GET /teams` -- List teams for current user

```jsonc
// Query params: ?include_archived=false&visibility=public
// Response 200
{
  "teams": [
    {
      "id": "uuid",
      "name": "Engineering",
      "description": "...",
      "visibility": "private",
      "is_archived": false,
      "member_count": 38,
      "my_role": "member",
      "avatar_url": "..."
    }
  ],
  "total": 5
}
```

#### `GET /teams/{team_id}` -- Get team details

```jsonc
// Response 200
{
  "id": "uuid",
  "name": "Engineering",
  "description": "...",
  "visibility": "private",
  "is_archived": false,
  "created_by": "uuid",
  "created_at": "2026-02-06T10:00:00Z",
  "member_count": 38,
  "my_role": "owner",
  "channels": [ /* channel summaries */ ]
}
```

#### `PATCH /teams/{team_id}` -- Update team

```jsonc
// Request (all fields optional)
{
  "name": "Engineering v2",
  "description": "Updated description",
  "visibility": "public",
  "is_archived": true
}
// Response 200: updated team object
```

#### `DELETE /teams/{team_id}` -- Delete team

```
// Response 204 No Content
```

### 3.2 Team Membership

#### `GET /teams/{team_id}/members` -- List members

```jsonc
// Query params: ?role=member&search=jane&limit=50&offset=0
// Response 200
{
  "members": [
    {
      "user_id": "uuid",
      "display_name": "Jane Smith",
      "avatar_url": "...",
      "role": "member",
      "joined_at": "2026-01-15T08:00:00Z",
      "presence": "available"
    }
  ],
  "total": 38
}
```

#### `POST /teams/{team_id}/members` -- Add member(s)

```jsonc
// Request
{
  "user_ids": ["uuid1", "uuid2"],
  "role": "member"  // optional, default "member"
}
// Response 201
{
  "added": [
    { "user_id": "uuid1", "role": "member" },
    { "user_id": "uuid2", "role": "member" }
  ]
}
```

#### `PATCH /teams/{team_id}/members/{user_id}` -- Update member role

```jsonc
// Request
{ "role": "owner" }
// Response 200: updated membership object
```

#### `DELETE /teams/{team_id}/members/{user_id}` -- Remove member

```
// Response 204 No Content
```

### 3.3 Channels

#### `POST /teams/{team_id}/channels` -- Create channel

```jsonc
// Request
{
  "name": "backend",
  "description": "Backend development discussion",
  "type": "standard"  // standard | private | shared
}
// Response 201: channel object
```

#### `GET /teams/{team_id}/channels` -- List channels

```jsonc
// Query params: ?type=standard&include_archived=false
// Response 200
{
  "channels": [
    {
      "id": "uuid",
      "name": "General",
      "description": "...",
      "type": "standard",
      "is_general": true,
      "is_archived": false,
      "unread_count": 3,
      "last_message_at": "2026-02-06T09:45:00Z"
    }
  ],
  "total": 8
}
```

#### `GET /teams/{team_id}/channels/{channel_id}` -- Get channel details

```jsonc
// Response 200
{
  "id": "uuid",
  "team_id": "uuid",
  "name": "backend",
  "description": "Backend development discussion",
  "type": "private",
  "is_general": false,
  "is_archived": false,
  "member_count": 12,
  "created_by": "uuid",
  "created_at": "2026-02-06T10:00:00Z",
  "pinned_messages": [ /* message summaries */ ]
}
```

#### `PATCH /teams/{team_id}/channels/{channel_id}` -- Update channel

```jsonc
// Request (all fields optional)
{
  "name": "backend-v2",
  "description": "Updated",
  "is_archived": true
}
// Response 200: updated channel object
```

#### `DELETE /teams/{team_id}/channels/{channel_id}` -- Delete channel

```
// Response 204 No Content
// Fails with 400 if is_general=true
```

### 3.4 Channel Membership (private/shared channels only)

#### `GET /teams/{team_id}/channels/{channel_id}/members` -- List channel members

```jsonc
// Response 200
{
  "members": [
    {
      "user_id": "uuid",
      "display_name": "...",
      "role": "owner",
      "joined_at": "..."
    }
  ],
  "total": 12
}
```

#### `POST /teams/{team_id}/channels/{channel_id}/members` -- Add members

```jsonc
// Request
{
  "user_ids": ["uuid1", "uuid2"]
}
// Response 201
```

#### `DELETE /teams/{team_id}/channels/{channel_id}/members/{user_id}` -- Remove member

```
// Response 204 No Content
```

### 3.5 Communities

#### `POST /communities` -- Create community

```jsonc
// Request
{
  "name": "Python Enthusiasts",
  "description": "All things Python",
  "join_policy": "open"
}
// Response 201: community object
```

#### `GET /communities` -- List communities

```jsonc
// Query params: ?joined=true&search=python&limit=20&offset=0
// Response 200
{
  "communities": [
    {
      "id": "uuid",
      "name": "Python Enthusiasts",
      "description": "...",
      "join_policy": "open",
      "member_count": 142,
      "is_member": true,
      "my_role": "member"
    }
  ],
  "total": 10
}
```

#### `POST /communities/{community_id}/join` -- Join community

```jsonc
// Response 200 (open) or 202 (approval_required -- pending)
{
  "status": "joined"  // or "pending_approval"
}
```

#### `DELETE /communities/{community_id}/members/{user_id}` -- Leave / remove member

```
// Response 204 No Content
```

### 3.6 User Presence

#### `GET /users/{user_id}/presence` -- Get user presence

```jsonc
// Response 200
{
  "user_id": "uuid",
  "status": "available",
  "status_message": "Working from home",
  "status_emoji": null,
  "status_expiry": null,
  "last_active_at": "2026-02-06T09:58:00Z"
}
```

#### `PUT /users/me/presence` -- Set own presence

```jsonc
// Request
{
  "status": "dnd",
  "status_message": "In a meeting until 3pm",
  "status_expiry": "2026-02-06T15:00:00Z"
}
// Response 200: updated presence object
```

**Real-time delivery:** Presence changes are broadcast via WebSocket (see 03-infrastructure spec) to all users who have the affected user visible (team members, chat participants).

### 3.7 User Profile

#### `GET /users/{user_id}/profile` -- Get profile card

```jsonc
// Response 200
{
  "user_id": "uuid",
  "display_name": "Jane Smith",
  "title": "Senior Engineer",
  "department": "Platform",
  "location": "Seattle, WA",
  "phone": "+1-555-0123",
  "avatar_url": "https://...",
  "timezone": "America/Los_Angeles",
  "presence": {
    "status": "available",
    "status_message": "Working from home"
  },
  "teams_in_common": [
    { "id": "uuid", "name": "Engineering" }
  ]
}
```

#### `PATCH /users/me/profile` -- Update own profile

```jsonc
// Request (all fields optional)
{
  "display_name": "Jane A. Smith",
  "title": "Staff Engineer",
  "phone": "+1-555-0199"
}
// Response 200: updated profile object
```

### 3.8 Chat Filtering & Search

#### `GET /conversations` -- List conversations with filtering

```jsonc
// Query params:
//   ?filter=unread|channels|chats|communities
//   &search=keyword
//   &limit=50&cursor=abc
// Response 200
{
  "conversations": [
    {
      "id": "uuid",
      "type": "channel",          // channel | chat | community
      "name": "General",
      "team_name": "Engineering", // only for channels
      "last_message": {
        "sender_name": "John",
        "preview": "Has anyone seen the...",
        "sent_at": "2026-02-06T09:45:00Z"
      },
      "unread_count": 3,
      "is_muted": false,
      "is_pinned": true
    }
  ],
  "next_cursor": "def"
}
```

#### `GET /search` -- Global search (Ctrl+E)

```jsonc
// Query params: ?q=deployment+script&scope=all|messages|people|files&limit=20
// Response 200
{
  "results": {
    "messages": [
      {
        "id": "uuid",
        "content_preview": "...deployment script...",
        "sender_name": "John",
        "channel_name": "devops",
        "team_name": "Engineering",
        "sent_at": "2026-02-05T14:30:00Z"
      }
    ],
    "people": [
      {
        "user_id": "uuid",
        "display_name": "Jane Smith",
        "title": "Senior Engineer",
        "presence": "available"
      }
    ],
    "files": [ /* file results */ ]
  },
  "total_by_scope": {
    "messages": 42,
    "people": 2,
    "files": 5
  }
}
```

---

## 4. Permission Model (RBAC)

### 4.1 Team Roles

| Action | Owner | Member | Guest |
|--------|:-----:|:------:|:-----:|
| View team info | Y | Y | Y |
| View standard channels | Y | Y | Y |
| Post in standard channels | Y | Y | N (1) |
| Create standard channels | Y | Y | N |
| Create private channels | Y | Y | N |
| Edit team name/description | Y | N | N |
| Change team visibility | Y | N | N |
| Archive/unarchive team | Y | N | N |
| Delete team | Y | N | N |
| Add members | Y | Y (2) | N |
| Remove members | Y | N | N |
| Change member roles | Y | N | N |
| Manage guests | Y | N | N |

**(1)** Guests can only post in channels they are explicitly added to.
**(2)** Members can add other members but not owners or guests.

### 4.2 Channel Roles (Private/Shared)

| Action | Channel Owner | Channel Member |
|--------|:------------:|:--------------:|
| View channel | Y | Y |
| Post messages | Y | Y |
| Add members | Y | N |
| Remove members | Y | N |
| Edit channel name/description | Y | N |
| Archive channel | Y | N |
| Delete channel | Y (3) | N |

**(3)** Team owners can also delete any channel (except General).

### 4.3 Community Roles

| Action | Owner | Moderator | Member |
|--------|:-----:|:---------:|:------:|
| View community | Y | Y | Y |
| Post messages | Y | Y | Y |
| Edit community info | Y | N | N |
| Change join policy | Y | N | N |
| Approve join requests | Y | Y | N |
| Remove members | Y | Y | N |
| Assign moderators | Y | N | N |
| Delete community | Y | N | N |

### 4.4 Presence Permissions

| Action | Rule |
|--------|------|
| View another user's presence | Must share at least one team or active chat |
| Set own presence | Always allowed |
| Override to "appear offline" | Always allowed; hides from all viewers |
| DND mode | Suppresses notifications; presence shown as "dnd" to viewers |

### 4.5 Guest Restrictions

Guests have a restricted view of the application:
- Can only see teams and channels they are explicitly added to
- Cannot see the team member list (only members in shared channels)
- Cannot use global search across teams
- Cannot create teams or communities
- Cannot access the organization directory
- File sharing may be restricted by admin policy

---

## 5. UI Components Breakdown

### 5.1 Left Sidebar -- Teams & Channels Tree

```
+---------------------------------------+
| [Search / Filter]            [Ctrl+E] |
|---------------------------------------|
| Filter: [All] [Unread] [Channels]     |
|         [Chats] [Communities]         |
|---------------------------------------|
| PINNED                                |
|   # General - Engineering        (3)  |
|   Jane Smith                     (1)  |
|---------------------------------------|
| RECENT                                |
|   # backend - Engineering             |
|   Team Standup (group chat)           |
|   # design-reviews - Product          |
|---------------------------------------|
| TEAMS AND CHANNELS               [+]  |
|   v Engineering                       |
|     # General                         |
|     # backend                         |
|     # frontend                        |
|     > 5 more channels                 |
|   v Product                           |
|     # General                         |
|     # design-reviews                  |
|   > + Join or create a team           |
+---------------------------------------+
```

**Components:**
- `SearchBar` -- Global search input with keyboard shortcut hint
- `FilterTabs` -- Horizontal tab bar: All, Unread, Channels, Chats, Communities
- `ConversationList` -- Scrollable list of conversations, grouped by Pinned/Recent
- `ConversationItem` -- Single row: avatar/icon, name, preview, timestamp, unread badge
- `TeamTree` -- Collapsible tree of teams and their channels
- `TeamNode` -- Expandable team row with team avatar and name
- `ChannelNode` -- Channel row with `#` icon (standard) or lock icon (private)

### 5.2 Channel Header

```
+----------------------------------------------------------+
| # backend                                          [38]  |
| Backend development discussion         [Pin][...]  [>|]  |
+----------------------------------------------------------+
```

**Components:**
- `ChannelHeader` -- Top bar showing channel name, description, member count
- `MemberCountBadge` -- Clickable badge showing participant count, opens member panel
- `ChannelActions` -- Dropdown menu: pin, mute, notification settings, leave channel

### 5.3 Member Panel (Right Sidebar)

```
+---------------------------+
| Members (38)     [Search] |
|---------------------------|
| ONLINE (12)               |
|  [O] Jane Smith   Owner   |
|  [O] John Doe    Member   |
|  ...                      |
| OFFLINE (26)              |
|  [X] Bob Wilson  Member   |
|  ...                      |
|---------------------------|
| [+ Add member]            |
+---------------------------+
```

**Components:**
- `MemberPanel` -- Right sidebar listing all members
- `MemberSearch` -- Filter members by name
- `MemberItem` -- Row: avatar with presence dot, name, role badge
- `AddMemberButton` -- Opens member invite dialog (owners only)

### 5.4 Profile Card (Hover/Click Popup)

```
+-----------------------------------+
| [Avatar]  Jane Smith              |
|           Senior Engineer         |
|           Platform - Seattle      |
|-----------------------------------|
|  [O] Available                    |
|  "Working from home"             |
|-----------------------------------|
| [Chat] [Call] [Video] [Email]    |
|-----------------------------------|
| Phone: +1-555-0123               |
| Teams in common: Engineering,    |
|   Product                        |
+-----------------------------------+
```

**Components:**
- `ProfileCard` -- Floating card on avatar hover or click
- `PresenceBadge` -- Colored dot: green (available), red (busy/dnd), yellow (away), gray (offline)
- `QuickActions` -- Icon buttons: chat, call, video, email
- `ContactInfo` -- Phone, teams in common, department

### 5.5 Team Creation Dialog

```
+----------------------------------------------+
| Create a team                          [X]   |
|----------------------------------------------|
| Team name:    [________________________]     |
| Description:  [________________________]     |
|               [________________________]     |
| Visibility:   (o) Private  ( ) Public        |
|----------------------------------------------|
| Add members:                                 |
| [Search people_______________]               |
|  [Jane Smith x] [John Doe x]                |
|----------------------------------------------|
|                    [Cancel] [Create]          |
+----------------------------------------------+
```

**Components:**
- `CreateTeamDialog` -- Modal dialog for team creation
- `MemberPicker` -- Autocomplete search with chips for selected users
- `VisibilitySelector` -- Radio buttons for public/private

### 5.6 Filter Tabs Behavior

| Tab | Shows |
|-----|-------|
| All | All conversations (channels, chats, communities) sorted by most recent activity |
| Unread | Only conversations with unread messages, sorted by unread count descending |
| Channels | Only channel conversations, grouped by team |
| Chats | Only 1:1 and group chats |
| Communities | Only community conversations |

### 5.7 Presence Indicator Colors

| Status | Color | Icon | Description |
|--------|-------|------|-------------|
| Available | Green (#92C353) | Filled circle | User is active |
| Busy | Red (#C4314B) | Filled circle | User is busy |
| Do Not Disturb | Red (#C4314B) | Circle with dash | Notifications suppressed |
| Away | Yellow (#FCD116) | Clock icon | User is idle/away |
| Offline | Gray (#8A8886) | Empty circle | User is not connected |
| Appear Offline | Gray (#8A8886) | Empty circle | User chose to appear offline |

---

## 6. Business Rules & Constraints

### 6.1 Team Rules

1. **Minimum one owner.** A team must always have at least one owner. The last owner cannot leave or be demoted without assigning a new owner first.
2. **Auto-create General channel.** When a team is created, a `General` channel (type: `standard`, `is_general: true`) is automatically created. It cannot be deleted, archived, or converted to private.
3. **Membership cascade on team delete.** Deleting a team removes all channels, channel memberships, team memberships, and associated conversation threads. This is a soft-delete with a 30-day recovery window.
4. **Archived teams are read-only.** Users can view content but cannot post, create channels, or modify membership. Un-archiving restores full functionality.
5. **Team name uniqueness.** Team names are unique within the tenant (case-insensitive).
6. **Public team discovery.** Public teams appear in the team directory and can be joined without invitation. Private teams require an invitation from an owner or member.

### 6.2 Channel Rules

1. **Channel names unique per team.** Channel names are unique within a team (case-insensitive). Names may contain letters, numbers, hyphens, and underscores.
2. **Standard channel access.** All team members automatically have access to all standard channels. No explicit channel membership is needed.
3. **Private channel isolation.** Private channels are only visible to explicitly added members. They do not appear in the channel list for non-members. Team owners can see that private channels exist but cannot read their content without being added.
4. **Shared channels span teams.** Shared channels can include members from multiple teams. The channel belongs to the originating team but members from other teams can participate.
5. **Channel archival.** Archived channels are read-only. Messages are preserved and searchable but new posts are blocked.

### 6.3 Community Rules

1. **Open communities.** Users can join open communities without approval.
2. **Approval-required communities.** Join requests go to owners/moderators. The request expires after 7 days if not acted upon.
3. **Invite-only communities.** Only owners can invite new members.
4. **Community independence.** Communities are not tied to teams. A user can join communities regardless of their team memberships.

### 6.4 Presence Rules

1. **Auto-away.** If no user activity is detected for 5 minutes, presence changes to `away`. Threshold is configurable per-user (1-30 minutes).
2. **Auto-offline.** If the client disconnects or no heartbeat is received for 60 seconds, presence changes to `offline`.
3. **DND suppression.** When status is `dnd`, all notifications (push, desktop, sound) are suppressed. Urgent/priority messages may override this if sender is an owner/admin (configurable).
4. **Manual override.** Users can manually set any status. Manual status persists until changed or until `status_expiry` is reached.
5. **Presence visibility.** A user's presence is only visible to other users who share at least one team or have an active chat conversation.

### 6.5 Search & Filtering Rules

1. **Scope-aware search.** Global search results are filtered by the searcher's permissions. A user only sees results from teams, channels, and chats they have access to.
2. **Guest search restriction.** Guests can only search within channels they are explicitly added to.
3. **Filter persistence.** The selected filter tab is remembered per-session. Default is "All" on new session.
4. **Unread count accuracy.** Unread counts update in real-time via WebSocket. A message is marked as read when the user scrolls it into view (intersection observer) or when the conversation is opened and all visible messages are on screen.

### 6.6 Rate Limits & Constraints

| Resource | Limit |
|----------|-------|
| Teams per user | 250 |
| Channels per team | 200 (standard) + 30 (private) + 10 (shared) |
| Members per team | 25,000 |
| Members per private channel | 250 |
| Communities per user | 100 |
| Team name length | 256 characters |
| Channel name length | 256 characters |
| Description length | 1,024 characters (team/channel), 2,048 (community) |
| Status message length | 280 characters |

### 6.7 Notifications Related to Org Events

The following events generate notifications (delivered per 03-infrastructure spec):

| Event | Recipients | Priority |
|-------|-----------|----------|
| Added to team | Affected user | Normal |
| Removed from team | Affected user | Normal |
| Role changed | Affected user | Normal |
| Team archived | All team members | Normal |
| Added to private channel | Affected user | Normal |
| Community join request | Community owners/moderators | Low |
| Community join approved | Requesting user | Normal |
| @mention in channel | Mentioned user(s) | High |
| @team in channel | All team members | Normal |
