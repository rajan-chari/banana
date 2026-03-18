# pty-xterm Musings

Ideas for a browser-based PTY experience building on pty-cld learnings.

## Core Insight

node-pty gives raw byte I/O but no screen state. xterm-headless (from the xterm.js project) is a headless terminal emulator — feed it PTY output and it maintains an in-memory screen buffer you can query programmatically.

This unlocks two capabilities:

1. **Screen-aware idle detection** — read the rendered buffer to distinguish prompt types (input prompt vs. permission prompt vs. busy output), replacing or complementing the Notification hook approach
2. **Browser-based terminal** — xterm.js in the browser renders the same stream, giving a full web UI

## Architecture

```
[node-pty: claude]
       |  raw PTY output
       v
  [tee / fanout]
       |                    |
       v                    v
[xterm-headless]      [xterm.js in browser]
  (server-side)         (client-side via WebSocket)
  - screen buffer       - live rendering
  - idle detection      - user interaction
  - snapshot API
```

### Server side
- **node-pty** spawns Claude Code in a PTY
- **xterm-headless** consumes the same output stream, maintains screen buffer
- **Idle detector** reads last N lines from the buffer, pattern-matches on prompt characters (e.g. `>` for input prompt, `Allow?` for permission prompt)
- **WebSocket server** forwards PTY output to browser, relays browser keystrokes back to PTY

### Client side
- **xterm.js** renders terminal in browser
- **xterm-addon-fit** auto-sizes to container
- User keystrokes go back through WebSocket to node-pty

## Screen-Aware Idle Detection

Current pty-cld approach:
- **Hook-based** (primary): Claude Code's `Notification` hook POSTs `idle_prompt` to control API
- **Heuristic** (disabled): "no output for 3s" — unsafe, can't distinguish prompt types

With xterm-headless:
```
on PTY quiet for 3s:
  snapshot = terminal.buffer.active
  lastLine = snapshot.getLine(snapshot.cursorY).translateToString()
  if lastLine matches /[>$]$/ → idle (input prompt)
  if lastLine matches /Allow|permission|y\/n/i → busy (permission prompt)
  else → busy (still processing)
```

Benefits:
- No dependency on Claude Code's hook system
- Immediate detection — no external POST latency
- Can distinguish all prompt types by inspecting rendered content
- Works even if hook behavior changes across Claude Code versions

Tradeoff:
- Must track Claude Code's prompt patterns (may change across versions)
- xterm-headless adds ~2MB to dependencies

## Open Questions

- **Dual rendering** — does feeding the same byte stream to both xterm-headless (server) and xterm.js (browser) cause issues? Should be fine since they're independent parsers.
- **Resize sync** — when browser resizes, need to update both node-pty cols/rows AND xterm-headless cols/rows, or the buffer state diverges.
- **xterm-headless memory** — long-running sessions with large scrollback. What's the memory profile? May need to cap scrollback lines.
- **Prompt pattern stability** — how often does Claude Code change its prompt characters? Need a strategy for keeping patterns current.
- **Multi-session** — pty-cld already supports multiple instances via port files. Browser UI would need a session picker/router.

## Relationship to pty-cld

This would be a new project, not a modification of pty-cld. pty-cld stays as the CLI wrapper. The new project takes the lessons learned (polling, idle detection, injection, multi-instance) and rebuilds with a browser-first architecture.

Key pty-cld lessons to carry forward:
- Use 127.0.0.1 not localhost (IPv6 penalty on Windows)
- Spawn via `cmd.exe /c claude` on Windows (npm .cmd shim)
- Raw Buffer passthrough for stdin (no `.toString()` mangling)
- ENABLE_VIRTUAL_TERMINAL_INPUT for Shift+Tab on Windows
- System prompt injection to suppress duplicate polling
