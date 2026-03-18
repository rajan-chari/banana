# Claude-KB — pty-cld

## Lessons Learned

### 2026-03-14: node-pty on Windows needs cmd.exe shell
`pty.spawn("claude", ...)` fails with "File not found" because `claude` is an npm `.cmd` shim. Must spawn via `cmd.exe /c claude ...` on Windows.

### 2026-03-14: Notification hook fires for all notification types
The `Notification` hook fires for `permission_prompt`, `idle_prompt`, `auth_success`, etc. Must filter on `notification_type` in the hook script — injecting during a permission dialog would corrupt the UI.

### 2026-03-14: Heuristic idle detection is unsafe
The "no output for 3s = idle" heuristic can't distinguish permission prompts from the input prompt. Disabled by default — rely on the `idle_prompt` hook instead.

### 2026-03-14: Use 127.0.0.1 not localhost
IPv6 DNS penalty on Windows makes `localhost` slow. Always use `127.0.0.1` for emcom server and control API.

### 2026-03-14: Wrapper logs must not go to stdout
`console.log` output mixes with Claude's TUI. All logging goes to `pty-cld.log` in CWD via `appendFileSync`.

### 2026-03-14: Multiple instances need port file approach
Per-project hook installation in `.claude/settings.local.json` is messy and fragile. Instead: one global hook + `.pty-cld-port` file per CWD. Each instance binds its own port, writes the file, hook reads it.

### 2026-03-16: System prompt suppresses duplicate emcom polling
Claude instances with CLAUDE.md instructions to start `/emcom-monitor` will double-poll. The wrapper appends `--append-system-prompt` telling Claude not to use `/loop` or `CronCreate` for emcom — pty-cld handles it externally.

### 2026-03-16: idle_prompt hook has latency after skill/cron setup
The `Notification` hook with `idle_prompt` type fires only after Claude **fully finishes** its turn — including skill loading and cron scheduling. In testing, this added ~2.5 minutes of apparent latency after a complex startup response. This is expected Claude Code behavior, not a pty-cld bug.

### 2026-03-16: Notification hook JSON has spaces — grep must be flexible
Claude Code sends hook JSON with spaces after colons: `"notification_type": "idle_prompt"`. The original grep pattern `'"notification_type":"idle_prompt"'` (no space) silently failed, causing `idle-hook.sh` to exit without posting to the control API. Fix: use `'"notification_type".*"idle_prompt"'` to match regardless of whitespace. Always use flexible patterns when grepping JSON from external tools.

### 2026-03-17: Shift+Tab lost on Windows — need ENABLE_VIRTUAL_TERMINAL_INPUT
Node.js `setRawMode(true)` on Windows uses libuv's `UV_TTY_MODE_RAW`, which does NOT set `ENABLE_VIRTUAL_TERMINAL_INPUT` (0x200). Without it, the console delivers Tab and Shift+Tab as identical `0x09` bytes — the shift modifier is silently dropped. Arrow keys work because libuv's raw mode handler converts `VK_UP` etc. (where `UnicodeChar=0`) to VT sequences, but Tab has a non-zero `UnicodeChar` so libuv just passes the char through. Fix: after `setRawMode(true)`, run a PowerShell script (`bin/enable-vt-input.ps1`) that calls `SetConsoleMode` with `0x200` on the shared console input handle. This makes Shift+Tab arrive as `\x1b[Z`. The child process shares the console handle, so the mode change affects the parent's stdin reading.

### 2026-03-17: Multi-line paste broken by Buffer.toString() in stdin pipe
`process.stdin` in raw mode delivers data as `Buffer` chunks with arbitrary boundaries. Calling `data.toString()` on a chunk split mid-UTF-8 character mangles the bytes (special chars like `●`, `─`, `❯`). Fix: pass the raw `Buffer` directly to `ptyProcess.write()` which accepts both `string` and `Buffer`. Removed `.toString()` in `index.ts`, widened `session.write()` signature in `claude-session.ts`.

### 2026-03-18: xterm-headless enables screen-aware idle detection
node-pty provides raw byte I/O but no screen state. `xterm-headless` (from the xterm.js project) is a headless terminal emulator — feed it PTY output and it maintains an in-memory cell grid. You can read `buffer.getLine(y).translateToString()` to see what's rendered. This lets you pattern-match on prompt content (e.g. `❯` for input prompt vs. `Allow?` for permission prompt) instead of relying solely on the Notification hook. Design notes in `banana/pty-xterm-musings.md`.
