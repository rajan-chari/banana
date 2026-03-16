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
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function buildCliConfig(cwd: string, claudeArgs: string[]): AppConfig {
  const identity = readIdentity(cwd);
  if (!identity) {
    console.error(`No identity.json found in ${cwd}. Register with emcom first.`);
    process.exit(1);
  }

  return {
    mode: "cli",
    webPort: DEFAULTS.webPort,
    controlPort: DEFAULTS.controlPort,
    sessions: [
      {
        name: identity.name,
        emcomIdentity: identity.name,
        emcomServer: identity.server,
        workingDir: cwd,
        claudeArgs,
        pollIntervalMs: DEFAULTS.pollIntervalMs,
        quietThresholdMs: DEFAULTS.quietThresholdMs,
        injectionCooldownMs: DEFAULTS.injectionCooldownMs,
      },
    ],
  };
}
