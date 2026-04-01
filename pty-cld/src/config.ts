import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface Identity {
  name: string;
  server: string;
  registered_at: string;
}

export interface SessionConfig {
  name: string;
  emcomIdentity: string;
  emcomServer: string;
  workingDir: string;
  claudeArgs: string[];
  pollIntervalMs: number;
  quietThresholdMs: number;
  injectionCooldownMs: number;
}

export interface AppConfig {
  mode: "cli" | "serve";
  webPort: number;
  controlPort: number;
  sessions: SessionConfig[];
}

export interface CliOverrides {
  pollIntervalMs?: number;
  cooldownMs?: number;
  controlPort?: number;
}

const DEFAULTS = {
  pollIntervalMs: 5000,
  quietThresholdMs: 3000,
  injectionCooldownMs: 30000,
  webPort: 3500,
  controlPort: 3501,
};

export function readIdentity(dir: string): Identity | null {
  const path = join(dir, "identity.json");
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (typeof raw.name !== "string" || !raw.name.trim()) {
      console.error(`identity.json: "name" must be a non-empty string`);
      return null;
    }
    if (typeof raw.server !== "string" || !raw.server.trim()) {
      console.error(`identity.json: "server" must be a non-empty string`);
      return null;
    }
    return raw as Identity;
  } catch (err) {
    console.error(`identity.json: failed to parse — ${err}`);
    return null;
  }
}

export function buildCliConfig(cwd: string, claudeArgs: string[], overrides?: CliOverrides): AppConfig {
  const identity = readIdentity(cwd);
  if (!identity) {
    console.warn(`No identity.json in ${cwd} — starting without emcom (will watch for identity.json)`);
  }

  return {
    mode: "cli",
    webPort: DEFAULTS.webPort,
    controlPort: overrides?.controlPort ?? DEFAULTS.controlPort,
    sessions: [
      {
        name: identity?.name ?? "pty-cld",
        emcomIdentity: identity?.name ?? "",
        emcomServer: identity?.server ?? "",
        workingDir: cwd,
        claudeArgs,
        pollIntervalMs: overrides?.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
        quietThresholdMs: DEFAULTS.quietThresholdMs,
        injectionCooldownMs: overrides?.cooldownMs ?? DEFAULTS.injectionCooldownMs,
      },
    ],
  };
}
