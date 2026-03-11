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

### 2026-03-11: sage owns the skills repo — defer commits there
The `~/.claude/skills/` directory is managed by sage (fellow_scholars workspace). Don't commit/push skill changes directly — send sage a message via emcom with what changed and let them handle it.
