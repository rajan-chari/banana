// @vitest-environment happy-dom
//
// Integration tests for public/app.js — end-to-end scenarios that exercise
// the wiring across stores + DOM + button handlers.
//
// These complement the existing unit suites (which test individual lib/*
// modules in isolation) and the public-app-smoke.test.ts (which only
// verifies app.js loads without throwing). The gap they fill: composition-
// order regressions and store-to-DOM wiring bugs that are invisible until
// app.js is loaded as a whole and a user-triggered handler fires.
//
// Example regressions this would catch:
//   - btn-add-root race that Phase 8b-A fixed (favorites.add fires render
//     before expandedPaths.add runs → new root paints collapsed).
//   - treePort never being rebound after createFolderTree() runs (early
//     calls would stay noop forever instead of dispatching to the tree).
//   - A store wired with the wrong onChange (favorites onChange points at
//     renderQuickAccess instead of renderTree).
//
// Strategy: load app.js ONCE in beforeAll. Each test explicitly resets the
// slice of state it touches at the top — tests cannot rely on describe
// isolation because vitest module-caches the dynamic import (re-importing
// app.js does NOT re-run its top-level side effects).
//
// Stubbing prompt(): the wired handlers reference `prompt(...)` as a free
// global. Assigning `window.prompt = ...` does NOT reliably reach that
// binding in happy-dom — use vi.stubGlobal('prompt', ...) which writes
// through to globalThis.

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function loadBodyHtml(): string {
  const html = readFileSync(resolve(repoRoot, "public/index.html"), "utf8");
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!m) throw new Error("Could not find <body> in public/index.html");
  return m[1].replace(/<script\b[\s\S]*?<\/script>/gi, "");
}

class FakeWebSocket {
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) { this.url = url; }
  send(_data: string) {}
  close() {}
}
class FakeTerminal {
  cols = 80; rows = 24;
  loadAddon(_a: unknown) {} open(_e: HTMLElement) {} write(_d: string) {}
  onData(_c: unknown) {} onResize(_c: unknown) {} dispose() {} focus() {}
}
class FakeFitAddon {
  static FitAddon = class {
    activate(_t: unknown) {} dispose() {} fit() {}
    proposeDimensions() { return { cols: 80, rows: 24 }; }
  };
}
class FakeWebLinksAddon {
  static WebLinksAddon = class { activate(_t: unknown) {} dispose() {} };
}

/**
 * Pull a fresh reference to state.favorites / .pinnedFolders / .expandedPaths
 * after app.js init so tests can mutate them directly.
 */
async function getState() {
  const mod = await import("../public/lib/state.js");
  return mod.state;
}

/**
 * Wipe the slices used by the tested handlers so each test starts from a
 * known shape. Does NOT clear other state (workspaces, sessions, etc.) —
 * those handlers aren't exercised here.
 */
async function resetTreeState() {
  const state = await getState();
  state.favorites.length = 0;
  state.pinnedFolders.length = 0;
  state.expandedPaths.clear();
  localStorage.removeItem("pty-win-favorites");
  localStorage.removeItem("pty-win-pinned");
  localStorage.removeItem("pty-win-expanded");
}

