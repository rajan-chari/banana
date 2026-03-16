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
