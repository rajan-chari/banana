import { appendFileSync } from "fs";
import { join } from "path";

const logPath = join(process.cwd(), "pty-cld.log");

export function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  appendFileSync(logPath, `[${ts}] ${msg}\n`);
}
