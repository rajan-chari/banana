import { createWriteStream, type WriteStream } from "fs";
import { join } from "path";

const logPath = join(process.cwd(), "pty-cld.log");

// Buffered async log writer — replaces appendFileSync
let logStream: WriteStream | null = null;
function getLogStream(): WriteStream {
  if (!logStream) {
    logStream = createWriteStream(logPath, { flags: "a" });
    logStream.on("error", () => {}); // swallow write errors
  }
  return logStream;
}

export function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  getLogStream().write(`[${ts}] ${msg}\n`);
}
