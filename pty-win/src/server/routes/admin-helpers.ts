import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { clog } from "../../log.js";

/**
 * Best-effort read of a folder's identity.json. Returns whether the file
 * exists and the parsed `name` (when present and a non-empty string).
 * Defensive: parse / read errors yield `hasIdentity: true, identityName:
 * undefined` so the caller can still surface the file's presence.
 */
export function readIdentityInfo(resolvedPath: string): {
  hasIdentity: boolean;
  identityName: string | undefined;
} {
  const identityPath = join(resolvedPath, "identity.json");
  if (!existsSync(identityPath)) {
    return { hasIdentity: false, identityName: undefined };
  }
  try {
    const raw = JSON.parse(readFileSync(identityPath, "utf-8"));
    const identityName =
      typeof raw.name === "string" && raw.name.trim() ? raw.name : undefined;
    return { hasIdentity: true, identityName };
  } catch {
    return { hasIdentity: true, identityName: undefined };
  }
}

/**
 * Inject-friendly shape for the child_process spawn used by `launchVscode`.
 * Tests pass a fake to assert command + arg construction without running real
 * processes; production code passes the real `spawn`.
 */
export type SpawnFn = typeof spawn;

/**
 * Launch VS Code against `resolvedPath`. On Windows, runs a PowerShell script
 * that minimizes the current foreground window (so we don't lose focus) and
 * then opens `code` hidden. Elsewhere, spawns `code <path>` through a shell.
 * Both branches detach immediately (.unref()).
 *
 * `spawnFn` is injectable for unit testing — callers in production should
 * pass `spawn` from "child_process".
 */
export function launchVscode(resolvedPath: string, spawnFn: SpawnFn = spawn): void {
  clog(`vscode: opening ${resolvedPath}`);
  if (process.platform === "win32") {
    const psScript = `
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Focus {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
        $hwnd = [Win32Focus]::GetForegroundWindow()
        [Win32Focus]::ShowWindow($hwnd, 6)  # SW_MINIMIZE
        Start-Process code -ArgumentList '${resolvedPath.replace(/'/g, "''")}' -WindowStyle Hidden
      `;
    clog("vscode: launching via PowerShell (minimize + Start-Process)");
    const ps = spawnFn("powershell", ["-NoProfile", "-Command", psScript], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    ps.stdout?.on("data", (data: Buffer) => {
      clog(`vscode: stdout: ${data.toString().trim()}`);
    });
    ps.stderr?.on("data", (data: Buffer) => {
      clog(`vscode: stderr: ${data.toString().trim()}`);
    });
    ps.on("exit", (code) => {
      clog(`vscode: PowerShell exited (code ${code})`);
    });
    ps.unref();
    return;
  }

  const child = spawnFn("code", [resolvedPath], {
    shell: true,
    stdio: "ignore",
  });
  child.unref();
  clog("vscode: launched via shell");
}
