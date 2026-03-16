/**
 * `pty-cld setup`    — install global Notification hook into ~/.claude/settings.json
 * `pty-cld setup --remove` — remove it
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Resolve the absolute path to bin/idle-hook.sh from the package root. */
function getHookScriptPath(): string {
  // __dirname is dist/ at runtime; package root is one level up
  const packageRoot = resolve(__dirname, "..");
  const hookPath = join(packageRoot, "bin", "idle-hook.sh");
  // Normalize to forward slashes for bash
  return hookPath.replace(/\\/g, "/");
}

/** Build the hook command string for a given idle-hook.sh path. */
function buildHookCommand(hookPath: string): string {
  return `bash ${hookPath}`;
}

interface HookEntry {
  type: string;
  command: string;
  async?: boolean;
}

interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

interface ClaudeSettings {
  hooks?: Record<string, HookMatcher[]>;
  [key: string]: unknown;
}

function getSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

function readSettings(): ClaudeSettings {
  const path = getSettingsPath();
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeSettings(settings: ClaudeSettings): void {
  const path = getSettingsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

/** Check if a hook command is a pty-cld idle hook (by looking for idle-hook.sh). */
function isPtyCldHook(command: string): boolean {
  return command.includes("idle-hook.sh");
}

export function runSetup(args: string[]): void {
  const remove = args.includes("--remove");
  const hookPath = getHookScriptPath();
  const hookCommand = buildHookCommand(hookPath);
  const settingsPath = getSettingsPath();

  if (!existsSync(join(resolve(__dirname, ".."), "bin", "idle-hook.sh"))) {
    console.error(`Error: bin/idle-hook.sh not found at expected location.`);
    console.error(`Expected: ${hookPath}`);
    process.exit(1);
  }

  const settings = readSettings();

  if (remove) {
    removeHook(settings);
    writeSettings(settings);
    console.log(`Removed pty-cld hook from ${settingsPath}`);
    return;
  }

  installHook(settings, hookCommand);
  writeSettings(settings);
  console.log(`Installed pty-cld hook in ${settingsPath}`);
  console.log(`  Command: ${hookCommand}`);
}

function installHook(settings: ClaudeSettings, hookCommand: string): void {
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.Notification) settings.hooks.Notification = [];

  const matchers = settings.hooks.Notification;

  // Look for an existing matcher that contains a pty-cld hook
  for (const matcher of matchers) {
    const existingIdx = matcher.hooks.findIndex((h) => isPtyCldHook(h.command));
    if (existingIdx !== -1) {
      // Update in place
      matcher.hooks[existingIdx] = { type: "command", command: hookCommand, async: true };
      return;
    }
  }

  // No existing pty-cld hook found — add a new matcher entry
  matchers.push({
    matcher: "",
    hooks: [{ type: "command", command: hookCommand, async: true }],
  });
}

function removeHook(settings: ClaudeSettings): void {
  if (!settings.hooks?.Notification) return;

  const matchers = settings.hooks.Notification;

  for (let i = matchers.length - 1; i >= 0; i--) {
    matchers[i].hooks = matchers[i].hooks.filter((h) => !isPtyCldHook(h.command));
    // Remove the matcher entirely if it has no hooks left
    if (matchers[i].hooks.length === 0) {
      matchers.splice(i, 1);
    }
  }

  // Clean up empty structures
  if (matchers.length === 0) delete settings.hooks.Notification;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
}
