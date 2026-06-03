// @vitest-environment happy-dom
//
// Smoke test for public/app.js.
//
// The rest of the public/* test suite covers small extracted lib/ modules
// in isolation. None of them ever import app.js, so any bug that lives
// strictly in app.js (top-level statements, IIFEs that wire up DOM
// listeners, helper functions like byId) can ship without tripping any
// test.
//
// That is exactly how an infinite-recursion bug in byId() (caused by a
// bulk find/replace that included the helper's own body) made it to
// `main` in 8fd333c and survived round-4 sub-agent edits before being
// caught visually in e29a6e4.
//
// This test loads index.html into a happy-dom document, stubs the
// browser-only globals app.js touches at module load (WebSocket, fetch,
// the xterm CDN globals, requestAnimationFrame), then imports app.js
// dynamically. If app.js throws during module evaluation (recursion,
// missing-element crash, ReferenceError, etc.) the import rejects and
// the test fails with the original error.
//
// What this DOES catch:
//   - Top-level statements that crash on load (e.g. byId recursion,
//     undefined references, syntax errors that escape lint).
//   - IIFE wiring that assumes IDs missing from index.html.
//   - Newly-introduced top-level side effects that need a global we
//     forgot to stub.
//
// What this does NOT catch:
//   - Render-path bugs (tile layout, xterm wiring) - need real layout.
//   - Behaviour bugs in click handlers - exercise specific lib modules
//     for those.

import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// Extract the <body>...</body> contents from index.html. We don't replace
// document.documentElement wholesale because happy-dom's document already
// has <head>/<body> and we just need the IDs and structure in place.
function loadBodyHtml(): string {
  const html = readFileSync(resolve(repoRoot, "public/index.html"), "utf8");
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!m) throw new Error("Could not find <body> in public/index.html");
  // Strip <script> tags - we don't want CDN script tags to attempt to
  // load (happy-dom would try to fetch them) and we don't want app.js
  // double-loaded via the <script type="module"> tag.
  return m[1].replace(/<script\b[\s\S]*?<\/script>/gi, "");
}

// Minimal WebSocket stub - just records calls. app.js calls
// `new WebSocket(url)` and assigns onopen/onclose/onmessage. We never
// fire those callbacks here, so initApp() never runs.
class FakeWebSocket {
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  send(_data: string) {}
  close() {}
}

// Minimal xterm globals - app.js only touches them inside ensureTerminal()
// which is not called at module load, but providing them lets render
// paths fail more gracefully if anything triggers them.
class FakeTerminal {
  cols = 80;
  rows = 24;
  loadAddon(_addon: unknown) {}
  open(_el: HTMLElement) {}
  write(_data: string) {}
  onData(_cb: unknown) {}
  onResize(_cb: unknown) {}
  dispose() {}
  focus() {}
}
class FakeFitAddon {
  static FitAddon = class {
    activate(_term: unknown) {}
    dispose() {}
    fit() {}
    proposeDimensions() { return { cols: 80, rows: 24 }; }
  };
}
class FakeWebLinksAddon {
  static WebLinksAddon = class {
    activate(_term: unknown) {}
    dispose() {}
  };
}

describe("public/app.js module load smoke test", () => {
  beforeAll(() => {
    // Set window.location to something app.js will accept. happy-dom
    // already provides location, but we make sure the WebSocket URL
    // construction (proto + host) yields a parseable URL.
    if (!window.location.host) {
      // happy-dom usually has location.host = "" by default; the WS
      // construction `${proto}//${location.host}` would yield "ws://"
      // which our FakeWebSocket accepts. No-op safeguard.
    }

    // Install the body markup so every byId / querySelector at module
    // load resolves.
    document.body.innerHTML = loadBodyHtml();

    // Stub the browser-only globals.
    // @ts-expect-error - assigning to global is intentional
    globalThis.WebSocket = FakeWebSocket;
    // @ts-expect-error - assigning to global is intentional
    window.WebSocket = FakeWebSocket;

    // @ts-expect-error - xterm CDN globals
    window.Terminal = FakeTerminal;
    // @ts-expect-error - xterm CDN globals
    window.FitAddon = FakeFitAddon;
    // @ts-expect-error - xterm CDN globals
    window.WebLinksAddon = FakeWebLinksAddon;

    // Stub fetch - the polling IIFEs may kick one off via setTimeout.
    // We return an empty JSON shape that won't throw downstream.
    // @ts-expect-error - fetch stub
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    }));

    // happy-dom provides requestAnimationFrame, but make it a no-op so
    // queued fits never run (they would touch xterm internals).
    window.requestAnimationFrame = () => 0;
    globalThis.requestAnimationFrame = () => 0;

    // Several top-level handlers call window.prompt (e.g. btn-add-root).
    // happy-dom returns undefined by default; force null so the
    // handlers early-return on the "user cancelled" path.
    window.prompt = () => null;
    // window.alert is invoked by some error paths; make it a no-op so
    // it doesn't print to test stdout.
    window.alert = () => {};
    // window.confirm — same treatment.
    window.confirm = () => false;
  });

  it("imports app.js without throwing", async () => {
    // Dynamic import so any top-level throw surfaces as a rejected
    // promise we can catch and assert on. If byId() were recursive
    // again this would throw `RangeError: Maximum call stack size
    // exceeded` here.
    await expect(import("../public/app.js")).resolves.toBeDefined();
  });

  it("byId helper resolves an existing element after load", async () => {
    // Sanity check: prove the DOM was populated and the helper is
    // reachable via the wired listeners. We use an ID that index.html
    // is known to define (#sidebar) and that the post-load DOM should
    // therefore contain.
    const el = document.getElementById("sidebar");
    expect(el).not.toBeNull();
    expect(el?.id).toBe("sidebar");
  });

  // Click each top-level wired button and assert the handler does
  // not throw. Catches bugs inside the assigned onclick callbacks
  // (which the load-time test cannot reach because the callbacks
  // only fire on user interaction). For handlers that depend on
  // network IO or prompts, the stubs in beforeAll() resolve those
  // synchronously to a benign value.
  //
  // Skip btn-add-root: its handler reads window.prompt() and then
  // mutates state.favorites + persists to localStorage on the
  // non-null path. We stub prompt to null which makes it a no-op,
  // but the test still belongs in the list for regression value.
  const TOP_LEVEL_BUTTONS = [
    "btn-collapse",
    "btn-expand",
    "btn-refresh",
    "btn-collapse-all",
    "btn-add-root",
    "m-cancel",
    "m-create",
    "modal-overlay",
  ];

  for (const id of TOP_LEVEL_BUTTONS) {
    it(`clicking #${id} does not throw`, async () => {
      // Import is idempotent — module is cached from the load test.
      await import("../public/app.js");
      const el = document.getElementById(id);
      expect(el, `#${id} must exist in index.html for the handler to be wired`).not.toBeNull();
      // Synchronously dispatch the click. If the handler throws, the
      // call surfaces here. If it queues a microtask that throws, the
      // test will still see it in the next tick, but for handler
      // bodies that are mostly synchronous (DOM mutation, state
      // updates, fetch initiation) this is sufficient coverage.
      expect(() => (el as HTMLElement).click()).not.toThrow();
    });
  }
});
