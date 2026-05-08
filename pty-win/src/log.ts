import { createWriteStream, existsSync, type WriteStream } from "fs";
import { join } from "path";

// Log file path is keyed off port (set by server.ts at startup) so multiple
// pty-win instances on different ports don't interleave writes — and the
// filename is stable across restarts of the same port (PID changed every
// time, which made tailing across restarts annoying).
//
// If the file already exists at startup, append a numeric suffix and
// increment until we find a free name. This preserves prior logs from
// previous runs of the same port for forensic review.
//
// Falls back to a PID-based name if setLogPort() hasn't been called by
// the time the first write happens (shouldn't happen in normal flow).
let resolvedLogPath: string | null = null;

function pickLogPath(port: number): string {
  const base = `pty-win.${port}`;
  let candidate = join(process.cwd(), `${base}.log`);
  let n = 1;
  while (existsSync(candidate)) {
    candidate = join(process.cwd(), `${base}.${n}.log`);
    n++;
  }
  return candidate;
}

export function setLogPort(port: number): void {
  if (resolvedLogPath) return; // already set; first call wins
  resolvedLogPath = pickLogPath(port);
}

function getLogPath(): string {
  if (!resolvedLogPath) {
    resolvedLogPath = join(process.cwd(), `pty-win.${process.pid}.log`);
  }
  return resolvedLogPath;
}

export function getLogPathInfo(): string {
  return getLogPath();
}

export type LogLevel = "normal" | "verbose" | "trace";

let debugLogEnabled = false;
let debugLogPath = "";
let debugLogLevel: LogLevel = "normal";
const debugLogListeners: Array<(line: string) => void> = [];

// Buffered async log writer — replaces appendFileSync
let logStream: WriteStream | null = null;
function getLogStream(): WriteStream {
  if (!logStream) {
    logStream = createWriteStream(getLogPath(), { flags: "a" });
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
