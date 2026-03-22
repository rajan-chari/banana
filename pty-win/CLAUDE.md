# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Commands

```bash
npm install          # setup (one-time)
npm run build        # compile TypeScript → dist/
npm run dev          # watch mode
npm start            # run server on http://127.0.0.1:3600

# With options
node dist/index.js --port 3602 --root "C:\projects\my-app" --emcom "http://127.0.0.1:8800"
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
