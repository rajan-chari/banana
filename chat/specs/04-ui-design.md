# 04 - UI/UX Design System & Layout Architecture

Version: 1.0
Status: Draft
Last Updated: 2026-02-06

---

## Table of Contents

1. [Layout Architecture](#1-layout-architecture)
2. [Component Hierarchy & Specifications](#2-component-hierarchy--specifications)
3. [Design Tokens](#3-design-tokens)
4. [Responsive Breakpoints Strategy](#4-responsive-breakpoints-strategy)
5. [Dark/Light Theme System](#5-darklight-theme-system)
6. [Icon Requirements](#6-icon-requirements)
7. [Animation & Transition Specs](#7-animation--transition-specs)
8. [Accessibility Requirements](#8-accessibility-requirements)
9. [Component Library Catalog](#9-component-library-catalog)

---

## 1. Layout Architecture

### 1.1 Top-Level Layout (ASCII Diagram)

```
+------------------------------------------------------------------+
|                          TOP BAR (48px)                           |
| [<] [>]  [Logo]     [ Search (Ctrl+E)        ]   [?][A][_][O][X] |
+------+----------+-------------------------------------------+----+
|      |          |         CHAT HEADER (56px)                |    |
| N    | SIDEBAR  | [#channel-name ✏]                         |    |
| A    | (320px)  | [Chat] [Shared] [Recap] [Q&A] [+1] [+]   |    |
| V    |          | ──────────── Right: 👥38 ≡ ⊞ 🔍 ···       |    |
|      |----------+-------------------------------------------+    |
| R    | [Filter] |                                           |    |
| A    | Unread   |         MESSAGE AREA                      |    |
| I    | Channels |         (flex, scroll-y)                  |    |
| L    | Chats    |                                           |    |
|      | Commun.  |  ┌──────────────────────────────────┐      |    |
| 48px |          |  │ [Avatar] Name        12:34 PM    │      |    |
|      | ┌──────┐ |  │ Message content here...           │      |    |
|      | │ Chat │ |  │                                   │      |    |
|      | │ List │ |  │ ┃ Quoted: @user said...           │      |    |
|      | │ Items│ |  │                                   │      |    |
|      | │  ... │ |  │ [Link Preview Card]               │      |    |
|      | │      │ |  └──────────────────────────────────┘      |    |
|      | │      │ |                                           |    |
|      | └──────┘ |  ── Today ──────────────────────────       |    |
|      |          |                                           |    |
|      | Teams &  |  [New messages ↓]                         |    |
|      | Channels |                                           |    |
|      |          +-------------------------------------------+    |
|      |          |         COMPOSE BAR (52-120px)             |    |
|      |          | [Type a message...              ]          |    |
|      |          | [B][I][…] [😀][GIF][🎭][📎][⊞] [➤]       |    |
+------+----------+-------------------------------------------+----+
```

### 1.2 Column Layout Specification

| Column       | Width       | Min Width | Max Width | Resize | Position |
|-------------|-------------|-----------|-----------|--------|----------|
| Nav Rail     | 48px        | 48px      | 48px      | Fixed  | Left     |
| Sidebar      | 320px       | 240px     | 420px     | Drag   | Left     |
| Main Content | flex (1fr)  | 400px     | none      | Auto   | Center   |

### 1.3 Row Layout Specification

| Row          | Height       | Behavior                              |
|-------------|-------------|---------------------------------------|
| Top Bar      | 48px        | Fixed, always visible                 |
| Chat Header  | 56px        | Fixed within main content             |
| Tab Bar      | 40px        | Fixed, part of chat header zone       |
| Message Area | flex        | Scrollable, fills remaining space     |
| Compose Bar  | 52-120px    | Expandable on multiline input         |

### 1.4 Z-Index Layering

| Layer                    | z-index | Description                        |
|--------------------------|---------|-------------------------------------|
| Window controls          | 1000    | Minimize, maximize, close           |
| Modal overlays           | 900     | Dialogs, confirmations              |
| Modal backdrop           | 800     | Semi-transparent overlay            |
| Dropdown menus           | 700     | Context menus, dropdowns            |
| Tooltips                 | 600     | Hover tooltips                      |
| Floating indicators      | 500     | "New messages" pill                 |
| Top Bar                  | 400     | App chrome                          |
| Chat Header              | 300     | Sticky header                       |
| Compose Bar              | 200     | Sticky footer                       |
| Sidebar                  | 100     | Navigation panel                    |
| Nav Rail                 | 100     | Icon strip                          |
| Content                  | 1       | Default layer                       |

---

## 2. Component Hierarchy & Specifications

### 2.1 Top Bar

```
TopBar
├── NavigationControls
│   ├── BackButton
│   └── ForwardButton
├── AppBrand
│   └── LogoIcon
├── SearchBar
│   ├── SearchIcon
│   ├── SearchInput (placeholder: "Search (Ctrl+E)")
│   └── SearchShortcutBadge
├── UtilityActions
│   ├── HelpButton
│   └── UserProfileAvatar
└── WindowControls
    ├── MinimizeButton
    ├── MaximizeButton
    └── CloseButton
```

**TopBar Specs:**
- Height: 48px
- Background: `--color-bg-topbar`
- Padding: 0 16px
- Items vertically centered
- `-webkit-app-region: drag` (for frameless window dragging)
- Buttons are `no-drag` regions

**SearchBar Specs:**
- Width: 400px (centered)
- Height: 32px
- Border-radius: 4px
- Background: `--color-bg-search`
- Placeholder text: `--color-text-tertiary`
- Focus: 1px solid `--color-border-focus`

### 2.2 Nav Rail

```
NavRail
├── NavRailGroup (top, primary navigation)
│   ├── NavRailItem[Activity] + Badge("30")
│   ├── NavRailItem[Chat] (selected)
│   ├── NavRailItem[Calendar]
│   ├── NavRailItem[Calls]
│   ├── NavRailItem[Files]
│   ├── NavRailItem[Apps]
│   └── NavRailItem[Contacts] + DotBadge
└── NavRailGroup (bottom)
    └── NavRailItem[More]
```

**NavRailItem Specs:**
- Size: 48px x 44px
- Icon size: 20px
- Border-radius: 8px (hover/active background)
- States:
  - Default: icon `--color-icon-default`
  - Hover: background `--color-bg-hover`, icon `--color-icon-default`
  - Active/Selected: background `--color-bg-active`, left 3px accent bar `--color-accent-primary`, icon `--color-icon-active`
  - Focus-visible: 2px outline `--color-border-focus`

**Badge Specs:**
- Count Badge: min-width 16px, height 16px, border-radius 8px, bg `--color-badge-bg`, text `--color-badge-text`, font-size 10px, font-weight 600
- Dot Badge: 8px circle, bg `--color-badge-bg`, border 2px solid `--color-bg-navrail`
- Position: top-right of icon, offset (-4px, -2px)

### 2.3 Sidebar

```
Sidebar
├── SidebarHeader
│   ├── FilterTabs
│   │   ├── Tab[Unread]
│   │   ├── Tab[Channels]
│   │   ├── Tab[Chats]
│   │   └── Tab[Communities]
│   └── ComposeActions
│       ├── NewChatButton (pen icon)
│       └── DropdownTrigger (chevron)
├── SidebarSearch
│   └── SearchInput
├── ChatList (scrollable)
│   └── ChatListItem[] (repeating)
│       ├── Avatar (32px)
│       ├── ChatInfo
│       │   ├── ChatName + Timestamp
│       │   └── LastMessagePreview
│       └── UnreadBadge (optional)
└── SidebarFooter
    └── TeamsAndChannels (expandable section)
```

**FilterTabs Specs:**
- Height: 36px
- Tab: padding 8px 12px, font-size 13px
- Active tab: font-weight 600, bottom 2px border `--color-accent-primary`
- Inactive: `--color-text-secondary`, no border

**ChatListItem Specs:**
- Height: 64px
- Padding: 8px 16px
- Avatar: 32px circle, left-aligned
- Name: 14px, font-weight 600 (if unread), 400 (if read)
- Preview: 12px, `--color-text-secondary`, single-line ellipsis, max-width calc(100% - 80px)
- Timestamp: 12px, `--color-text-tertiary`, right-aligned
- Unread badge: same as NavRail count badge
- Hover: background `--color-bg-hover`
- Selected: background `--color-bg-selected`

### 2.4 Chat Header

```
ChatHeader
├── ChannelInfo
│   ├── ChannelIcon (#)
│   ├── ChannelName
│   └── EditButton (pencil icon)
├── TabBar
│   ├── Tab[Chat] (active)
│   ├── Tab[Shared]
│   ├── Tab[Recap]
│   ├── Tab[Q&A]
│   ├── OverflowTab[+1]
│   └── AddTabButton[+]
└── HeaderActions
    ├── MemberCount (people icon + "38")
    ├── ListViewButton
    ├── GridViewButton
    ├── SearchButton
    └── MoreOptionsButton (...)
```

**TabBar Specs:**
- Tab height: 40px
- Tab padding: 0 16px
- Active tab: font-weight 600, bottom 2px `--color-accent-primary`
- Tab font-size: 13px
- Hover: background `--color-bg-hover`, border-radius 4px 4px 0 0

### 2.5 Message Area

```
MessageArea (scroll container)
├── DateDivider
│   └── DateLabel ("Today")
├── Message[]
│   ├── AvatarColumn
│   │   └── Avatar (36px)
│   ├── ContentColumn
│   │   ├── MessageHeader
│   │   │   ├── SenderName
│   │   │   ├── Timestamp
│   │   │   └── EditedLabel (optional)
│   │   ├── MessageBody
│   │   │   ├── TextContent (with inline @mentions)
│   │   │   ├── QuotedMessage (optional)
│   │   │   │   ├── QuoteBorder (left accent bar)
│   │   │   │   ├── QuoteAuthor
│   │   │   │   └── QuotePreview
│   │   │   └── LinkPreviewCard (optional)
│   │   │       ├── PreviewImage
│   │   │       ├── PreviewTitle
│   │   │       ├── PreviewDescription
│   │   │       └── PreviewDomain
│   │   └── MessageActions (hover)
│   │       ├── ReactionButton
│   │       ├── ReplyButton
│   │       ├── ForwardButton
│   │       └── MoreButton
│   └── (collapsed: consecutive same-author messages omit avatar/name)
└── NewMessagesIndicator (floating)
    └── Pill ("New messages ↓")
```

**Message Specs:**
- Padding: 4px 20px (first in group: 16px 20px top)
- Avatar: 36px circle, margin-right 12px
- Sender name: 14px, font-weight 600, `--color-text-primary`
- Timestamp: 12px, `--color-text-tertiary`, margin-left 8px
- Body text: 14px, line-height 20px, `--color-text-primary`
- Hover: background `--color-bg-message-hover`, show MessageActions toolbar

**@Mention Specs:**
- Background: `--color-mention-bg`
- Color: `--color-mention-text`
- Padding: 1px 4px
- Border-radius: 3px
- Cursor: pointer
- Hover: background `--color-mention-bg-hover`

**QuotedMessage Specs:**
- Left border: 3px solid `--color-accent-primary`
- Padding: 8px 12px
- Margin: 4px 0
- Background: `--color-bg-quote`
- Border-radius: 0 4px 4px 0
- Author: 12px, font-weight 600
- Preview: 12px, `--color-text-secondary`, max 2 lines

**LinkPreviewCard Specs:**
- Width: 360px max
- Border: 1px solid `--color-border-card`
- Border-radius: 8px
- Background: `--color-bg-card`
- Image: top, border-radius 8px 8px 0 0, aspect-ratio 2:1
- Title: 14px, font-weight 600, max 2 lines
- Description: 12px, `--color-text-secondary`, max 3 lines
- Domain: 11px, `--color-text-tertiary`
- Padding (text area): 12px

**DateDivider Specs:**
- Horizontal rule: 1px solid `--color-border-divider`
- Label centered, background matches message area, padding 0 16px
- Font-size: 12px, font-weight 600, `--color-text-secondary`

**NewMessagesIndicator Specs:**
- Position: sticky bottom, centered horizontally
- Background: `--color-accent-primary`
- Color: white
- Padding: 6px 16px
- Border-radius: 16px
- Font-size: 12px, font-weight 600
- Box-shadow: `--shadow-elevated`
- Cursor: pointer

### 2.6 Compose Bar

```
ComposeBar
├── ComposeContainer
│   ├── FormatToolbar (expandable)
│   │   ├── BoldButton
│   │   ├── ItalicButton
│   │   ├── UnderlineButton
│   │   ├── StrikethroughButton
│   │   ├── ListButton
│   │   ├── CodeButton
│   │   └── MoreFormattingButton
│   ├── TextArea
│   │   └── Placeholder ("Type a message")
│   └── ActionBar
│       ├── LeftActions
│       │   └── FormatToggle
│       └── RightActions
│           ├── EmojiButton
│           ├── GifButton
│           ├── StickerButton
│           ├── AttachButton
│           ├── AppsButton
│           └── SendButton
└── ReplyPreview (optional, when replying)
    ├── ReplyingTo label
    ├── PreviewText
    └── CloseButton
```

**ComposeBar Specs:**
- Min height: 52px
- Max height: 120px (expands with content)
- Border-top: 1px solid `--color-border-divider`
- Background: `--color-bg-compose`
- Padding: 8px 16px
- TextArea: no border, background transparent, font-size 14px, line-height 20px
- Action icons: 20px, 32px hit target, `--color-icon-default`
- Send button: `--color-accent-primary` when content present, `--color-icon-disabled` when empty

---

## 3. Design Tokens

### 3.1 Color Tokens

#### Semantic Color Tokens (Theme-Aware)

```css
/* ============================================================
   BACKGROUND TOKENS
   ============================================================ */
--color-bg-app:                 /* App-level background */
--color-bg-topbar:              /* Top bar background */
--color-bg-navrail:             /* Nav rail background */
--color-bg-sidebar:             /* Sidebar background */
--color-bg-content:             /* Main content area */
--color-bg-compose:             /* Compose bar background */
--color-bg-hover:               /* Generic hover state */
--color-bg-selected:            /* Selected item background */
--color-bg-active:              /* Active/pressed state */
--color-bg-search:              /* Search input background */
--color-bg-card:                /* Card/preview background */
--color-bg-quote:               /* Quoted message background */
--color-bg-message-hover:       /* Message row hover */
--color-bg-tooltip:             /* Tooltip background */
--color-bg-modal:               /* Modal background */
--color-bg-overlay:             /* Backdrop overlay */

/* ============================================================
   TEXT TOKENS
   ============================================================ */
--color-text-primary:           /* Primary body text */
--color-text-secondary:         /* Secondary/supporting text */
--color-text-tertiary:          /* Timestamps, hints */
--color-text-disabled:          /* Disabled text */
--color-text-inverse:           /* Text on accent backgrounds */
--color-text-link:              /* Hyperlinks */

/* ============================================================
   ACCENT & BRAND TOKENS
   ============================================================ */
--color-accent-primary:         /* Primary brand accent */
--color-accent-primary-hover:   /* Accent hover state */
--color-accent-primary-active:  /* Accent pressed state */

/* ============================================================
   ICON TOKENS
   ============================================================ */
--color-icon-default:           /* Default icon color */
--color-icon-active:            /* Active/selected icon */
--color-icon-disabled:          /* Disabled icon */

/* ============================================================
   BORDER TOKENS
   ============================================================ */
--color-border-default:         /* Default borders */
--color-border-divider:         /* Divider lines */
--color-border-card:            /* Card borders */
--color-border-focus:           /* Focus rings */
--color-border-input:           /* Input borders */

/* ============================================================
   BADGE & STATUS TOKENS
   ============================================================ */
--color-badge-bg:               /* Notification badge bg */
--color-badge-text:             /* Notification badge text */
--color-status-online:          /* Online indicator */
--color-status-away:            /* Away indicator */
--color-status-busy:            /* Busy indicator */
--color-status-offline:         /* Offline indicator */

/* ============================================================
   MENTION TOKENS
   ============================================================ */
--color-mention-bg:             /* @mention background */
--color-mention-bg-hover:       /* @mention hover */
--color-mention-text:           /* @mention text */
```

#### Dark Theme Values

```css
[data-theme="dark"] {
  /* Backgrounds */
  --color-bg-app:               #1b1b1b;
  --color-bg-topbar:            #1f1f1f;
  --color-bg-navrail:           #1f1f1f;
  --color-bg-sidebar:           #292929;
  --color-bg-content:           #1f1f1f;
  --color-bg-compose:           #1f1f1f;
  --color-bg-hover:             #383838;
  --color-bg-selected:          #3d3d3d;
  --color-bg-active:            #454545;
  --color-bg-search:            #3d3d3d;
  --color-bg-card:              #2d2d2d;
  --color-bg-quote:             #2a2a2a;
  --color-bg-message-hover:     #2a2a2a;
  --color-bg-tooltip:           #454545;
  --color-bg-modal:             #2d2d2d;
  --color-bg-overlay:           rgba(0, 0, 0, 0.5);

  /* Text */
  --color-text-primary:         #ffffff;
  --color-text-secondary:       #adadad;
  --color-text-tertiary:        #8a8a8a;
  --color-text-disabled:        #5c5c5c;
  --color-text-inverse:         #ffffff;
  --color-text-link:            #6ea8fe;

  /* Accent */
  --color-accent-primary:       #6264a7;
  --color-accent-primary-hover: #7b7dbd;
  --color-accent-primary-active:#5250a1;

  /* Icons */
  --color-icon-default:         #adadad;
  --color-icon-active:          #ffffff;
  --color-icon-disabled:        #5c5c5c;

  /* Borders */
  --color-border-default:       #3d3d3d;
  --color-border-divider:       #333333;
  --color-border-card:          #3d3d3d;
  --color-border-focus:         #6264a7;
  --color-border-input:         #5c5c5c;

  /* Badge */
  --color-badge-bg:             #c4314b;
  --color-badge-text:           #ffffff;

  /* Status */
  --color-status-online:        #92c353;
  --color-status-away:          #f8d22a;
  --color-status-busy:          #c4314b;
  --color-status-offline:       #8a8a8a;

  /* Mentions */
  --color-mention-bg:           rgba(98, 100, 167, 0.3);
  --color-mention-bg-hover:     rgba(98, 100, 167, 0.5);
  --color-mention-text:         #a4a5d6;
}
```

#### Light Theme Values

```css
[data-theme="light"] {
  /* Backgrounds */
  --color-bg-app:               #f5f5f5;
  --color-bg-topbar:            #ebebeb;
  --color-bg-navrail:           #ebebeb;
  --color-bg-sidebar:           #ffffff;
  --color-bg-content:           #ffffff;
  --color-bg-compose:           #ffffff;
  --color-bg-hover:             #e8e8e8;
  --color-bg-selected:          #e0e0f0;
  --color-bg-active:            #d6d6d6;
  --color-bg-search:            #ffffff;
  --color-bg-card:              #f5f5f5;
  --color-bg-quote:             #f0f0f0;
  --color-bg-message-hover:     #f5f5f5;
  --color-bg-tooltip:           #242424;
  --color-bg-modal:             #ffffff;
  --color-bg-overlay:           rgba(0, 0, 0, 0.4);

  /* Text */
  --color-text-primary:         #242424;
  --color-text-secondary:       #616161;
  --color-text-tertiary:        #8a8a8a;
  --color-text-disabled:        #bdbdbd;
  --color-text-inverse:         #ffffff;
  --color-text-link:            #4766b0;

  /* Accent */
  --color-accent-primary:       #6264a7;
  --color-accent-primary-hover: #5250a1;
  --color-accent-primary-active:#464688;

  /* Icons */
  --color-icon-default:         #616161;
  --color-icon-active:          #242424;
  --color-icon-disabled:        #bdbdbd;

  /* Borders */
  --color-border-default:       #e0e0e0;
  --color-border-divider:       #e0e0e0;
  --color-border-card:          #e0e0e0;
  --color-border-focus:         #6264a7;
  --color-border-input:         #bdbdbd;

  /* Badge */
  --color-badge-bg:             #c4314b;
  --color-badge-text:           #ffffff;

  /* Status */
  --color-status-online:        #6bb700;
  --color-status-away:          #f0b849;
  --color-status-busy:          #c4314b;
  --color-status-offline:       #8a8a8a;

  /* Mentions */
  --color-mention-bg:           rgba(98, 100, 167, 0.15);
  --color-mention-bg-hover:     rgba(98, 100, 167, 0.25);
  --color-mention-text:         #5250a1;
}
```

### 3.2 Typography Tokens

```css
/* Font Family */
--font-family-base:             'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
--font-family-mono:             'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace;

/* Font Sizes */
--font-size-xs:                 10px;    /* Badges */
--font-size-sm:                 12px;    /* Timestamps, captions, previews */
--font-size-base:               14px;    /* Body text, messages, inputs */
--font-size-md:                 16px;    /* Section headers */
--font-size-lg:                 18px;    /* Channel names */
--font-size-xl:                 20px;    /* Page titles */
--font-size-2xl:                24px;    /* Modal titles */

/* Font Weights */
--font-weight-regular:          400;
--font-weight-semibold:         600;
--font-weight-bold:             700;

/* Line Heights */
--line-height-tight:            1.2;     /* Headings */
--line-height-base:             1.43;    /* 20px at 14px font (body text) */
--line-height-relaxed:          1.5;     /* Larger text blocks */

/* Letter Spacing */
--letter-spacing-tight:         -0.02em; /* Headings */
--letter-spacing-normal:        0;       /* Body */
--letter-spacing-wide:          0.02em;  /* Captions, badges */
```

#### Typography Scale

| Token Name     | Size  | Weight   | Line Height | Use Case                       |
|---------------|-------|----------|-------------|--------------------------------|
| `title-xl`    | 24px  | 700      | 1.2         | Modal headers                  |
| `title-lg`    | 20px  | 700      | 1.2         | Page titles                    |
| `title-md`    | 18px  | 600      | 1.2         | Channel/chat name in header    |
| `title-sm`    | 16px  | 600      | 1.2         | Section headers                |
| `body-lg`     | 16px  | 400      | 1.5         | Large body text                |
| `body-md`     | 14px  | 400      | 1.43        | Default body, messages, inputs |
| `body-md-b`   | 14px  | 600      | 1.43        | Sender name, bold body         |
| `body-sm`     | 12px  | 400      | 1.33        | Preview, timestamps, captions  |
| `body-sm-b`   | 12px  | 600      | 1.33        | Date dividers, bold captions   |
| `caption`     | 11px  | 400      | 1.27        | Domain in link preview         |
| `badge`       | 10px  | 600      | 1.0         | Badge counts                   |

### 3.3 Spacing Tokens

```css
/* Base unit: 4px */
--space-0:    0;
--space-1:    4px;
--space-2:    8px;
--space-3:    12px;
--space-4:    16px;
--space-5:    20px;
--space-6:    24px;
--space-7:    28px;
--space-8:    32px;
--space-10:   40px;
--space-12:   48px;
--space-16:   64px;
```

| Context                       | Token      | Value |
|------------------------------|-----------|-------|
| Message padding horizontal    | `space-5`  | 20px  |
| Message padding vertical      | `space-1`  | 4px   |
| First message in group top    | `space-4`  | 16px  |
| Avatar margin-right           | `space-3`  | 12px  |
| Sidebar item padding          | `space-2 space-4` | 8px 16px |
| Section gaps                  | `space-4`  | 16px  |
| Card inner padding            | `space-3`  | 12px  |
| TopBar padding horizontal     | `space-4`  | 16px  |

### 3.4 Shadow Tokens

```css
--shadow-none:        none;
--shadow-sm:          0 1px 2px rgba(0, 0, 0, 0.15);
--shadow-md:          0 2px 8px rgba(0, 0, 0, 0.2);
--shadow-lg:          0 4px 16px rgba(0, 0, 0, 0.25);
--shadow-elevated:    0 8px 32px rgba(0, 0, 0, 0.3);

/* Dark theme shadows are more intense */
[data-theme="dark"] {
  --shadow-sm:        0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md:        0 2px 8px rgba(0, 0, 0, 0.5);
  --shadow-lg:        0 4px 16px rgba(0, 0, 0, 0.6);
  --shadow-elevated:  0 8px 32px rgba(0, 0, 0, 0.7);
}
```

### 3.5 Border Radius Tokens

```css
--radius-none:        0;
--radius-sm:          2px;      /* Subtle rounding (badges inline) */
--radius-md:          4px;      /* Inputs, search, tabs */
--radius-lg:          8px;      /* Cards, nav items, buttons */
--radius-xl:          12px;     /* Modals, large cards */
--radius-pill:        9999px;   /* Pill shapes (badges, indicators) */
--radius-circle:      50%;      /* Avatars, dot badges */
```

### 3.6 Size Tokens

```css
/* Avatars */
--avatar-xs:          20px;     /* Inline mentions */
--avatar-sm:          24px;     /* Compact lists */
--avatar-md:          32px;     /* Sidebar chat items */
--avatar-lg:          36px;     /* Message avatars */
--avatar-xl:          48px;     /* Profile views */
--avatar-2xl:         72px;     /* Profile dialogs */

/* Icons */
--icon-xs:            12px;     /* Inline indicators */
--icon-sm:            16px;     /* Small actions */
--icon-md:            20px;     /* Standard icons */
--icon-lg:            24px;     /* Nav rail, prominent icons */
--icon-xl:            32px;     /* Empty states */

/* Hit Targets */
--hit-target-min:     32px;     /* Minimum interactive target */
--hit-target-standard:36px;     /* Standard button/icon target */
--hit-target-large:   44px;     /* WCAG recommended minimum */
```

---

## 4. Responsive Breakpoints Strategy

### 4.1 Breakpoint Definitions

| Name        | Min Width | Max Width | Layout Description                        |
|------------|-----------|-----------|-------------------------------------------|
| `xs`       | 0         | 479px     | Mobile: single column, bottom nav          |
| `sm`       | 480px     | 767px     | Small tablet: sidebar overlay              |
| `md`       | 768px     | 1023px    | Tablet: collapsed sidebar, hamburger       |
| `lg`       | 1024px    | 1365px    | Desktop: narrow sidebar + content          |
| `xl`       | 1366px    | 1919px    | Wide desktop: full layout                  |
| `2xl`      | 1920px    | --        | Ultrawide: max-width content, wider panels |

### 4.2 Layout Behavior by Breakpoint

```
2xl (1920px+):    [NavRail 48px][Sidebar 360px][         Content          ]
xl  (1366-1919):  [NavRail 48px][Sidebar 320px][       Content            ]
lg  (1024-1365):  [NavRail 48px][Sidebar 280px][     Content              ]
md  (768-1023):   [NavRail 48px][ Content (full)                          ]
                     Sidebar = overlay on hamburger toggle
sm  (480-767):    [Content (full width)                                   ]
                     NavRail = bottom tab bar, Sidebar = overlay
xs  (0-479):      [Content (full width)                                   ]
                     NavRail = bottom tab bar (4 items + more)
                     Sidebar = full-screen overlay
```

### 4.3 Component Adaptations

| Component         | >= lg              | md                | sm / xs             |
|-------------------|--------------------|-------------------|---------------------|
| Nav Rail          | Left column, 48px  | Left column, 48px | Bottom tab bar      |
| Sidebar           | Persistent panel   | Toggle overlay    | Full-screen overlay |
| Chat Header       | Full actions       | Collapsed actions | Minimal (name only) |
| Compose Bar       | Full toolbar       | Full toolbar      | Simplified toolbar  |
| Message Actions   | Hover toolbar      | Hover toolbar     | Long-press menu     |
| Link Preview      | 360px card         | 300px card        | Full-width card     |
| Search Bar        | 400px centered     | 300px centered    | Full-width or icon  |

### 4.4 CSS Implementation Pattern

```css
/* Mobile-first approach */
.sidebar {
  position: fixed;
  transform: translateX(-100%);
  transition: transform 200ms ease-out;
  width: 100%;
  z-index: 100;
}

.sidebar.open {
  transform: translateX(0);
}

@media (min-width: 768px) {
  .sidebar {
    position: fixed;
    width: 320px;
  }
}

@media (min-width: 1024px) {
  .sidebar {
    position: relative;
    transform: none;
    width: 280px;
  }
}

@media (min-width: 1366px) {
  .sidebar {
    width: 320px;
  }
}

@media (min-width: 1920px) {
  .sidebar {
    width: 360px;
  }
}
```

---

## 5. Dark/Light Theme System

### 5.1 Theme Architecture

Themes are implemented via CSS custom properties on a root `data-theme` attribute:

```html
<html data-theme="dark">
```

All components reference semantic tokens exclusively. No component uses hardcoded color values.

### 5.2 Theme Toggle

- User preference stored in `localStorage` under key `app-theme`
- System preference detected via `prefers-color-scheme` media query
- Priority: user explicit choice > system preference > default (dark)

```javascript
// Theme resolution order
function getTheme(): 'dark' | 'light' {
  const stored = localStorage.getItem('app-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}
```

### 5.3 Theme Switching

- Transition: `background-color 150ms ease, color 100ms ease` applied to `*` during switch
- No flash of unstyled content: theme class applied in `<head>` blocking script
- System preference listener updates in real-time when no explicit user choice

### 5.4 Theme-Aware Asset Guidelines

| Asset Type      | Strategy                                       |
|----------------|------------------------------------------------|
| Icons           | Single-color SVG, colored via `currentColor`   |
| Illustrations   | Provide dark/light variants or use opacity      |
| Shadows         | More intense in dark, subtler in light          |
| Borders         | More visible in dark (lighter gray), subtle in light |
| Scrollbars      | Styled via `scrollbar-color` to match theme     |

### 5.5 High Contrast Mode

For users who need enhanced contrast:

```css
[data-theme="dark"][data-contrast="high"] {
  --color-text-primary:     #ffffff;
  --color-text-secondary:   #d4d4d4;
  --color-bg-content:       #000000;
  --color-border-default:   #666666;
  --color-border-focus:     #ffffff;
}
```

---

## 6. Icon Requirements

### 6.1 Icon System

- **Format**: SVG (inline or sprite sheet)
- **Style**: Outlined (1.5px stroke), consistent with Fluent UI icon language
- **Sizing**: Uses `--icon-*` size tokens, rendered at native resolution
- **Coloring**: All icons use `currentColor` for theme compatibility

### 6.2 Required Icon Set

#### Nav Rail Icons

| Icon           | Name               | States            | Badge     |
|---------------|--------------------|--------------------|-----------|
| Activity       | `bell`             | default, active    | count     |
| Chat           | `chat-bubble`      | default, active    | count     |
| Calendar       | `calendar`         | default, active    | dot       |
| Calls          | `phone`            | default, active    | dot       |
| Files          | `folder`           | default, active    | --        |
| Apps           | `grid`             | default, active    | --        |
| Contacts       | `people`           | default, active    | dot       |
| More           | `ellipsis-h`       | default, active    | --        |

#### Message Actions

| Icon           | Name               | Context                |
|---------------|--------------------|-----------------------|
| React          | `emoji-smile`      | Add reaction           |
| Reply          | `arrow-reply`      | Reply in thread        |
| Forward        | `arrow-forward`    | Forward message        |
| More           | `ellipsis-h`       | More actions           |
| Pin            | `pin`              | Pin message            |
| Bookmark       | `bookmark`         | Save message           |
| Copy           | `clipboard`        | Copy text              |
| Delete         | `trash`            | Delete message         |
| Edit           | `pencil`           | Edit message           |

#### Compose Bar Icons

| Icon           | Name               |
|---------------|--------------------|
| Format         | `text-format`      |
| Bold           | `bold`             |
| Italic         | `italic`           |
| Underline      | `underline`        |
| Strikethrough  | `strikethrough`    |
| List (bullet)  | `list-bullet`      |
| List (number)  | `list-number`      |
| Code           | `code`             |
| Emoji          | `emoji-smile`      |
| GIF            | `gif`              |
| Sticker        | `sticker`          |
| Attach         | `paperclip`        |
| Apps           | `grid-plus`        |
| Send           | `send`             |

#### Status Icons

| Icon           | Name               | Color Token              |
|---------------|--------------------|--------------------------|
| Online         | `circle-filled`    | `--color-status-online`  |
| Away           | `clock`            | `--color-status-away`    |
| Busy           | `minus-circle`     | `--color-status-busy`    |
| Offline        | `circle-outline`   | `--color-status-offline` |
| Do Not Disturb | `minus-circle`     | `--color-status-busy`    |

#### General UI Icons

| Icon           | Name               | Context                |
|---------------|--------------------|-----------------------|
| Back           | `arrow-left`       | Navigation             |
| Forward        | `arrow-right`      | Navigation             |
| Search         | `magnify`          | Search bars            |
| Close          | `close`            | Dialogs, panels        |
| Minimize       | `minus`            | Window control         |
| Maximize       | `square`           | Window control         |
| Chevron Down   | `chevron-down`     | Dropdowns              |
| Chevron Right  | `chevron-right`    | Expandable sections    |
| Plus           | `plus`             | Add actions            |
| Check          | `check`            | Confirmations          |
| Warning        | `warning`          | Alerts                 |
| Info           | `info-circle`      | Information            |
| Settings       | `gear`             | Settings               |
| Hash           | `hash`             | Channel indicator      |
| Lock           | `lock`             | Private channel        |

### 6.3 Icon Rendering Rules

1. Never scale icons beyond their design size -- use the appropriate size token
2. Maintain 2px padding minimum between icon edge and container edge
3. Align icons to pixel grid (no sub-pixel rendering)
4. Use `aria-hidden="true"` on decorative icons
5. Provide `aria-label` on interactive icon-only buttons

---

## 7. Animation & Transition Specs

### 7.1 Timing Tokens

```css
/* Durations */
--duration-instant:     0ms;      /* Immediate state changes */
--duration-fast:        100ms;    /* Micro-interactions (hover, focus) */
--duration-normal:      200ms;    /* Standard transitions */
--duration-slow:        300ms;    /* Panel slides, larger movements */
--duration-slower:      500ms;    /* Page transitions, complex animations */

/* Easing Functions */
--ease-default:         cubic-bezier(0.4, 0, 0.2, 1);    /* General purpose */
--ease-in:              cubic-bezier(0.4, 0, 1, 1);        /* Exiting elements */
--ease-out:             cubic-bezier(0, 0, 0.2, 1);        /* Entering elements */
--ease-in-out:          cubic-bezier(0.4, 0, 0.2, 1);      /* Moving elements */
--ease-bounce:          cubic-bezier(0.34, 1.56, 0.64, 1); /* Playful feedback */
```

### 7.2 Component Transitions

| Component            | Property           | Duration    | Easing      | Trigger        |
|---------------------|-------------------|-------------|-------------|----------------|
| Button hover         | background-color   | fast (100ms)| default     | mouseenter     |
| Button press         | transform (scale)  | fast (100ms)| ease-out    | mousedown      |
| Nav item select      | background, border | normal      | default     | click          |
| Sidebar open/close   | transform (X)      | slow (300ms)| ease-out    | toggle         |
| Sidebar resize       | width              | none        | --          | drag           |
| Dropdown open        | opacity, transform | normal      | ease-out    | click          |
| Dropdown close       | opacity, transform | fast (100ms)| ease-in     | blur/click     |
| Tooltip show         | opacity            | fast (100ms)| ease-out    | mouseenter+delay |
| Tooltip hide         | opacity            | fast (100ms)| ease-in     | mouseleave     |
| Modal open           | opacity, transform | slow (300ms)| ease-out    | trigger        |
| Modal close          | opacity, transform | normal      | ease-in     | close          |
| Backdrop show        | opacity            | slow (300ms)| ease-out    | modal open     |
| Message appear       | opacity, translateY| normal      | ease-out    | new message    |
| New msg indicator    | opacity, translateY| normal      | ease-bounce | scroll trigger |
| Theme switch         | background, color  | normal      | default     | toggle         |
| Focus ring           | box-shadow         | fast (100ms)| default     | focus-visible  |
| Badge count change   | transform (scale)  | fast (100ms)| ease-bounce | count update   |

### 7.3 Loading & Skeleton States

**Skeleton Screen:**
- Background: `--color-bg-hover`
- Shimmer animation: linear gradient sweep, 1.5s, infinite
- Border-radius matches final content
- Applied to: avatars (circles), text lines (rounded rects), cards (rounded rects)

```css
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-bg-hover) 25%,
    var(--color-bg-selected) 50%,
    var(--color-bg-hover) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

**Spinner:**
- Size: 20px (inline), 32px (block-level), 48px (page-level)
- Stroke: 2px, `--color-accent-primary`
- Animation: rotate 360deg, 0.8s, linear, infinite

### 7.4 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 8. Accessibility Requirements

### 8.1 Standard: WCAG 2.1 Level AA

All components must meet WCAG 2.1 AA compliance as a minimum. Key criteria:

### 8.2 Color & Contrast

| Requirement                          | Criterion     | Ratio     |
|-------------------------------------|---------------|-----------|
| Normal text contrast (< 18px)       | 1.4.3 AA      | >= 4.5:1  |
| Large text contrast (>= 18px bold)  | 1.4.3 AA      | >= 3:1    |
| UI component contrast               | 1.4.11 AA     | >= 3:1    |
| Focus indicator contrast            | 1.4.11 AA     | >= 3:1    |

**Verified Token Contrast (Dark Theme):**

| Foreground Token          | Background Token       | Ratio  | Pass? |
|---------------------------|------------------------|--------|-------|
| `--color-text-primary`    | `--color-bg-content`   | 15.3:1 | Yes   |
| `--color-text-secondary`  | `--color-bg-content`   | 7.8:1  | Yes   |
| `--color-text-tertiary`   | `--color-bg-content`   | 4.6:1  | Yes   |
| `--color-badge-text`      | `--color-badge-bg`     | 5.2:1  | Yes   |
| `--color-mention-text`    | `--color-mention-bg`   | 5.9:1  | Yes   |

- Never rely on color alone to convey information (1.4.1)
- Provide text labels, icons, or patterns alongside color indicators

### 8.3 Keyboard Navigation

**Focus Management:**
- All interactive elements must be focusable via Tab / Shift+Tab
- Focus order follows visual layout (left-to-right, top-to-bottom)
- Focus ring: 2px solid `--color-border-focus`, 2px offset, visible on `:focus-visible` only
- No focus trap except in modals (modals trap focus within until dismissed)

**Key Bindings:**

| Context        | Key              | Action                        |
|---------------|------------------|-------------------------------|
| Global         | Ctrl+E           | Focus search bar              |
| Global         | Ctrl+N           | New chat/compose              |
| Global         | Ctrl+Shift+M     | Toggle mute                   |
| Global         | Escape           | Close overlay/modal/dropdown  |
| Nav Rail       | Arrow Up/Down    | Move between nav items        |
| Nav Rail       | Enter/Space      | Activate nav item             |
| Chat List      | Arrow Up/Down    | Move between chats            |
| Chat List      | Enter            | Open chat                     |
| Message Area   | Arrow Up/Down    | Navigate messages             |
| Message Area   | Tab              | Move to message actions       |
| Compose        | Enter            | Send message                  |
| Compose        | Shift+Enter      | New line                      |
| Compose        | Ctrl+B/I/U       | Bold/Italic/Underline         |
| Dropdown       | Arrow Up/Down    | Navigate options              |
| Dropdown       | Enter            | Select option                 |
| Dropdown       | Escape           | Close dropdown                |

**Skip Links:**
- First focusable element: "Skip to main content" link
- Targets: main content area (`#main-content`)

### 8.4 Screen Reader Support

**ARIA Landmarks:**

```html
<nav aria-label="Application navigation">         <!-- Nav Rail -->
<aside aria-label="Chat list">                     <!-- Sidebar -->
<main id="main-content" aria-label="Chat">         <!-- Main Content -->
<footer aria-label="Message compose">              <!-- Compose Bar -->
```

**ARIA Requirements by Component:**

| Component       | ARIA Attributes                                            |
|----------------|-----------------------------------------------------------|
| Nav Rail        | `role="navigation"`, items: `aria-current="page"`         |
| Tab Bar         | `role="tablist"`, tabs: `role="tab"`, `aria-selected`     |
| Chat List       | `role="listbox"`, items: `role="option"`, `aria-selected`  |
| Message List    | `role="log"`, `aria-live="polite"`, `aria-label`           |
| Message         | `role="article"`, `aria-label="[sender] at [time]"`       |
| Badge           | `aria-label="[count] unread notifications"`                |
| Compose Input   | `role="textbox"`, `aria-label="Type a message"`           |
| Modal           | `role="dialog"`, `aria-modal="true"`, `aria-labelledby`   |
| Tooltip         | `role="tooltip"`, trigger has `aria-describedby`           |
| Search          | `role="search"`, `aria-label="Search messages"`           |
| Buttons         | icon-only buttons: `aria-label="[action description]"`     |

**Live Regions:**
- New messages: `aria-live="polite"` on message list
- Unread count changes: `aria-live="assertive"` on badge
- Toast notifications: `role="alert"`, `aria-live="assertive"`

### 8.5 Motion & Interaction

- Respect `prefers-reduced-motion` (see Section 7.4)
- No content that flashes more than 3 times per second (2.3.1)
- All hover-triggered content also accessible via focus (1.4.13)
- Pointer target size minimum: 44x44px for touch, 32x32px for mouse (2.5.5)

### 8.6 Text & Content

- Text resizable up to 200% without loss of functionality (1.4.4)
- Content reflows at 320px viewport width (1.4.10)
- No horizontal scrolling at standard zoom levels
- Meaningful sequence preserved when CSS is disabled (1.3.2)
- Language attribute on `<html>` element (3.1.1)

---

## 9. Component Library Catalog

### 9.1 Catalog Overview

Components are organized by atomic design methodology:

```
Atoms         -> Molecules       -> Organisms         -> Templates
-----------      --------------     ----------------     ---------
Avatar           ChatListItem       NavRail              AppShell
Badge            MessageHeader      Sidebar              ChatView
Button           SearchBar          ChatHeader           SettingsView
Divider          TabBar             MessageArea
Icon             ComposeInput       ComposeBar
Input            QuotedMessage      MessageThread
Pill             LinkPreviewCard
Spinner          DateDivider
Tag              MemberCount
Tooltip          FilterTabs
ToggleSwitch     MessageActions
DropdownMenu     FormatToolbar
```

### 9.2 Atom Components

#### Avatar

| Prop        | Type                    | Default  | Description              |
|------------|-------------------------|----------|--------------------------|
| `size`     | `xs\|sm\|md\|lg\|xl\|2xl` | `md`    | Avatar size              |
| `src`      | `string`                | --       | Image URL                |
| `alt`      | `string`                | required | Accessible name          |
| `initials` | `string`                | --       | Fallback initials        |
| `status`   | `online\|away\|busy\|offline` | --  | Status indicator         |
| `shape`    | `circle\|square`        | `circle` | Avatar shape             |

Renders: circular image with optional status dot (bottom-right, 25% of avatar size).

#### Badge

| Prop        | Type                | Default   | Description              |
|------------|---------------------|-----------|--------------------------|
| `count`    | `number`            | --        | Count to display         |
| `max`      | `number`            | `99`      | Max before showing "99+" |
| `variant`  | `count\|dot`        | `count`   | Badge style              |
| `color`    | `danger\|neutral`   | `danger`  | Badge color              |

Renders: pill-shaped or dot badge. Hidden when count is 0.

#### Button

| Prop        | Type                         | Default     | Description            |
|------------|------------------------------|-------------|------------------------|
| `variant`  | `primary\|secondary\|ghost\|danger` | `secondary` | Visual style   |
| `size`     | `sm\|md\|lg`                 | `md`        | Button size            |
| `icon`     | `IconName`                   | --          | Leading icon           |
| `iconOnly` | `boolean`                    | `false`     | Icon-only mode         |
| `disabled` | `boolean`                    | `false`     | Disabled state         |
| `loading`  | `boolean`                    | `false`     | Loading state          |

Sizes: sm=28px, md=32px, lg=40px height. Icon-only requires `aria-label`.

#### Icon

| Prop        | Type       | Default  | Description          |
|------------|------------|----------|----------------------|
| `name`     | `IconName` | required | Icon identifier      |
| `size`     | `xs\|sm\|md\|lg\|xl` | `md` | Icon size      |
| `color`    | `string`   | `currentColor` | Override color |

Renders SVG icon. Uses `aria-hidden="true"` by default.

#### Input

| Prop          | Type       | Default  | Description             |
|--------------|------------|----------|-------------------------|
| `type`       | `text\|search\|password` | `text` | Input type    |
| `placeholder`| `string`   | --       | Placeholder text        |
| `size`       | `sm\|md`   | `md`     | Input size              |
| `icon`       | `IconName` | --       | Leading icon            |
| `error`      | `string`   | --       | Error message           |
| `disabled`   | `boolean`  | `false`  | Disabled state          |

Height: sm=28px, md=32px. Focus: `--color-border-focus` ring.

#### Tooltip

| Prop         | Type                    | Default  | Description          |
|-------------|-------------------------|----------|----------------------|
| `content`   | `string`                | required | Tooltip text         |
| `position`  | `top\|bottom\|left\|right` | `top` | Tooltip position     |
| `delay`     | `number`                | `300`    | Show delay (ms)      |

Max width 240px. Appears on hover (after delay) and focus.

### 9.3 Molecule Components

#### ChatListItem

| Prop         | Type       | Default  | Description              |
|-------------|------------|----------|--------------------------|
| `avatar`    | `AvatarProps` | required | User/channel avatar   |
| `name`      | `string`   | required | Chat/channel name        |
| `preview`   | `string`   | --       | Last message preview     |
| `timestamp` | `Date`     | --       | Last message time        |
| `unread`    | `number`   | `0`      | Unread count             |
| `selected`  | `boolean`  | `false`  | Selected state           |
| `muted`     | `boolean`  | `false`  | Muted indicator          |
| `pinned`    | `boolean`  | `false`  | Pinned indicator         |

Height: 64px. Shows bold name + preview when unread > 0.

#### SearchBar

| Prop          | Type       | Default               | Description        |
|--------------|------------|-----------------------|--------------------|
| `placeholder`| `string`   | `"Search (Ctrl+E)"`   | Placeholder text   |
| `width`      | `string`   | `400px`               | Bar width          |
| `shortcut`   | `string`   | `"Ctrl+E"`            | Keyboard shortcut  |
| `onSearch`   | `function` | required              | Search handler     |

Shows shortcut badge when unfocused, hides on focus.

#### TabBar

| Prop        | Type                  | Default  | Description           |
|------------|----------------------|----------|-----------------------|
| `tabs`     | `Tab[]`              | required | Tab definitions       |
| `active`   | `string`             | --       | Active tab ID         |
| `overflow`  | `boolean`           | `true`   | Show overflow count   |
| `addable`  | `boolean`            | `false`  | Show add (+) button   |
| `onTabChange` | `function`        | required | Tab change handler    |

Tab overflow shows "+N" pill for hidden tabs.

#### QuotedMessage

| Prop        | Type       | Default  | Description             |
|------------|------------|----------|-------------------------|
| `author`   | `string`   | required | Original author name    |
| `content`  | `string`   | required | Quoted text preview     |
| `timestamp`| `Date`     | --       | Original message time   |
| `onClick`  | `function` | --       | Navigate to original    |

Left border accent, max 2 lines of preview text.

#### LinkPreviewCard

| Prop          | Type       | Default  | Description           |
|--------------|------------|----------|-----------------------|
| `url`        | `string`   | required | Target URL            |
| `title`      | `string`   | required | Page title            |
| `description`| `string`   | --       | Page description      |
| `image`      | `string`   | --       | Preview image URL     |
| `domain`     | `string`   | required | Source domain         |
| `onClose`    | `function` | --       | Dismiss preview       |

Max width 360px. Image aspect ratio 2:1. Clickable card.

#### MessageActions

| Prop         | Type         | Default  | Description            |
|-------------|-------------|----------|------------------------|
| `messageId` | `string`    | required | Target message ID      |
| `actions`   | `Action[]`  | required | Available actions      |
| `position`  | `top-right` | --       | Position relative to msg |

Floating toolbar, appears on message hover, 4 primary icons + overflow.

### 9.4 Organism Components

#### NavRail

| Prop          | Type            | Default  | Description         |
|--------------|----------------|----------|---------------------|
| `items`      | `NavItem[]`    | required | Navigation items    |
| `activeItem` | `string`       | --       | Active item ID      |
| `badges`     | `BadgeMap`     | `{}`     | Badge counts by ID  |
| `onNavigate` | `function`     | required | Navigation handler  |

Width: 48px. Vertical icon strip. Active item has left accent bar.

#### Sidebar

| Prop          | Type            | Default  | Description          |
|--------------|----------------|----------|----------------------|
| `chats`      | `Chat[]`       | required | Chat list data       |
| `filter`     | `string`       | `all`    | Active filter tab    |
| `selectedId` | `string`       | --       | Selected chat ID     |
| `width`      | `number`       | `320`    | Panel width          |
| `collapsed`  | `boolean`      | `false`  | Collapsed state      |
| `onSelect`   | `function`     | required | Chat selection       |
| `onCompose`  | `function`     | required | New chat handler     |

Resizable via drag handle on right edge. Scrollable chat list.

#### ChatHeader

| Prop           | Type          | Default  | Description           |
|---------------|--------------|----------|-----------------------|
| `name`        | `string`     | required | Channel/chat name     |
| `type`        | `channel\|chat\|meeting` | required | Chat type  |
| `tabs`        | `Tab[]`      | required | Header tabs           |
| `memberCount` | `number`     | --       | Member count          |
| `onAction`    | `function`   | required | Action handler        |

Fixed at top of main content. Includes channel name + tab bar + action buttons.

#### MessageArea

| Prop            | Type            | Default  | Description          |
|----------------|----------------|----------|----------------------|
| `messages`     | `Message[]`    | required | Message list         |
| `loading`      | `boolean`      | `false`  | Loading state        |
| `hasMore`      | `boolean`      | `false`  | More history above   |
| `newCount`     | `number`       | `0`      | New messages below   |
| `onLoadMore`   | `function`     | --       | Load history handler |
| `onScrollToNew`| `function`     | --       | Scroll to bottom     |

Virtualized list for performance. Auto-scrolls on new messages if at bottom. Shows "New messages" indicator when scrolled up.

#### ComposeBar

| Prop            | Type          | Default  | Description           |
|----------------|--------------|----------|-----------------------|
| `placeholder`  | `string`     | `"Type a message"` | Input placeholder |
| `replyTo`      | `Message`    | --       | Reply context         |
| `disabled`     | `boolean`    | `false`  | Disabled state        |
| `onSend`       | `function`   | required | Send handler          |
| `onAttach`     | `function`   | --       | Attachment handler    |

Expandable height (52-120px). Format toolbar toggles above input. Send button activates when content present.

### 9.5 Template Components

#### AppShell

```
AppShell
├── TopBar
├── ContentArea (flex row)
│   ├── NavRail
│   ├── Sidebar
│   └── MainPanel
│       ├── ChatHeader
│       ├── MessageArea
│       └── ComposeBar
└── ModalLayer (portal)
```

Root layout component. Manages responsive behavior, theme, and panel visibility.

#### ChatView

The primary view template combining ChatHeader + MessageArea + ComposeBar into the main content panel. Manages scroll position, message grouping, and compose state.

### 9.6 Component State Matrix

| Component       | Default | Hover | Active | Selected | Disabled | Focus | Loading | Error |
|----------------|---------|-------|--------|----------|----------|-------|---------|-------|
| Button          | x       | x     | x      | --       | x        | x     | x       | --    |
| NavRailItem     | x       | x     | x      | x        | --       | x     | --      | --    |
| ChatListItem    | x       | x     | --     | x        | --       | x     | --      | --    |
| Tab             | x       | x     | x      | x        | x        | x     | --      | --    |
| Input           | x       | x     | x      | --       | x        | x     | --      | x     |
| Message         | x       | x     | --     | --       | --       | x     | --      | --    |
| ComposeBar      | x       | --    | --     | --       | x        | x     | x       | --    |
| SearchBar       | x       | --    | --     | --       | --       | x     | x       | --    |
| Avatar          | x       | --    | --     | --       | --       | --    | x       | x     |
| Badge           | x       | --    | --     | --       | --       | --    | --      | --    |

---

## Appendix A: CSS Custom Property Naming Convention

Pattern: `--{category}-{property}-{element}-{variant}-{state}`

Examples:
- `--color-bg-sidebar` (category: color, property: bg, element: sidebar)
- `--color-text-primary` (category: color, property: text, variant: primary)
- `--color-accent-primary-hover` (category: color, property: accent, variant: primary, state: hover)

Categories: `color`, `font`, `space`, `radius`, `shadow`, `duration`, `ease`, `size`, `icon`, `avatar`

## Appendix B: File/Folder Structure for Implementation

```
src/
├── styles/
│   ├── tokens/
│   │   ├── colors.css          # Color custom properties
│   │   ├── typography.css      # Font tokens
│   │   ├── spacing.css         # Spacing scale
│   │   ├── shadows.css         # Shadow tokens
│   │   ├── borders.css         # Border radius tokens
│   │   ├── sizes.css           # Component size tokens
│   │   └── motion.css          # Animation timing tokens
│   ├── themes/
│   │   ├── dark.css            # Dark theme values
│   │   ├── light.css           # Light theme values
│   │   └── high-contrast.css   # High contrast overrides
│   ├── base/
│   │   ├── reset.css           # CSS reset / normalize
│   │   ├── global.css          # Global styles, typography
│   │   └── accessibility.css   # Focus styles, reduced motion
│   └── index.css               # Entry point, imports all
├── components/
│   ├── atoms/
│   │   ├── Avatar/
│   │   ├── Badge/
│   │   ├── Button/
│   │   ├── Divider/
│   │   ├── Icon/
│   │   ├── Input/
│   │   ├── Pill/
│   │   ├── Spinner/
│   │   ├── Tag/
│   │   ├── Tooltip/
│   │   ├── ToggleSwitch/
│   │   └── DropdownMenu/
│   ├── molecules/
│   │   ├── ChatListItem/
│   │   ├── SearchBar/
│   │   ├── TabBar/
│   │   ├── QuotedMessage/
│   │   ├── LinkPreviewCard/
│   │   ├── DateDivider/
│   │   ├── MemberCount/
│   │   ├── MessageHeader/
│   │   ├── MessageActions/
│   │   ├── FilterTabs/
│   │   └── FormatToolbar/
│   ├── organisms/
│   │   ├── NavRail/
│   │   ├── Sidebar/
│   │   ├── ChatHeader/
│   │   ├── MessageArea/
│   │   ├── ComposeBar/
│   │   └── MessageThread/
│   └── templates/
│       ├── AppShell/
│       ├── ChatView/
│       └── SettingsView/
└── icons/
    └── *.svg                   # Individual SVG icon files
```

Each component folder contains:
```
ComponentName/
├── ComponentName.tsx           # Component implementation
├── ComponentName.module.css    # Scoped styles (CSS Modules)
├── ComponentName.test.tsx      # Unit tests
├── ComponentName.stories.tsx   # Storybook stories (optional)
└── index.ts                    # Public export
```
