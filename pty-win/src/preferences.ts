import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import { clog } from "./log.js";

// Shape mirrors fellow-agents/src/preferences.ts (forge's v0.0.22).
// When forge adds a key, mirror here in the same release window.
export interface PreferencesFile {
  schema: 1;
  cliPreference?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type UpdatedBy =
  | "first-run-prompt"
  | "config-set"
  | "manual-edit"
  | "pty-win-play"
  | "pty-win-settings";

const KNOWN_CLIS = ["claude", "copilot", "pi"];

function prefsPath(): string {
  return join(homedir(), ".fellow-agents", "preferences.json");
}

export function readPreferences(): PreferencesFile | null {
  const path = prefsPath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (raw && raw.schema === 1) return raw as PreferencesFile;
    clog(`[preferences] file present but schema mismatch (got ${raw?.schema}); ignoring`);
    return null;
  } catch (e) {
    clog(`[preferences] read failed: ${e}`);
    return null;
  }
}

/** Atomic write via temp + rename (same directory, same volume). */
export function writePreferences(next: PreferencesFile): void {
  const path = prefsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(next, null, 2));
  renameSync(tmp, path);
}

/** Probe PATH for the first installed CLI of claude/copilot/pi.
 *  Used when preferences.json is absent or has no cliPreference. */
export function firstFoundCli(): string | null {
  const lookup = process.platform === "win32" ? "where" : "which";
  for (const cli of KNOWN_CLIS) {
    try {
      execFileSync(lookup, [cli], { stdio: "ignore", timeout: 2000 });
      return cli;
    } catch {
      // not found, try next
    }
  }
  return null;
}

/** Resolve the effective CLI preference:
 *   1. preferences.json cliPreference if set
 *   2. first found via where.exe / which
 *   3. null (caller picks hard-coded default)
 *  Also returns provenance for the frontend to know whether to lazy-init. */
export function resolveCliPreference(): { cliPreference: string | null; source: "preferences" | "first-found" | "none" } {
  const prefs = readPreferences();
  if (prefs?.cliPreference) {
    return { cliPreference: prefs.cliPreference, source: "preferences" };
  }
  const found = firstFoundCli();
  if (found) {
    return { cliPreference: found, source: "first-found" };
  }
  return { cliPreference: null, source: "none" };
}
