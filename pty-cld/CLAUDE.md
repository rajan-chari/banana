# CLAUDE.md — pty-cld

## Startup

Before responding to the user's first message:

1. Read `Claude-KB.md` in this directory for lessons learned and domain knowledge.
2. Read `session-context.md` if it exists — it has ephemeral state from the previous session.
3. Look for a `*-private.md` file matching the user's name (e.g., `Rajan-private.md`). If found, read it for personal TODOs and preferences.
4. Don't read md files from the parent directory unless the user requests it.
5. Greet the user covering:
   - Open TODOs or reminders from private notes
   - Quick-start commands (see below)

### Common scenarios

- **Build** — `npm run build` (compiles TypeScript to `dist/`)
- **Run CLI mode** — `cd /project/with/identity.json && pty-cld` (wraps Claude with emcom polling)
- **Run with args** — `pty-cld --resume <session-id>` (args pass through to claude)
- **Run web UI** — `pty-cld --serve` (multi-session browser UI on port 3500)
- **Watch build** — `npm run dev` (tsc --watch)
- **Tail logs** — `tail -f pty-cld.log` (from the project folder where pty-cld is running)

## What this is

PTY wrapper for Claude Code with emcom message injection. Solves the problem of expensive `/loop` polling for inter-Claude messaging.

### How it works

1. Spawns Claude CLI in a PTY (node-pty)
2. Polls emcom REST API every 5s for unread messages (cheap HTTP, no LLM cost)
3. When new messages arrive and Claude is idle, injects "Check emcom inbox" into the PTY
4. Idle detection via Claude Code's `Notification` hook (`idle_prompt` type)
5. Appends system prompt telling Claude not to start its own emcom polling

### Architecture

```
pty-cld/
  src/
    index.ts                 # CLI entry — parse args, start sessions
    server.ts                # Express + WebSocket for web UI + control API
    config.ts                # Types + config loading
    log.ts                   # File-based logging (pty-cld.log in CWD)
    hooks.ts                 # Port file management (.pty-cld-port)
    pty/
      claude-session.ts      # Spawns Claude in node-pty, wires poller + injector
      input-injector.ts      # Idle state machine + keystroke injection
    emcom/
      client.ts              # HTTP client for emcom API
      poller.ts              # Poll loop with dedup
    web/
      ws-bridge.ts           # WebSocket bridge (not yet implemented)
  public/                    # xterm.js web UI (written, untested)
  bin/
    idle-hook.sh             # Global Notification hook script
```

### Key dependencies

- `node-pty` — PTY spawning (requires VS Build Tools on Windows)
- `express` — Web server for browser mode + control API
- `ws` — WebSocket for terminal multiplexing

### Global hook

A single `Notification` hook in `~/.claude/settings.json` fires `bin/idle-hook.sh` on every notification. The script filters for `idle_prompt` type, reads `.pty-cld-port` from CWD, and POSTs to the control API. No-ops silently for non-pty-cld sessions.

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
