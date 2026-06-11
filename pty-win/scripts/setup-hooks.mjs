#!/usr/bin/env node
// Prepare-script helper: point the enclosing git repo's core.hooksPath
// at the committed .githooks/ directory so the pre-push hook activates
// automatically on `npm install`.
//
// Best-effort: silently no-ops when there is no enclosing git checkout
// (e.g., when this package is installed from a tarball, or in CI before
// a checkout). Idempotent — re-running just rewrites the same value.

import { execFileSync } from "child_process";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

try {
  execFileSync("git", ["-C", repoRoot, "rev-parse", "--git-dir"], { stdio: "ignore" });
} catch {
  // Not a git checkout — nothing to do.
  process.exit(0);
}

try {
  execFileSync("git", ["-C", repoRoot, "config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  console.log("[setup-hooks] core.hooksPath -> .githooks");
} catch (err) {
  console.warn("[setup-hooks] failed to set core.hooksPath:", err.message);
}
