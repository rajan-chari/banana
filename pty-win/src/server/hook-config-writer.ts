import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { clog, log } from "../log.js";

/** Write Claude and Copilot hook settings into a workspace. */
export function writeSessionHooks(workingDir: string, port: number): void {
  try {
    const claudeDir = join(workingDir, ".claude");
    if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, "settings.local.json");
    let settings: Record<string, unknown> = {};
    if (existsSync(settingsPath)) {
      try { settings = JSON.parse(readFileSync(settingsPath, "utf-8")); } catch { /* ignore */ }
    }
    const base = `http://127.0.0.1:${port}`;
    const sessionStartCmd = `curl -s -m 4 -X POST -H "Content-Type: application/json" -d @- ${base}/api/hook/session-start`;
    settings.hooks = {
      SessionStart: [{ matcher: ".*", hooks: [{ type: "command", command: sessionStartCmd, timeout: 5 }] }],
      Stop: [{ matcher: "", hooks: [{ type: "http", url: `${base}/api/hook/stop`, timeout: 2 }] }],
      Notification: [{ matcher: ".*", hooks: [{ type: "http", url: `${base}/api/hook/notify`, timeout: 2 }] }],
      UserPromptSubmit: [{ matcher: "", hooks: [{ type: "http", url: `${base}/api/hook/prompt-submit`, timeout: 2 }] }],
    };
    settings.messageIdleNotifThresholdMs = 5000;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    clog(`hooks configured for ${workingDir} -> port ${port}`);
    writeCopilotHooks(workingDir, port);
  } catch (e) {
    log(`[server] Failed to write hooks for ${workingDir}: ${e}`);
  }
}

/**
 * Write per-workspace Copilot CLI hook config in Copilot's flat schema.
 * Keeps each pty-win instance isolated by writing URLs for its own port.
 */
function writeCopilotHooks(workingDir: string, port: number): void {
  try {
    const ghDir = join(workingDir, ".github", "copilot");
    if (!existsSync(ghDir)) mkdirSync(ghDir, { recursive: true });
    const settingsPath = join(ghDir, "settings.local.json");
    let settings: Record<string, unknown> = {};
    if (existsSync(settingsPath)) {
      try { settings = JSON.parse(readFileSync(settingsPath, "utf-8")); } catch { /* ignore */ }
    }
    const base = `http://127.0.0.1:${port}`;
    const isWin = process.platform === "win32";
    const psHook = (endpoint: string) =>
      `$b=[Console]::In.ReadToEnd();try{Invoke-RestMethod -Uri ${base}/api/hook/${endpoint} -Method POST -ContentType application/json -Body $b -TimeoutSec 4 | Out-Null}catch{}`;
    const bashHook = (endpoint: string) =>
      `curl -s -m 4 -X POST -H "Content-Type: application/json" -d @- ${base}/api/hook/${endpoint}`;
    const mkEntry = (endpoint: string, matcher?: string): Record<string, unknown> => {
      const entry: Record<string, unknown> = { type: "command", timeoutSec: 5 };
      if (matcher) entry.matcher = matcher;
      if (isWin) entry.powershell = psHook(endpoint);
      else entry.bash = bashHook(endpoint);
      return entry;
    };
    settings.hooks = {
      SessionStart: [mkEntry("session-start", ".*")],
      Stop: [mkEntry("stop")],
      Notification: [mkEntry("notify", ".*")],
      UserPromptSubmit: [mkEntry("prompt-submit")],
    };
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    clog(`copilot hooks configured for ${workingDir} -> port ${port}`);
  } catch (e) {
    log(`[server] Failed to write copilot hooks for ${workingDir}: ${e}`);
  }
}