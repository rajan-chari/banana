export interface SessionConfig {
  name: string;
  command: string;
  args: string[];
  workingDir: string;
  cols: number;
  rows: number;
  emcomIdentity?: string;
  emcomServer?: string;
  pollIntervalMs: number;
  quietThresholdMs: number;
  injectionCooldownMs: number;
  checkpointOffsetMs: number;
}

export interface ServerConfig {
  port: number;
  emcomServer: string;
  rootDirs: string[];
}

export const DEFAULTS = {
  port: 3600,
  emcomServer: "http://127.0.0.1:8800",
  pollIntervalMs: 1000,
  quietThresholdMs: 1000,
  injectionCooldownMs: 30000,
  defaultCommand: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
};
