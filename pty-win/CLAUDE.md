# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Startup

Before responding to the user's first message:

1. Read `c:\s\projects\work\teams\working\working-state\moss\briefing.md` (rolling narrative — current focus, recent decisions, next up). Prune stale entries on startup.
2. Run `tracker queue moss` for in-flight work items (CLI is sole source of truth — no tracker.md mirror).
3. Read `c:\s\projects\work\teams\working\working-state\moss\field-notes.md` (tactical gotchas) and `decisions.md` (workspace-internal architecture).
4. Read team-wiki index at `c:\s\projects\work\teams\working\team-wiki\index.md` — shared knowledge base. Navigate subtrees as needed (especially `tooling/pty-win/`).
5. Look for a `*-private.md` file matching the user's name (e.g., `Rajan-private.md`). If one exists, read it for personal TODOs, preferences, and reminders. If it references a durable location, read that too.
6. Don't read md files from the parent directory unless the user requests it.
7. Greet the user covering:
   - **What's running** — any active sessions or recent changes
   - **Open items** — TODOs from private notes, briefing, or tracker queue
   - **Quick actions** — common scenarios listed below

### Common Scenarios

- **Start the server** — `npm start` (or `node dist/index.js --root <path>`)
- **Rebuild after TypeScript changes** — `npm run build` (frontend changes need only a browser refresh)
- **Add a new REST endpoint** — edit `src/server.ts`, add route, rebuild
- **Change terminal appearance** — edit `public/style.css` (xterm overrides at bottom) or `TERM_THEME` in `public/app.js`
- **Fix tiling/layout bugs** — `public/app.js`, look for `buildBalancedTree()`, `renderTileNode()`, `renderActiveWorkspace()`
- **Debug idle detection** — `src/screen-detector.ts` (regex patterns), `src/session.ts` (heuristic timer)
- **Sessions panel** — `renderSessionsPanel()` in `public/app.js`, uses `state.paneGroups` for consolidated rows
- **AI launcher presets** — `state.aiPresets` + `showAiPicker()` in `public/app.js`, presets in localStorage
- **Emcom integration** — `src/emcom/poller.ts` (polling), `src/session.ts` (injection + unread count)

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

## Team Rules

- **Independent verification**: All community-facing content (GitHub comments, PRs, docs, samples) must be verified by a different agent before posting. See `team-wiki/process/` for details.

## Gotchas

- **`@xterm/headless` is CJS** — import as `import pkg from "@xterm/headless"; const { Terminal } = pkg;`
- **Windows PTY** — spawns via `cmd.exe /c <command>` (npm .cmd shims need this)
- **Use `127.0.0.1`** not `localhost` (IPv6 penalty on Windows)
- **xterm.js `open()` once only** — terminal uses a persistent wrapper div moved between re-renders
- **`fitAddon.fit()` timing** — ResizeObserver + explicit resize sync to server after every fit
- **Body needs `width: 100%`** — without it, flexbox body shrink-wraps instead of filling viewport
- **`.pane-terminal` needs `position: relative; overflow: hidden`** — xterm wrapper uses `position: absolute; inset: 0`

## Lessons Learned

Knowledge is split across three locations per the working-state migration:

- **Tactical gotchas, env quirks, workarounds** → `working-state/moss/field-notes.md`
- **Workspace-internal architecture** (how pty-win works, decisions specific to this codebase) → `working-state/moss/decisions.md`
- **Stable cross-cutting knowledge** (general truths that help other agents) → team-wiki via librarian (emcom send --to librarian)
- **Sensitive content** (credentials, named-account quirks, HR/promo) → private-wiki via private-librarian

Graduation rule: first land in field-notes; graduate to wiki on the second hit (another agent references it, or you cite it from a second PR).

When you encounter unexpected behavior, workarounds, user preferences, or pitfalls — write the entry to the right destination immediately. Format:

```markdown
### YYYY-MM-DD: Short descriptive title
What happened and what to do differently. Keep it concise and actionable.
```

Guidelines:
- Write for your future self — assume no prior context
- Be specific: include tool names, flag names, error messages, exact steps
- Don't duplicate — read the existing file first
- One entry per distinct lesson

## Git Commit Style

**Always use `-F -` with heredoc** for commit messages — never `$(cat <<'EOF'...)`:

```bash
git commit -F - <<'EOF'
Commit message here.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
```

Using `$(cat <<'EOF'...)` triggers a permission prompt every time. `-F -` reads from stdin, heredoc provides it, no command substitution needed.

## Session End

Before ending a session (or when the user says goodbye / wraps up), run these skills in order:

1. `/rc-save` — commit and push all uncommitted changes, capture learnings to KB
2. `/rc-session-save` — save session context for the next session
3. `/rc-greet-save` — save greeting state

Do not wait for the user to remind you. Run these proactively when the session is ending.
