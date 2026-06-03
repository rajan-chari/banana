// Static DOM-ID contract test.
//
// Parses public/index.html for all id="x" attributes and parses
// public/app.js (plus lib/*.js) for every byId("y") /
// getElementById("y") call. Asserts the JS-referenced set is a
// subset of (HTML-declared ∪ known-dynamic) IDs.
//
// Why this exists: when someone renames or removes an ID in
// index.html, every byId call against it becomes a load-time throw
// ("Element #foo not found") that the load smoke test surfaces only
// for the FIRST such ID it hits. This test surfaces the entire drift
// surface at once and points at the JS side.
//
// We do NOT assert the inverse (every HTML id is referenced by JS),
// because many IDs are CSS-only (#sidebar-resize-handle, etc).

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public");

// IDs that are created at runtime (createElement + setAttribute, or
// rendered via innerHTML templates) rather than declared in
// index.html. Each entry needs a brief justification so future
// readers can verify or remove.
const DYNAMIC_IDS = new Set<string>([
  // popup.id = "quick-msg-popup" — app.js ~line 1134, ephemeral popup
  // created by sendQuickMessage().
  "quick-msg-popup",
  // The three tracker filter <select>s are rendered by renderTracker
  // into #tracker-content via innerHTML template (app.js ~line 3323).
  "tracker-filter-repo",
  "tracker-filter-sev",
  "tracker-filter-assignee",
]);

function collectIdsFromHtml(html: string): Set<string> {
  const ids = new Set<string>();
  // Match id="..." or id='...' (single line, no embedded quotes)
  const re = /\bid\s*=\s*(?:"([^"]+)"|'([^']+)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    ids.add(m[1] ?? m[2]);
  }
  return ids;
}

// Returns the line number (1-based) for a character offset in `text`.
function lineOf(text: string, offset: number): number {
  let n = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

// Returns the substring from the start of the line containing `offset`
// up to `offset` itself, used to detect whether the match is inside a
// single-line `//` comment.
function lineSliceBefore(text: string, offset: number): string {
  let start = offset;
  while (start > 0 && text.charCodeAt(start - 1) !== 10) start--;
  return text.slice(start, offset);
}

function collectIdRefsFromJs(js: string): Map<string, number[]> {
  // Track each ID -> 1-based line numbers where referenced (helps the
  // failure message point at offenders).
  const refs = new Map<string, number[]>();
  // We only match byId() — the throwing helper. Plain
  // document.getElementById() is the null-returning form used at
  // optional/guarded sites (e.g. #dashboard-stats), so a literal
  // there is intentionally permitted to not exist in HTML.
  const re = /\bbyId\s*\(\s*(?:"([^"\n]+)"|'([^'\n]+)')\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js)) !== null) {
    // Skip matches inside a single-line // comment. We don't strip
    // block comments because their pattern is uncommon for byId
    // references in this codebase; revisit if false positives arise.
    const before = lineSliceBefore(js, m.index);
    if (before.includes("//")) continue;
    const id = m[1] ?? m[2];
    const lineNo = lineOf(js, m.index);
    const arr = refs.get(id) ?? [];
    arr.push(lineNo);
    refs.set(id, arr);
  }
  return refs;
}

function listJsFiles(): string[] {
  const out: string[] = [join(publicDir, "app.js")];
  const libDir = join(publicDir, "lib");
  for (const f of readdirSync(libDir)) {
    if (f.endsWith(".js")) out.push(join(libDir, f));
  }
  return out;
}

describe("DOM-ID contract", () => {
  const html = readFileSync(join(publicDir, "index.html"), "utf8");
  const htmlIds = collectIdsFromHtml(html);
  const allowed = new Set<string>([...htmlIds, ...DYNAMIC_IDS]);

  it("index.html exposes a non-trivial set of IDs", () => {
    // Sanity: regex actually matched something.
    expect(htmlIds.size).toBeGreaterThan(20);
    expect(htmlIds.has("sidebar")).toBe(true);
    expect(htmlIds.has("m-create")).toBe(true);
  });

  for (const file of listJsFiles()) {
    const short = file.slice(publicDir.length + 1).replace(/\\/g, "/");
    it(`every byId/getElementById literal in ${short} resolves to an HTML id`, () => {
      const js = readFileSync(file, "utf8");
      const refs = collectIdRefsFromJs(js);
      const missing: string[] = [];
      for (const [id, lines] of refs) {
        if (!allowed.has(id)) {
          missing.push(`  - "${id}" referenced at line(s) ${lines.join(", ")}`);
        }
      }
      if (missing.length > 0) {
        throw new Error(
          `${missing.length} ID(s) referenced from JS are not declared in public/index.html and are not in the DYNAMIC_IDS allow-list:\n${missing.join("\n")}\n\n` +
            `If the ID was renamed in HTML, update the JS callers. ` +
            `If the ID is created at runtime (createElement + setAttribute, or innerHTML template), ` +
            `add it to DYNAMIC_IDS in this test file with a one-line justification pointing at the creation site.`
        );
      }
    });
  }
});

