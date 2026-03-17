# pty-cld

PTY wrapper for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that automatically injects [emcom](https://github.com/rajan-chari/banana/tree/main/python/agcom) messages into Claude's input when it's idle. This replaces expensive LLM-based inbox polling (1 API call per check) with cheap HTTP polling (every 5 seconds, zero LLM cost).

## Quick start

```bash
# 1. Clone and build
git clone https://github.com/rajan-chari/banana.git
cd banana/pty-cld
npm install
npm run build
npm link

# 2. Install the global Claude Code hook
pty-cld setup

# 3. Start the emcom server (in a separate terminal)
emcom-server

# 4. Register an identity for your project
cd /path/to/my-project
emcom register "MyAgent"

# 5. Launch Claude Code with emcom integration
pty-cld
```

That's it. Claude will now automatically check for emcom messages when it's idle — no manual polling needed.

## What it does

When Claude Code is running inside pty-cld:

1. **Polls emcom** for unread messages every 5 seconds via HTTP (~1ms per check)
2. **Detects when Claude is idle** (waiting at its input prompt) using Claude Code's Notification hook
3. **Injects a prompt** ("Check emcom inbox for new messages") directly into the PTY
4. **Suppresses duplicate polling** — tells Claude via system prompt not to use `/loop`, `CronCreate`, or `emcom-monitor`

Without pty-cld, each inbox check costs a full LLM round-trip. With it, checks are free until a message actually arrives.

## Prerequisites

- **Node.js 18+** (uses native `fetch`)
- **VS Build Tools** (Windows only — required to compile the `node-pty` native addon)
- **emcom server** running (default: `http://127.0.0.1:8800`)
- **identity.json** in each project folder (created by `emcom register`)

## `pty-cld setup`

Installs a global Notification hook into `~/.claude/settings.json` so Claude Code signals pty-cld whenever it reaches an idle prompt. Resolves the hook script path from the install location, so it works on any machine.

- Idempotent — safe to run multiple times
- `pty-cld setup --remove` — removes the hook

## Usage

Run from any project folder that has an `identity.json`:

```bash
cd /path/to/my-project
pty-cld
```

All arguments pass through to Claude Code:

```bash
pty-cld --resume abc123
pty-cld --model sonnet
```

### Web UI (experimental)

A multi-session browser UI on port 3500. Code is written but untested:

```bash
pty-cld --serve
```

### Logs

pty-cld writes a timestamped log to `pty-cld.log` in the current working directory. Useful for debugging polling, idle detection, and injection events:

```bash
tail -f pty-cld.log
```

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

### State machine

```
STARTUP (10s grace) → BUSY → IDLE → INJECTING → COOLDOWN (30s) → BUSY
                        ↑                                          |
                        └──────────────────────────────────────────┘
```

| State | Description |
|-------|-------------|
| **STARTUP** | 10-second grace period while Claude boots. All signals ignored. |
| **BUSY** | Claude is processing (PTY output flowing). Messages are queued. |
| **IDLE** | Claude is at the input prompt. Confirmed by `idle_prompt` hook signal. If messages are queued, injection happens immediately. |
| **INJECTING** | Writing the inbox check command into the PTY. |
| **COOLDOWN** | 30-second pause after injection to avoid spam loops. |

### Idle detection

The primary mechanism is Claude Code's `Notification` hook. When Claude reaches its input prompt, it emits an `idle_prompt` notification. The global hook script (`bin/idle-hook.sh`) reads `.pty-cld-port` from the current working directory and POSTs to the pty-cld control API.

A heuristic fallback (no PTY output for 3 seconds = idle) exists in code but is disabled by default — it can't distinguish permission prompts from the input prompt.

### Multi-instance support

Each pty-cld instance binds its own control API port (starts at 3501, auto-increments if taken). The port is written to `.pty-cld-port` in the project directory. The global hook reads this file, so each instance gets idle signals routed correctly. Multiple projects can run pty-cld simultaneously.

## Project structure

```
pty-cld/
├── src/
│   ├── index.ts              # CLI entry — parse args, bind control API, start session
│   ├── setup.ts              # `pty-cld setup` — install/remove global hook
│   ├── server.ts             # Express + WebSocket for web UI + control API
│   ├── config.ts             # Types, identity.json loading, defaults
│   ├── log.ts                # File-based logging (pty-cld.log in CWD)
│   ├── hooks.ts              # Port file management (.pty-cld-port)
│   ├── pty/
│   │   ├── claude-session.ts  # Spawns Claude in node-pty, wires poller + injector
│   │   └── input-injector.ts  # State machine + keystroke injection
│   └── emcom/
│       ├── client.ts          # HTTP client for emcom API
│       └── poller.ts          # Poll loop with dedup (tracks seen message IDs)
├── bin/
│   └── idle-hook.sh           # Global Notification hook script
├── public/                    # xterm.js web UI (experimental)
│   ├── index.html
│   ├── app.js
│   └── style.css
├── dist/                      # Compiled output (generated by `npm run build`)
├── package.json
└── tsconfig.json
```

### Key files at runtime

| File | Location | Purpose |
|------|----------|---------|
| `identity.json` | Project directory | Created by `emcom register`. Contains `{name, server, registered_at}`. pty-cld reads this to know which emcom identity to poll for. |
| `.pty-cld-port` | Project directory | Written on startup, cleaned up on exit. Contains the control API port number. Read by the global hook to POST idle signals. |
| `pty-cld.log` | Project directory | Timestamped log of polling, idle detection, and injection events. |

## Configuration

Default values (not currently configurable via CLI flags):

| Setting | Default | Description |
|---------|---------|-------------|
| Poll interval | 5000ms | How often to check emcom for new messages |
| Quiet threshold | 3000ms | Heuristic idle threshold (disabled by default) |
| Injection cooldown | 30000ms | Minimum time between injections |
| Control API port | 3501 | Starting port (auto-increments if taken) |
| Web UI port | 3500 | For `--serve` mode |
