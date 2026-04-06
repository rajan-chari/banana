# Claude-KB

Domain knowledge and lessons learned for emcom.

## Lessons Learned

### 2026-03-10: Textual TabbedContent doesn't respect fr height constraints
TabbedContent's internal ContentSwitcher doesn't propagate height constraints to TabPane children. DataTable inside grows to full content height, pushing widgets below it off-screen. Fix: wrap TabbedContent + preview in a `Container` with `layout: grid; grid-size: 1 2; grid-rows: 3fr 2fr;`. Grid layout explicitly allocates row heights. Don't try `overflow: hidden` on Screen or `fr` units on TabbedContent directly — neither works reliably.

### 2026-03-10: Auto-focus DataTable on mount for immediate keyboard nav
Textual doesn't auto-focus the first focusable widget. Call `self.query_one("#table-inbox", DataTable).focus()` at end of `on_mount()`, and also after tab switches, so arrow keys work without clicking first.

### 2026-03-11: .NET AOT publish requires VS Developer Command Prompt
`dotnet publish -r win-x64` with `PublishAot=true` needs the MSVC linker (`link.exe`) and Windows SDK libs in PATH. Running from plain bash/PowerShell fails with "vswhere.exe not recognized" and linker errors. Fix: use a batch file that calls `vcvars64.bat` first, then `dotnet publish`. The `emcomcs/build-aot.bat` does this. Run it via `powershell.exe -NoProfile -Command "cmd /c 'build-aot.bat' 2>&1"` from bash.

### 2026-03-11: emcom server returns `active` as integer, not boolean
The `/who` endpoint returns `"active": 1` (SQLite integer), not `"active": true`. System.Text.Json's default bool deserializer rejects this. Fix: custom `BoolFromIntConverter` on the `Identity.Active` property that handles both `JsonTokenType.Number` and `JsonTokenType.True/False`.

### 2026-03-11: AOT-safe JSON serialization with System.Text.Json
`JsonContent.Create(object, Type, ...)` triggers IL2026/IL3050 trimming warnings and may fail at AOT runtime. Fix: use `JsonSerializer.Serialize<T>(body, typeInfo)` with the source-generated `JsonTypeInfo<T>` from `EmcomJsonContext.Default`, then wrap in `StringContent`. Also: `[JsonPropertyName]` attributes override the global `PropertyNamingPolicy`, so either use attributes OR the policy, not both (attributes take precedence).

### 2026-03-11: Skill Bash commands must be simple for permission auto-approve
Variable assignment + chaining (`EMCOM=$HOME/... && $EMCOM inbox && $EMCOM read ...`) triggers manual permission prompts because the permission model can't parse what's being executed. Fix: one simple command per Bash call, use the bare command name or literal path, and use parallel Bash tool calls for independent operations. Sequential dependencies (register→retry) must be separate calls in order.

### 2026-03-11: Git Bash adds ~170ms process creation overhead vs native shells
Benchmarked emcom CLI: 74ms from PowerShell, 96ms via cmd, 241ms from Git Bash. The ~170ms delta is MSYS2 fork emulation. The native AOT binary itself executes in ~44ms (minus ~30ms network). Cannot be fixed in application code — it's the shell layer.

### 2026-03-11: TUI preview must not trigger read side-effects
`client.read()` now auto-tags `pending` by default (for CLI workflow). But the TUI calls `read()` on every row highlight for preview, which would tag everything as `pending` just from scrolling. Fix: pass `tags=[]` explicitly in TUI preview and reply-fetch calls. Design: server is side-effect-free by default (`add_tags` param opt-in), clients choose what tags to apply. Python CLI passes `["pending"]` explicitly; C# CLI does the same.

### 2026-03-11: vswhere.exe must be on PATH for .NET AOT publish from Git Bash
`dotnet publish` with `PublishAot=true` fails from Git Bash because `vswhere.exe` isn't on PATH. Quick fix: prepend its location (`/c/Program Files (x86)/Microsoft Visual Studio/Installer`) to PATH in the same command: `PATH="..." dotnet publish ...`. No need for a full Developer Command Prompt.

### 2026-03-11: SQLite perf — connection reuse and N+1 elimination give 5-30x speedup
Thread-local connection reuse (`threading.local()`) eliminates per-call `sqlite3.connect()` + 3 PRAGMAs overhead — this alone gives ~7x on writes. For reads, the N+1 tag query pattern (1 query per email to fetch tags) was the main bottleneck. Fix: batch-fetch all tags in one `WHERE owner=? AND email_id IN (...)` query via `_attach_tags()` helper. Also: filter in SQL (WHERE clause with LIKE on JSON fields) instead of loading all rows and filtering in Python. Added `idx_tags_email_owner` index for the batch tag lookups.

### 2026-03-11: Linters/hooks can silently revert uncommitted edits
A pre-commit hook or linter modifying `db.py` reverted feature changes (new methods + modified `inbox()`) while I was still editing. Always re-read files after a linter runs and before building/testing. Don't assume your edits survived.

