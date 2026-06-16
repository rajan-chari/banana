import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { clog, log } from "../log.js";

type Settings = Record<string, unknown>;
type HookEntry = Record<string, unknown>;

function readSettings(settingsPath: string): Settings {
  if (!existsSync(settingsPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf-8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Settings
      : {};
  } catch {
    return {};
  }
}

function hasEndpoint(value: unknown, endpoint: string): boolean {
  if (typeof value === "string") return value.includes(endpoint);
  if (Array.isArray(value)) return value.some((item) => hasEndpoint(item, endpoint));
  if (value && typeof value === "object") return Object.values(value).some((item) => hasEndpoint(item, endpoint));
  return false;
}

function mergeOwnedHookEntries(
  settings: Settings,
  entriesByEvent: Record<string, { endpoint: string; entry: HookEntry }>,
): Settings {
  const existingHooks = settings["hooks"] && typeof settings["hooks"] === "object" && !Array.isArray(settings["hooks"])
    ? settings["hooks"] as Record<string, unknown>
    : {};
  const nextHooks: Record<string, unknown> = { ...existingHooks };

  for (const [event, { endpoint, entry }] of Object.entries(entriesByEvent)) {
    const entries = Array.isArray(existingHooks[event]) ? existingHooks[event] as unknown[] : [];
    nextHooks[event] = [
      ...entries.filter((existing) => !hasEndpoint(existing, endpoint)),
      entry,
    ];
  }

  return { ...settings, hooks: nextHooks };
}

/** Write Claude and Copilot hook settings into a workspace. */
export function writeSessionHooks(workingDir: string, port: number): void {
  try {
    const claudeDir = join(workingDir, ".claude");
    if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, "settings.local.json");
    let settings = readSettings(settingsPath);
    const base = `http://127.0.0.1:${port}`;
    const sessionStartCmd = `curl -s -m 4 -X POST -H "Content-Type: application/json" -d @- ${base}/api/hook/session-start`;
    settings = mergeOwnedHookEntries(settings, {
      SessionStart: {
        endpoint: "/api/hook/session-start",
        entry: { matcher: ".*", hooks: [{ type: "command", command: sessionStartCmd, timeout: 5 }] },
      },
      Stop: {
        endpoint: "/api/hook/stop",
        entry: { matcher: "", hooks: [{ type: "http", url: `${base}/api/hook/stop`, timeout: 2 }] },
      },
      Notification: {
        endpoint: "/api/hook/notify",
        entry: { matcher: ".*", hooks: [{ type: "http", url: `${base}/api/hook/notify`, timeout: 2 }] },
      },
      UserPromptSubmit: {
        endpoint: "/api/hook/prompt-submit",
        entry: { matcher: "", hooks: [{ type: "http", url: `${base}/api/hook/prompt-submit`, timeout: 2 }] },
      },
    });
    settings["messageIdleNotifThresholdMs"] = 5000;
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
    const settings = readSettings(settingsPath);
    const base = `http://127.0.0.1:${port}`;
    const isWin = process.platform === "win32";
    const psHook = (endpoint: string) =>
      `$b=[Console]::In.ReadToEnd();try{Invoke-RestMethod -Uri ${base}/api/hook/${endpoint} -Method POST -ContentType application/json -Body $b -TimeoutSec 4 | Out-Null}catch{}`;
    const bashHook = (endpoint: string) =>
      `curl -s -m 4 -X POST -H "Content-Type: application/json" -d @- ${base}/api/hook/${endpoint}`;
    const mkEntry = (endpoint: string, matcher?: string): Record<string, unknown> => {
      const entry: Record<string, unknown> = { type: "command", timeoutSec: 5 };
      if (matcher) entry["matcher"] = matcher;
      if (isWin) entry["powershell"] = psHook(endpoint);
      else entry["bash"] = bashHook(endpoint);
      return entry;
    };
    const nextSettings = mergeOwnedHookEntries(settings, {
      SessionStart: { endpoint: "/api/hook/session-start", entry: mkEntry("session-start", ".*") },
      Stop: { endpoint: "/api/hook/stop", entry: mkEntry("stop") },
      Notification: { endpoint: "/api/hook/notify", entry: mkEntry("notify", ".*") },
      UserPromptSubmit: { endpoint: "/api/hook/prompt-submit", entry: mkEntry("prompt-submit") },
    });
    writeFileSync(settingsPath, JSON.stringify(nextSettings, null, 2));
    clog(`copilot hooks configured for ${workingDir} -> port ${port}`);
  } catch (e) {
    log(`[server] Failed to write copilot hooks for ${workingDir}: ${e}`);
  }
}