describe("public/app.js integration", () => {
  beforeAll(async () => {
    document.body.innerHTML = loadBodyHtml();
    // @ts-expect-error - global
    globalThis.WebSocket = FakeWebSocket;
    // @ts-expect-error - global
    window.WebSocket = FakeWebSocket;
    // @ts-expect-error - xterm
    window.Terminal = FakeTerminal;
    // @ts-expect-error - xterm
    window.FitAddon = FakeFitAddon;
    // @ts-expect-error - xterm
    window.WebLinksAddon = FakeWebLinksAddon;
    // @ts-expect-error - fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({}), text: async () => "",
    }));
    window.requestAnimationFrame = () => 0;
    globalThis.requestAnimationFrame = () => 0;
    // Default prompt: cancel. Individual tests stub differently with
    // vi.stubGlobal('prompt', ...) and the afterEach restores.
    vi.stubGlobal("prompt", () => null);
    vi.stubGlobal("alert", () => {});
    vi.stubGlobal("confirm", () => false);
    localStorage.clear();
    await import("../public/app.js");
  });

  afterEach(() => {
    // Restore any per-test stubGlobal overrides set with vi.stubGlobal.
    vi.unstubAllGlobals();
    // Re-install the beforeAll defaults so the next test starts in the
    // same "everything cancels" baseline.
    vi.stubGlobal("prompt", () => null);
    vi.stubGlobal("alert", () => {});
    vi.stubGlobal("confirm", () => false);
  });

  describe("store initialization on load", () => {
    it("favorites store seeded its default entry ('C:\\') into state.favorites", async () => {
      const state = await getState();
      // We CANNOT reset before this test — we want to observe the init
      // shape, which is what app.js's `favorites.init()` line produced at
      // load time. Other tests in this file that reset run AFTER this
      // one when using natural file order. If vitest reorders, this
      // assertion still holds in the first run because beforeAll ran
      // exactly once with empty localStorage.
      expect(state.favorites).toContain("C:\\");
    });

    it("pinned-folders store initialized state.pinnedFolders as an array", async () => {
      const state = await getState();
      expect(Array.isArray(state.pinnedFolders)).toBe(true);
    });

    it("expanded-paths store initialized state.expandedPaths as a Set", async () => {
      const state = await getState();
      expect(state.expandedPaths).toBeInstanceOf(Set);
    });
  });

  describe("btn-add-root flow (Phase 8b-A race fix)", () => {
    it("adds a fresh path to BOTH favorites and expandedPaths atomically, then renders", async () => {
      await resetTreeState();
      const state = await getState();
      const fresh = "C:\\integration-test-root";

      vi.stubGlobal("prompt", () => fresh);
      (document.getElementById("btn-add-root") as HTMLButtonElement).click();

      // Phase 8b-A: favorites.add({notify:false}) ran before
      // expandedPaths.add({notify:false}), then renderTree fired once.
      expect(state.favorites).toContain(fresh);
      expect(state.expandedPaths.has(fresh)).toBe(true);

      // Persistence side-effects landed for both stores.
      expect(JSON.parse(localStorage.getItem("pty-win-favorites")!)).toContain(fresh);
      expect(JSON.parse(localStorage.getItem("pty-win-expanded")!)).toContain(fresh);

      // The tree DOM has a root-label for the new path. The render
      // happens synchronously inside the click handler, so by the time
      // .click() returns the DOM is updated.
      const tree = document.getElementById("folder-tree");
      expect(tree).not.toBeNull();
      const labels = tree!.querySelectorAll(".tree-root-label[data-path]");
      const paths = Array.from(labels).map((n) => (n as HTMLElement).dataset["path"] || "");
      expect(paths.some((p) => p.includes("integration-test-root"))).toBe(true);
    });

    it("duplicate path: no state changes, no persistence churn", async () => {
      await resetTreeState();
      const state = await getState();
      const dup = "C:\\dup";

      // Seed dup into favorites so the next add is a duplicate.
      state.favorites.push(dup);
      const favCountBefore = state.favorites.length;
      const expCountBefore = state.expandedPaths.size;

      vi.stubGlobal("prompt", () => dup);
      (document.getElementById("btn-add-root") as HTMLButtonElement).click();

      // favorites.add returned false → handler's outer if-block didn't
      // run → expanded.add never called.
      expect(state.favorites.length).toBe(favCountBefore);
      expect(state.expandedPaths.size).toBe(expCountBefore);
    });

    it("cancelled prompt: no state changes", async () => {
      await resetTreeState();
      const state = await getState();
      const favCountBefore = state.favorites.length;
      const expCountBefore = state.expandedPaths.size;

      vi.stubGlobal("prompt", () => null);
      (document.getElementById("btn-add-root") as HTMLButtonElement).click();

      expect(state.favorites.length).toBe(favCountBefore);
      expect(state.expandedPaths.size).toBe(expCountBefore);
    });
  });

  describe("btn-collapse-all flow", () => {
    it("clears a populated expandedPaths and persists the empty set", async () => {
      await resetTreeState();
      const state = await getState();
      state.expandedPaths.add("C:\\a");
      state.expandedPaths.add("C:\\b");
      expect(state.expandedPaths.size).toBe(2);

      (document.getElementById("btn-collapse-all") as HTMLButtonElement).click();

      expect(state.expandedPaths.size).toBe(0);
      // expanded.clear({notify:false}) returned true → button's `if`
      // ran → renderTree fired. We can't easily assert "renderTree
      // fired" but we can assert clear's side effects landed.
      // NOTE: the store calls persist BEFORE returning, so this works.
      // expandedPaths.size === 0 already proves clear ran; persistence:
      const persisted = localStorage.getItem("pty-win-expanded");
      expect(persisted === null || JSON.parse(persisted!).length === 0).toBe(true);
    });

    it("already-empty set: store returns false, no localStorage write", async () => {
      await resetTreeState();
      const state = await getState();
      expect(state.expandedPaths.size).toBe(0);
      localStorage.removeItem("pty-win-expanded");

      (document.getElementById("btn-collapse-all") as HTMLButtonElement).click();

      // Store's clear short-circuits when size === 0 → no persist, no
      // notify. Storage stays absent.
      expect(state.expandedPaths.size).toBe(0);
      expect(localStorage.getItem("pty-win-expanded")).toBeNull();
    });
  });

  describe("treePort binding (Phase 8b-C structural fix)", () => {
    it("after load, mutating favorites + clicking btn-collapse-all causes folder-tree to repaint", async () => {
      await resetTreeState();
      const state = await getState();
      // Set up a favorite so the tree has something to render.
      state.favorites.push("C:\\port-test");
      // Add to expanded so clear() returns true and renderTree fires.
      state.expandedPaths.add("C:\\port-test");

      (document.getElementById("btn-collapse-all") as HTMLButtonElement).click();

      // If treePort.render were still the noop slot (i.e., the rebind
      // after createFolderTree() was lost in a refactor), no .tree-
      // root-label would exist for "C:\\port-test". Its presence proves
      // treePort.render dispatches to the real folderTree.renderTree.
      const tree = document.getElementById("folder-tree");
      const labels = tree!.querySelectorAll(".tree-root-label[data-path]");
      const paths = Array.from(labels).map((n) => (n as HTMLElement).dataset["path"] || "");
      expect(paths.some((p) => p.includes("port-test"))).toBe(true);
    });
  });
});
