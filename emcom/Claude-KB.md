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
