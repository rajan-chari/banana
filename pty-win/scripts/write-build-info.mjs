#!/usr/bin/env node
// Postbuild helper: write dist/build-info.json containing the current
// version + git commit so the released zip can report a meaningful
// commit at runtime (the released zip ships no .git directory, so
// `git rev-parse` in server.ts/index.ts would otherwise return
// "unknown").
//
// Reads version from ./package.json and asks git for the short HEAD
// commit. Both are best-effort; a missing git checkout yields commit
// "unknown" but version still ships.

import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));

let commit = "unknown";
try {
  commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf-8" }).trim();
} catch {
  // No git available or not a git checkout -- leave as "unknown".
}

const distDir = join(root, "dist");
if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

const out = {
  version: pkg.version,
  commit,
  builtAt: new Date().toISOString(),
};
writeFileSync(join(distDir, "build-info.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`build-info: v${out.version} commit=${out.commit}`);
