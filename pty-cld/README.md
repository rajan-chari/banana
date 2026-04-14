# pty-cld

Terminal-only wrapper for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with automatic [emcom](https://github.com/rajan-chari/banana/tree/main/python/agcom) message injection. Replaces expensive LLM-based inbox polling (1 API call per check) with cheap HTTP polling (every 5 seconds, zero LLM cost).

Part of the [fellow-agents](https://github.com/rajan-chari/fellow-agents) system. For the browser UI, see [pty-win](../pty-win/).

## Quick start

```bash
# 1. Install and build
npm install
npm run build
npm link

# 2. Install the global Claude Code idle-detection hook
pty-cld setup

# 3. Start the emcom server (in a separate terminal)
emcom-server

# 4. Register an identity for your project
cd /path/to/my-project
emcom register "MyAgent"

# 5. Launch Claude Code with emcom integration
pty-cld
```

Claude will now automatically check for emcom messages when idle -- no manual polling needed.

## What it does

When Claude Code is running inside pty-cld:

1. **Polls emcom** for unread messages every 5 seconds via HTTP (~1ms per check)
2. **Detects when Claude is idle** using screen-aware detection (xterm-headless + Notification hook)
3. **Injects prompts** directly into the PTY when messages arrive or checkpoints are due
4. **Suppresses duplicate polling** -- tells Claude via system prompt not to use `/loop`, `CronCreate`, or `emcom-monitor`
5. **Injects periodic checkpoints** -- light (2hr) and full (4hr) checkpoint prompts to keep briefings current
6. **Starts without emcom** -- if no `identity.json` exists, watches for one to appear and attaches dynamically

## Prerequisites

- **Node.js 18+** (uses native `fetch`)
- **emcom server** running (default: `http://127.0.0.1:8800`)
- **identity.json** in each project folder (created by `emcom register`)

No native build tools required -- uses prebuilt binaries for the PTY module.

## `pty-cld setup`

Installs a global Notification hook into `~/.claude/settings.json` so Claude Code signals pty-cld whenever it reaches an idle prompt. Resolves the hook script path from the install location, so it works on any machine.

- Idempotent -- safe to run multiple times
- `pty-cld setup --remove` -- removes the hook

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

### CLI flags

| Flag | Description |
|------|-------------|
| `setup` | Install/remove the global idle-detection hook |
| `--poll-interval <ms>` | Override emcom poll interval (default: 5000) |
| `--cooldown <ms>` | Override injection cooldown (default: 30000) |
| `--control-port <port>` | Override control API port (default: 3501, auto-increments) |

### Logs

pty-cld writes a timestamped log to `pty-cld.log` in the current working directory:

```bash
tail -f pty-cld.log
```

## How it works

### Data flow

```
[emcom-server :8800]
       |  GET /email/tags/unread (every 5s, ~1ms)
[EmcomPoller] -- new msgs --> [InputInjector]
       |                            |
       |  Two trigger paths:        |
       |  1. Msg while idle ------->| inject immediately
       |  2. Msg while busy ------->| queue, wait for idle signal
       |                            |
[Notification hook] -- idle_prompt -| POST to control API
       |                            |
[pty: claude] <-- "Check emcom inbox\r" --+
```

### State machine

```
STARTUP (10s grace) -> BUSY -> IDLE -> INJECTING -> COOLDOWN (30s) -> BUSY
                        ^                                              |
                        +----------------------------------------------+
```

| State | Description |
|-------|-------------|
| **STARTUP** | 10-second grace period while Claude boots. All signals ignored. |
| **BUSY** | Claude is processing (PTY output flowing). Messages are queued. |
| **IDLE** | Claude is at the input prompt. Detected by screen-aware heuristic (1s quiet + `>` on screen) or Notification hook. If messages are queued, injection happens immediately. |
| **INJECTING** | Writing the inbox check command into the PTY. |
| **COOLDOWN** | 30-second pause after injection to avoid spam loops. |

### Idle detection

Two mechanisms work together:

1. **Screen-aware heuristic** (primary) -- Uses xterm-headless to maintain a virtual screen buffer. When PTY output is quiet for 1 second and the screen shows the `>` prompt, Claude is idle. This correctly distinguishes the input prompt from permission prompts.

2. **Notification hook** (secondary) -- Claude Code's `Notification` hook fires `idle_prompt` when Claude finishes a turn. The global hook script (`bin/idle-hook.sh`) reads `.pty-cld-port` from the CWD and POSTs to the control API.

### Multi-instance support

Each pty-cld instance binds its own control API port (starts at 3501, auto-increments if taken). The port is written to `.pty-cld-port` in the project directory. The global hook reads this file, so each instance gets idle signals routed correctly. Multiple projects can run pty-cld simultaneously.

## Project structure

```
pty-cld/
+-- src/
|   +-- index.ts              # CLI entry -- parse args, bind control API, start session
|   +-- setup.ts              # `pty-cld setup` -- install/remove global hook
|   +-- config.ts             # Types, identity.json loading, defaults
|   +-- log.ts                # File-based logging (pty-cld.log in CWD)
|   +-- hooks.ts              # Port file management (.pty-cld-port)
|   +-- pty/
|   |   +-- claude-session.ts  # Spawns Claude in PTY, wires poller + injector
|   |   +-- input-injector.ts  # State machine + prompt injection
|   |   +-- screen-detector.ts # xterm-headless screen parsing for idle detection
|   +-- emcom/
|       +-- client.ts          # HTTP client for emcom API
|       +-- poller.ts          # Poll loop with dedup (tracks seen message IDs)
+-- bin/
|   +-- idle-hook.sh           # Global Notification hook script
|   +-- enable-vt-input.ps1   # Windows: enable Shift+Tab passthrough
+-- dist/                      # Compiled output (generated by `npm run build`)
+-- package.json
+-- tsconfig.json
```

### Key files at runtime

| File | Location | Purpose |
|------|----------|---------|
| `identity.json` | Project directory | Created by `emcom register`. Contains `{name, server, registered_at}`. pty-cld reads this to know which emcom identity to poll for. |
| `.pty-cld-port` | Project directory | Written on startup, cleaned up on exit. Contains the control API port number. Read by the global hook to POST idle signals. |
| `pty-cld.log` | Project directory | Timestamped log of polling, idle detection, and injection events. |

## Configuration

| Setting | Default | CLI flag | Description |
|---------|---------|----------|-------------|
| Poll interval | 5000ms | `--poll-interval` | How often to check emcom for new messages |
| Quiet threshold | 3000ms | -- | Screen-aware idle threshold |
| Injection cooldown | 30000ms | `--cooldown` | Minimum time between injections |
| Control API port | 3501 | `--control-port` | Starting port (auto-increments if taken) |
