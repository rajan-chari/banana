import { execFile } from "child_process";
import { PtySession } from "../session.js";

/** Detect git repo root for a directory. Returns normalized path or null. */
export function detectRepoRoot(dir: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", ["rev-parse", "--show-toplevel"], { cwd: dir, timeout: 5000 }, (err, stdout) => {
      if (err || !stdout.trim()) return resolve(null);
      resolve(stdout.trim().replace(/\\/g, "/").toLowerCase());
    });
  });
}

/** Count how many existing live sessions share the same repo root. */
export function countRepoSiblings(
  repoRoot: string,
  sessionRepoRoots: Map<string, string>,
  sessions: Map<string, PtySession>,
): number {
  let count = 0;
  for (const [name, root] of sessionRepoRoots) {
    const session = sessions.get(name);
    if (root === repoRoot && session && session.getInfo().status !== "dead") {
      count++;
    }
  }
  return count;
}
