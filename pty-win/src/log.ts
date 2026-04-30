import { createWriteStream, type WriteStream } from "fs";
import { join } from "path";

// Include PID so multiple pty-win instances sharing a cwd (e.g. 3600 + 3601
// both started from the repo root) don't interleave writes to the same file.
// The interleave produced visibly corrupted log lines with mixed prefixes,
// e.g. "[banana] [l05] [stats] ..." from two writers racing on one fd.
const logPath = join(process.cwd(), `pty-win.${process.pid}.log`);

export type LogLevel = "normal" | "verbose" | "trace";

let debugLogEnabled = false;
let debugLogPath = "";
let debugLogLevel: LogLevel = "normal";
const debugLogListeners: Array<(line: string) => void> = [];

// Buffered async log writer — replaces appendFileSync
let logStream: WriteStream | null = null;
function getLogStream(): WriteStream {
  if (!logStream) {
    logStream = createWriteStream(logPath, { flags: "a" });
    logStream.on("error", () => {}); // swallow write errors
  }
  return logStream;
}

// Buffered console output — batches writes to stdout
let consoleBuf = "";
let consoleTimer: ReturnType<typeof setTimeout> | null = null;
const CONSOLE_FLUSH_MS = 50;

function flushConsole(): void {
  consoleTimer = null;
  if (consoleBuf) {
    process.stdout.write(consoleBuf);
    consoleBuf = "";
  }
}

export function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  getLogStream().write(`[${ts}] ${msg}\n`);
}

export function clog(msg: string): void {
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  const line = `[pty-win ${ts}] ${msg}`;
  // Buffered console write — batches to 50ms
  consoleBuf += line + "\n";
  if (!consoleTimer) consoleTimer = setTimeout(flushConsole, CONSOLE_FLUSH_MS);
  log(msg);
  emitDebugLog(line);
}

export function dlog(level: LogLevel, msg: string): void {
  if (level === "verbose" && debugLogLevel !== "verbose" && debugLogLevel !== "trace") return;
  if (level === "trace" && debugLogLevel !== "trace") return;
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  const line = `[${level} ${ts}] ${msg}`;
  if (debugLogEnabled && debugLogPath) {
    getLogStream().write(`[debug] ${line}\n`);
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
