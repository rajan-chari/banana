import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, it } from "vitest";
import { isExistingDirectory } from "../src/server/routes/sessions/session-management.js";

describe("isExistingDirectory", () => {
  it("returns true for an existing directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pty-win-session-dir-"));
    try {
      await expect(isExistingDirectory(dir)).resolves.toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns false for a missing path or regular file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pty-win-session-dir-"));
    try {
      const file = join(dir, "not-a-dir.txt");
      await writeFile(file, "x");
      await expect(isExistingDirectory(join(dir, "missing"))).resolves.toBe(false);
      await expect(isExistingDirectory(file)).resolves.toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