### 2026-03-11: Skill instructions shape agent behavior — avoid prescriptive ordering
Writing "every message you process follows this pattern: 1, 2, 3, 4" caused agents to process messages strictly sequentially. Changing to "any order is fine, batch your work, tag handled in parallel" let agents show good judgment (read all, batch process, parallel tag). Skill wording directly controls whether agents act rigidly or adaptively.

### 2026-03-11: Repo ownership — emcom is ours, skills repo is sage's
The emcom repo (`banana/emcom/`) is ours to commit and push directly. The skills repo (`~/.claude/skills/`) is managed by sage (fellow_scholars workspace) — send sage a message via emcom with what changed and let them handle commits there.

### 2026-03-23: uvicorn.run() clears logging filters — install in lifespan
Adding a `logging.Filter` to `uvicorn.access` before `uvicorn.run()` doesn't work — `uvicorn.run()` calls `dictConfig()` internally which reconfigures the logger and clears filters. Fix: install the filter inside the FastAPI `lifespan` context manager, which runs after uvicorn's logging setup but before requests are served.

### 2026-03-23: PyInstaller can't overwrite a running exe on Windows
`pyinstaller --noconfirm` fails with `PermissionError: [WinError 5] Access is denied` if the target exe is currently running. The running process holds a file lock. Must stop the process before rebuilding. Plan for this when coordinating exe rebuilds with users.

### 2026-03-25: emcom --cc does not accept comma-separated names
`emcom send --cc moss,blake,sage` fails with "Recipient 'moss,blake,sage' is not registered" — the CLI treats the entire comma-separated string as a single recipient name. If CC support is needed, use separate `--cc` flags per recipient or omit CC and send to the primary recipient (replies in-thread are visible to all participants anyway).

### 2026-04-04: Work tracker CLI is live — usage reference
`tracker.exe` is deployed at `~/.claude/skills/emcom/bin/tracker.exe`. It shares the emcom-server (same SQLite DB, same auth via identity.json). Key commands:
- `tracker create --repo teams.py --title 'JWKS bug' --number 344 --severity high --assigned spark-py`
- `tracker update teams.py#344 --status investigating --comment 'Starting work'`
- `tracker update teams.py#344 --blocker 'waiting on Rajan'` (sets blocked_since automatically)
- `tracker update teams.py#344 --decision 'Use approach B' --decision-rationale 'Lower risk'`
- `tracker list --status open --repo teams.py` ("open" = everything except merged/deferred/closed)
- `tracker list --needs-decision` (Rajan's decision backlog)
- `tracker view teams.py#344` (full detail + history)
- `tracker queue frost` (what should I work on next — assigned, open, unblocked, sorted by severity)
- `tracker stats` / `tracker decisions` / `tracker stale` / `tracker blocked` / `tracker search 'JWKS'`
- Dedup: creating the same repo#number twice returns the existing item.
- Lookups: `teams.py#344`, `344` (if unambiguous), or UUID prefix all work.
Rule: when shipping features to emcom-server, update relevant tracker items. When blocked, set --blocker.

### 2026-04-06: PyInstaller --onefile blocked by Windows Application Control — use --runtime-tmpdir
PyInstaller `--onefile` extracts bundled DLLs (python313.dll etc.) to `%TEMP%\_MEIxxxxxx\` on every launch. Corporate Application Control policies (AppLocker/WDAC) block DLL loads from Temp. Fix: rebuild with `--runtime-tmpdir "$HOME/.emcom/runtime"` so extraction goes to a whitelisted path. Applied to both emcom-server.exe and emcom-tui.exe. Always include this flag in future PyInstaller builds.

### 2026-04-04: Always AOT publish (not debug build) when deploying emcom.exe
The deployed emcom.exe at `~/.claude/skills/emcom/bin/` was overwritten with a pre-feature build, losing batch 1+2 CLI features. The `emcomcs/bin/Debug/` directory contains a non-AOT build without all features compiled in. Always deploy from the AOT publish path: `emcomcs/bin/Release/net10.0/win-x64/publish/emcom.exe`. After deploying, verify with `emcom check` or `emcom status` to confirm features are present.

### 2026-04-03: NEVER dev/test on production port 8800
Killing and restarting emcom-server on port 8800 during tracker development caused 3 crashes that cut communication for all 18 agents. Root cause: dev and production shared the same server process. Rule: always use port 8801+ for development/testing (`EMCOM_PORT=8801 emcom-server`). Never kill the production server for rebuilds — build to a staging path, then swap binaries only during coordinated restarts. Send a heads-up to agents before any infrastructure changes.

### 2026-03-25: Use `git commit -F -` with heredoc instead of `$(cat <<'EOF')`
`git commit -m "$(cat <<'EOF'...EOF)"` triggers a permission prompt every time due to the `$()` command substitution. Use `git commit -F - <<'EOF'` instead — `-F -` reads the message from stdin, heredoc provides it, no subshell needed. No more permission interruptions.
