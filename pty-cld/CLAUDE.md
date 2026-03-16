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

PTY wrapper for Claude Code with emcom message injection. Replaces expensive `/loop` polling (1 LLM call per inbox check) with cheap HTTP polling (5s interval, zero LLM cost).

## Setup (one-time)

```bash
# 1. Install and link
cd pty-cld && npm install && npm run build && npm link

# 2. Verify global hook exists in ~/.claude/settings.json
# Should have a Notification hook pointing to bin/idle-hook.sh
# See "Global hook" section below for the exact config
```

### Prerequisites

- Node.js 18+ (for native fetch)
- VS Build Tools (for node-pty native addon on Windows)
- emcom server running on port 8800
- Each project folder needs `identity.json` (created by `emcom register`)

## How it works

### Data flow

```
[emcom-server :8800]
       |  GET /email/tags/unread (every 5s, ~1ms)
[EmcomPoller] ── new msgs ──> [InputInjector]
       |                            |
       |  Two trigger paths:        |
       |  1. Msg while idle ------->| inject immediately
       |  2. Msg while busy ------->| queue, wait for idle signal
       |                            |
[Notification hook] ── idle_prompt ─| POST to control API
       |                            |
[node-pty: claude] <── "Check emcom inbox\r" ──┘
```

### Injection state machine

```
STARTUP (10s grace) → BUSY → IDLE → INJECTING → COOLDOWN (30s) → BUSY
                        ↑                                          |
                        └──────────────────────────────────────────┘
```

- **STARTUP**: Ignores everything while Claude boots (10s)
- **BUSY**: Claude is processing (PTY output flowing)
- **IDLE**: Claude is at input prompt (confirmed by `idle_prompt` hook)
- **INJECTING**: Writing emcom check command into PTY
- **COOLDOWN**: 30s pause after injection to avoid spam

### Idle detection

**Primary** — Claude Code `Notification` hook with `idle_prompt` type. The global hook script (`bin/idle-hook.sh`) reads `.pty-cld-port` from CWD and POSTs to the control API.

**Heuristic (disabled by default)** — "no PTY output for 3s = idle". Unsafe because it can't distinguish permission prompts from the input prompt.

### System prompt injection

Each Claude spawned by pty-cld gets `--append-system-prompt` telling it not to use `/loop`, `CronCreate`, or `emcom-monitor` for inbox polling — pty-cld handles it externally. This prevents double-polling when a project's CLAUDE.md instructs Claude to start emcom monitoring.

## Architecture

```
pty-cld/
  src/
    index.ts                 # CLI entry — parse args, bind control API, start session
    server.ts                # Express + WebSocket for web UI + control API
    config.ts                # Types, identity.json loading, defaults
    log.ts                   # File-based logging (pty-cld.log in CWD)
    hooks.ts                 # Port file management (.pty-cld-port)
    pty/
      claude-session.ts      # Spawns Claude in node-pty, wires poller + injector
      input-injector.ts      # Idle state machine + keystroke injection
    emcom/
      client.ts              # HTTP client for emcom API
      poller.ts              # Poll loop with dedup (tracks seen IDs)
  public/                    # xterm.js web UI (written, untested)
  bin/
    idle-hook.sh             # Global Notification hook script
```

### Key files

- `identity.json` — Created by `emcom register` in each project folder. Contains `{name, server, registered_at}`. pty-cld reads this to determine which emcom identity to poll for.
- `.pty-cld-port` — Written by pty-cld on startup. Contains the control API port number. Read by the global hook to POST idle signals. Cleaned up on exit.
- `pty-cld.log` — Timestamped log in CWD. Shows polling, idle detection, injection events.

### Multi-instance support

Each pty-cld instance binds its own control API port (starting at 3501, auto-increments if taken). The port is written to `.pty-cld-port` in the project CWD. The global hook reads this file — so each instance gets its own idle signals routed correctly.

### Global hook

In `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Notification": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "bash C:/s/projects/work/teams/working/banana/pty-cld/bin/idle-hook.sh",
        "async": true
      }]
    }]
  }
}
```

The script (`bin/idle-hook.sh`) filters for `idle_prompt` notifications only, reads `.pty-cld-port`, and curls the control API. No-ops silently when not running under pty-cld.

### Key dependencies

- `node-pty` — PTY spawning (requires VS Build Tools on Windows)
- `express` — Web server for browser mode + control API
- `ws` — WebSocket for terminal multiplexing

## Status

- **Working**: CLI mode, emcom polling, idle hook injection, multi-instance, system prompt suppression
- **Untested**: Web UI (`--serve` mode with xterm.js) — code written but never run
- **Not implemented**: `ws-bridge.ts` (WebSocket bridge for browser ↔ PTY)

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
