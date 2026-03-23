# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Startup

Before responding to the user's first message:

1. Read `Claude-KB.md` in this directory (domain knowledge, lessons learned).
2. Read `session-context.md` if it exists (ephemeral state from previous session — what was in flight, what to pick up). Surface relevant items in the greeting.
3. Look for a `*-private.md` file matching the user's name (e.g., `Rajan-private.md`). If one exists, read it for personal TODOs, preferences, and reminders. If it references a durable location, read that too.
4. Don't read md files from the parent directory unless the user requests it.
5. Greet the user covering:
   - **What's running** — any active sessions or recent changes
   - **Open items** — TODOs from private notes, session context, or KB
   - **Quick actions** — common scenarios listed below

### Common Scenarios

- **Start the server** — `npm start` (or `node dist/index.js --root <path>`)
- **Rebuild after TypeScript changes** — `npm run build` (frontend changes need only a browser refresh)
- **Add a new REST endpoint** — edit `src/server.ts`, add route, rebuild
- **Change terminal appearance** — edit `public/style.css` (xterm overrides at bottom) or `TERM_THEME` in `public/app.js`
- **Fix tiling/layout bugs** — `public/app.js`, look for `buildBalancedTree()`, `renderTileNode()`, `renderActiveWorkspace()`
- **Debug idle detection** — `src/screen-detector.ts` (regex patterns), `src/session.ts` (heuristic timer)

## Quick Commands

```bash
npm install          # setup (one-time)
npm run build        # compile TypeScript → dist/
npm run dev          # watch mode
npm start            # run server on http://127.0.0.1:3600
pty-win              # global command (npm-linked), same as npm start

# With options
pty-win --port 3602 --root "C:\projects\my-app" --emcom "http://127.0.0.1:8800"
```

No build step for frontend — `public/` files are served as static assets. Edit and refresh.

## Architecture

Browser-based terminal multiplexer. Server spawns PTY processes, streams I/O over WebSocket. Frontend renders in xterm.js with tiled panes.

```
Browser (public/)                    Server (src/)
├─ Folder sidebar (lazy tree)        ├─ Express REST API (/api/*)
├─ Workspace tabs (tiled panes)  ←WS→ ├─ WebSocket (terminal I/O)
├─ xterm.js per pane                 ├─ node-pty per session
├─ Dashboard (session cards)         ├─ xterm-headless (idle detection)
└─ Quick-open (Ctrl+P)              └─ EmcomPoller (optional per session)
```

**Server** (`src/`): TypeScript, ESM, Express + `ws`. Each session is a `PtySession` wrapping node-pty + xterm-headless + optional EmcomPoller.

**Frontend** (`public/`): Vanilla JS, no framework, no build step. CDN imports for xterm.js. All state in a global `state` object. Tiling uses a binary tree model rendered as nested flexbox.

## Key Patterns

### Session Lifecycle
`POST /api/sessions {workingDir, command?, cols?, rows?}` → server auto-detects `identity.json` for emcom → spawns PTY → status: starting → busy → idle → dead. Dead sessions auto-removed from layouts after 1.5s.

### Idle Detection
- **Claude sessions** (`command === "claude"`): xterm-headless parses screen buffer for prompt patterns (`/^[❯>]\s*$/`). 1s quiet threshold + screen confirmation = safe to inject.
- **Generic sessions**: 3s quiet threshold, no screen analysis.
- When idle + pending emcom messages → inject `"Check emcom inbox..."` into PTY.

### WebSocket Protocol
Server→Client: `sessions` (full list), `data` (terminal output), `status` (state change), `notification` (new emails).
Client→Server: `input` (keystrokes), `resize` (cols/rows).

### Tiling Model
Binary tree: `{type: "split", direction: "h"|"v", ratio, children}` or `{type: "leaf", session}`. `buildBalancedTree()` auto-layouts N sessions. Drag handles adjust ratios. Workspaces persisted in localStorage.

### Folder Browser
Lazy-loaded tree via `GET /api/folders?path=...`. Checks each directory for `CLAUDE.md` (blue dot), `identity.json` (purple dot), `.claude/` dir. Favorites stored in localStorage. Play button (hover) opens session.

## Gotchas

- **`@xterm/headless` is CJS** — import as `import pkg from "@xterm/headless"; const { Terminal } = pkg;`
- **Windows PTY** — spawns via `cmd.exe /c <command>` (npm .cmd shims need this)
- **Use `127.0.0.1`** not `localhost` (IPv6 penalty on Windows)
- **xterm.js `open()` once only** — terminal uses a persistent wrapper div moved between re-renders
- **`fitAddon.fit()` timing** — ResizeObserver + explicit resize sync to server after every fit
- **Body needs `width: 100%`** — without it, flexbox body shrink-wraps instead of filling viewport
- **`.pane-terminal` needs `position: relative; overflow: hidden`** — xterm wrapper uses `position: absolute; inset: 0`

## Lessons Learned

This workspace is a **learning system**. Claude-KB.md contains a `## Lessons Learned` section that persists knowledge across sessions.

### When to add an entry

Proactively add a lesson whenever you encounter:

- **Unexpected behavior** — an API, tool, or workflow didn't work as expected and you found the cause
- **Workarounds** — a problem required a non-obvious solution that future sessions should know about
- **User preferences** — the user corrects your approach or states a preference
- **Process discoveries** — you learn how something actually works vs. how it's documented
- **Pitfalls** — something that wasted time and could be avoided next time

### How to add an entry

Append to the `## Lessons Learned` section in `Claude-KB.md` using this format:

```markdown
### YYYY-MM-DD: Short descriptive title
Description of what happened and what to do differently. Keep it concise and actionable.
```

### Guidelines

- Write for your future self — assume no prior context from this session
- Be specific: include tool names, flag names, error messages, or exact steps
- Don't duplicate existing entries — read the section first
- One entry per distinct lesson; don't bundle unrelated things
- Ask the user before adding if you're unsure whether something qualifies

## Session End

Before ending a session (or when the user says goodbye / wraps up), run these skills in order:

1. `/rc-save` — commit and push all uncommitted changes, capture learnings to KB
2. `/rc-session-save` — save session context for the next session
3. `/rc-greet-save` — save greeting state

Do not wait for the user to remind you. Run these proactively when the session is ending.
