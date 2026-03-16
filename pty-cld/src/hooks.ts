import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { log } from "./log.js";

const PORT_FILE = ".pty-cld-port";

export function writePortFile(workingDir: string, port: number, sessionName: string): void {
  const path = join(workingDir, PORT_FILE);
  writeFileSync(path, String(port));
  log(`[${sessionName}] Wrote ${PORT_FILE} -> port ${port}`);
}

export function removePortFile(workingDir: string, sessionName: string): void {
  const path = join(workingDir, PORT_FILE);
  try {
    if (existsSync(path)) {
      unlinkSync(path);
      log(`[${sessionName}] Removed ${PORT_FILE}`);
    }
  } catch {
    // best effort
  }
}
