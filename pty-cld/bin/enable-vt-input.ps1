# Enable ENABLE_VIRTUAL_TERMINAL_INPUT (0x200) on the console input handle.
# Makes Shift+Tab arrive as ESC[Z instead of 0x09 (same as plain Tab).
# Must run AFTER the parent sets raw mode, since setRawMode resets console flags.
# Works because child process shares the parent's console input handle.
$k = Add-Type -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h, uint m);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h, out uint m);
[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int n);
'@ -Name WinConsole -PassThru
$h = $k::GetStdHandle(-10)
$m = [uint32]0
$k::GetConsoleMode($h, [ref]$m) | Out-Null
$k::SetConsoleMode($h, $m -bor 0x200) | Out-Null
