import type { MessagePort } from "worker_threads";

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
  busyTimeoutMs: number;
  mlServiceUrl: string;
  mlDataDir: string;
  mlCollectionMaxSamples: number;
  mlModelPath: string;
  injectionPort: MessagePort;
}

export interface ServerConfig {
  port: number;
  host: string;
  name: string;
  debug: boolean;
  emcomServer: string;
  rootDirs: string[];
  mlModelPath: string;
}

export const DEFAULTS = {
  port: 3600,
  host: "127.0.0.1",
  emcomServer: "http://127.0.0.1:8800",
  pollIntervalMs: 1000,
  quietThresholdMs: 1000,
  injectionCooldownMs: 30000,
  defaultCommand: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
  defaultShell: process.platform === "win32" ? "pwsh" : "bash",
  busyTimeoutMs: 5 * 60 * 1000,
  mlServiceUrl: "http://127.0.0.1:8710",
  mlCollectionMaxSamples: 1000,
};
