# Claude-KB — pty-cld

## Lessons Learned

### 2026-03-14: node-pty on Windows needs cmd.exe shell
`pty.spawn("claude", ...)` fails with "File not found" because `claude` is an npm `.cmd` shim. Must spawn via `cmd.exe /c claude ...` on Windows.

### 2026-03-14: Notification hook fires for all notification types
The `Notification` hook fires for `permission_prompt`, `idle_prompt`, `auth_success`, etc. Must filter on `notification_type` in the hook script — injecting during a permission dialog would corrupt the UI.

### 2026-03-14: Use 127.0.0.1 not localhost
IPv6 DNS penalty on Windows makes `localhost` slow. Always use `127.0.0.1` for emcom server and control API.

### 2026-03-14: Wrapper logs must not go to stdout
`console.log` output mixes with Claude's TUI. All logging goes to `pty-cld.log` in CWD via async `WriteStream`.

### 2026-03-17: Shift+Tab lost on Windows — need ENABLE_VIRTUAL_TERMINAL_INPUT
Node.js `setRawMode(true)` on Windows uses libuv's `UV_TTY_MODE_RAW`, which does NOT set `ENABLE_VIRTUAL_TERMINAL_INPUT` (0x200). Without it, the console delivers Tab and Shift+Tab as identical `0x09` bytes — the shift modifier is silently dropped. Arrow keys work because libuv's raw mode handler converts `VK_UP` etc. (where `UnicodeChar=0`) to VT sequences, but Tab has a non-zero `UnicodeChar` so libuv just passes the char through. Fix: after `setRawMode(true)`, run a PowerShell script (`bin/enable-vt-input.ps1`) that calls `SetConsoleMode` with `0x200` on the shared console input handle. This makes Shift+Tab arrive as `\x1b[Z`. The child process shares the console handle, so the mode change affects the parent's stdin reading.

### 2026-03-17: Multi-line paste broken by Buffer.toString() in stdin pipe
`process.stdin` in raw mode delivers data as `Buffer` chunks with arbitrary boundaries. Calling `data.toString()` on a chunk split mid-UTF-8 character mangles the bytes (special chars like `●`, `─`, `❯`). Fix: pass the raw `Buffer` directly to `ptyProcess.write()` which accepts both `string` and `Buffer`. Removed `.toString()` in `index.ts`, widened `session.write()` signature in `claude-session.ts`.

### 2026-03-18: @xterm/headless is CJS — needs default import in ESM
`import { Terminal } from "@xterm/headless"` fails at runtime with "Named export not found" because the package is CommonJS. Fix: `import pkg from "@xterm/headless"; const { Terminal } = pkg;` and use `InstanceType<typeof Terminal>` for the type annotation.

### 2026-04-04: xterm-headless write() is async — tests need flush
`terminal.write(data)` buffers input and processes it asynchronously. Reading the buffer immediately after write returns empty/stale content. Use `terminal.write(data, callback)` where the callback fires after the parser processes the data. In tests, wrap this in a promise: `new Promise(resolve => terminal.write(data, resolve))`.

### 2026-04-14: @homebridge/node-pty-prebuilt-multiarch replaces node-pty
Drop-in replacement with prebuilt binaries — no native build tools needed. Import path changes from `node-pty` to `@homebridge/node-pty-prebuilt-multiarch`. One API difference: `write()` only accepts `string` (not `Buffer`), so convert with `buffer.toString("binary")`. Version 0.13.x (not 1.x like upstream node-pty). Same package pty-win uses.

### 2026-04-04: Work tracker CLI is available
`tracker` command is in PATH. Key commands: `tracker create`, `tracker update`, `tracker list`, `tracker view`, `tracker stats`. Use for tracking work items across sessions.

## Guardrails

### 2026-04-10: Independent verification for community-facing content
All community-facing content (GitHub comments, PRs, docs, samples) must be independently verified before posting. Author prepares, a different agent tests/reviews. No self-verification.

- **Code** (PRs, samples): must compile + run, tested by a different agent
- **Non-code** (comments, recommendations): fact-checked by a different agent
- **Exception**: low-risk responses (ack issues, asking for repro) are exempt
- **Scope**: GitHub/public only. Internal emcom/tracker/briefing excluded.

Source: team-manual.md (d83df24)

### 2026-04-14: External quality bar — smooth startups and verified facts
Two principles for all external-facing work:
1. **Startup journeys must be super smooth** — npm packages, setup scripts, Docker images. Test end-to-end on clean machines. First impressions matter; people drop out quickly if setup fails.
2. **External comments/PRs must have very high fact confirmation** — verify claims against current code before posting. Don't post based on stale analysis.

For pty-cld: before shipping, test clean-machine install + startup as a first-time user. Every step must just work.

Source: Rajan directive (2026-04-14)
