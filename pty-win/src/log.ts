import { appendFileSync } from "fs";
import { join } from "path";

const logPath = join(process.cwd(), "pty-win.log");

export type LogLevel = "normal" | "verbose" | "trace";

let debugLogEnabled = false;
let debugLogPath = "";
let debugLogLevel: LogLevel = "normal";
const debugLogListeners: Array<(line: string) => void> = [];

export function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  appendFileSync(logPath, `[${ts}] ${msg}\n`);
}

export function clog(msg: string): void {
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  const line = `[pty-win ${ts}] ${msg}`;
  console.log(line);
  log(msg);
  emitDebugLog(line);
}

export function dlog(level: LogLevel, msg: string): void {
  if (level === "verbose" && debugLogLevel !== "verbose" && debugLogLevel !== "trace") return;
  if (level === "trace" && debugLogLevel !== "trace") return;
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  const line = `[${level} ${ts}] ${msg}`;
  if (debugLogEnabled && debugLogPath) {
    try { appendFileSync(debugLogPath, line + "\n"); } catch {}
  }
  emitDebugLog(line);
}

function emitDebugLog(line: string): void {
  for (const fn of debugLogListeners) {
    try { fn(line); } catch {}
  }
}

export function setDebugLog(opts: { enabled?: boolean; path?: string; level?: LogLevel }): void {
  if (opts.enabled !== undefined) debugLogEnabled = opts.enabled;
  if (opts.path !== undefined) debugLogPath = opts.path;
  if (opts.level !== undefined) debugLogLevel = opts.level;
}

export function getDebugLogState() {
  return { enabled: debugLogEnabled, path: debugLogPath, level: debugLogLevel };
}

export function addDebugLogListener(fn: (line: string) => void): () => void {
  debugLogListeners.push(fn);
  return () => {
    const idx = debugLogListeners.indexOf(fn);
    if (idx >= 0) debugLogListeners.splice(idx, 1);
  };
}
