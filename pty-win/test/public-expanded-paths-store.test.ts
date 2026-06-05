// @vitest-environment happy-dom
//
// Tests for public/lib/expanded-paths-store.js — createExpandedPathsStore
// (Phase 8b — third model-layer slice, Set semantics). Unlike the array-
// backed favorites/pinned stores, this one returns booleans for "actually
// changed?" and offers toggle()/replace() for the high-frequency mutation
// patterns of folder navigation.

import { describe, it, expect, vi } from "vitest";
import { createExpandedPathsStore } from "../public/lib/expanded-paths-store.js";

function mkMemStorage(initial: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(initial));
  return {
    map: m,
    storage: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => {
        m.set(k, v);
      },
    },
  };
}

describe("createExpandedPathsStore", () => {
  describe("init", () => {
    it("loads existing set from storage", () => {
      const { storage } = mkMemStorage({ "pty-win-expanded": JSON.stringify(["a", "b"]) });
      const state: any = { expandedPaths: new Set() };
      const store = createExpandedPathsStore({ state, storage });
      store.init();
      expect([...state.expandedPaths].sort()).toEqual(["a", "b"]);
    });

    it("starts empty when no entry in storage", () => {
      const { storage } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const store = createExpandedPathsStore({ state, storage });
      store.init();
      expect(state.expandedPaths.size).toBe(0);
    });

    it("recovers from corrupted storage", () => {
      const { storage } = mkMemStorage({ "pty-win-expanded": "no json{" });
      const state: any = { expandedPaths: new Set() };
      createExpandedPathsStore({ state, storage }).init();
      expect(state.expandedPaths.size).toBe(0);
    });

    it("uses custom key when provided", () => {
      const { storage, map } = mkMemStorage({ "alt-exp": JSON.stringify(["x"]) });
      const state: any = { expandedPaths: new Set() };
      createExpandedPathsStore({ state, storage, key: "alt-exp" }).init();
      expect([...state.expandedPaths]).toEqual(["x"]);
      expect(map.has("pty-win-expanded")).toBe(false);
    });
  });

  describe("add", () => {
    it("adds new path, persists, notifies, returns true", () => {
      const { storage, map } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const onChange = vi.fn();
      const store = createExpandedPathsStore({ state, storage, onChange });
      store.init();
      expect(store.add("p")).toBe(true);
      expect(state.expandedPaths.has("p")).toBe(true);
      expect(JSON.parse(map.get("pty-win-expanded")!)).toEqual(["p"]);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("returns false and skips persist/notify on duplicate", () => {
      const { storage } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const onChange = vi.fn();
      const store = createExpandedPathsStore({ state, storage, onChange });
      store.init();
      store.add("p");
      onChange.mockClear();
      expect(store.add("p")).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("suppresses notify when {notify:false} but still persists", () => {
      const { storage, map } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const onChange = vi.fn();
      const store = createExpandedPathsStore({ state, storage, onChange });
      store.init();
      store.add("p", { notify: false });
      expect(JSON.parse(map.get("pty-win-expanded")!)).toEqual(["p"]);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("removes existing, persists, notifies, returns true", () => {
      const { storage, map } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const onChange = vi.fn();
      const store = createExpandedPathsStore({ state, storage, onChange });
      store.init();
      store.add("a"); store.add("b");
      onChange.mockClear();
      expect(store.remove("a")).toBe(true);
      expect([...state.expandedPaths]).toEqual(["b"]);
      expect(JSON.parse(map.get("pty-win-expanded")!)).toEqual(["b"]);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("returns false and skips persist/notify when missing", () => {
      const { storage } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const onChange = vi.fn();
      const store = createExpandedPathsStore({ state, storage, onChange });
      store.init();
      expect(store.remove("missing")).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("toggle", () => {
    it("adds when missing, returns true (now present)", () => {
      const { storage } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const onChange = vi.fn();
      const store = createExpandedPathsStore({ state, storage, onChange });
      store.init();
      expect(store.toggle("p")).toBe(true);
      expect(state.expandedPaths.has("p")).toBe(true);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("removes when present, returns false (now absent)", () => {
      const { storage } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const onChange = vi.fn();
      const store = createExpandedPathsStore({ state, storage, onChange });
      store.init();
      store.add("p");
      onChange.mockClear();
      expect(store.toggle("p")).toBe(false);
      expect(state.expandedPaths.has("p")).toBe(false);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("persists after toggle and respects {notify:false}", () => {
      const { storage, map } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const onChange = vi.fn();
      const store = createExpandedPathsStore({ state, storage, onChange });
      store.init();
      store.toggle("p", { notify: false });
      expect(JSON.parse(map.get("pty-win-expanded")!)).toEqual(["p"]);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("clear", () => {
    it("clears non-empty set, persists, notifies, returns true", () => {
      const { storage, map } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const onChange = vi.fn();
      const store = createExpandedPathsStore({ state, storage, onChange });
      store.init();
      store.add("a"); store.add("b");
      onChange.mockClear();
      expect(store.clear()).toBe(true);
      expect(state.expandedPaths.size).toBe(0);
      expect(JSON.parse(map.get("pty-win-expanded")!)).toEqual([]);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("returns false and skips persist/notify when already empty", () => {
      const { storage } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const onChange = vi.fn();
      const store = createExpandedPathsStore({ state, storage, onChange });
      store.init();
      expect(store.clear()).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("replace", () => {
    it("replaces the set from an iterable, persists, notifies", () => {
      const { storage, map } = mkMemStorage();
      const state: any = { expandedPaths: new Set(["old"]) };
      const onChange = vi.fn();
      const store = createExpandedPathsStore({ state, storage, onChange });
      store.init();
      store.replace(["a", "b", "c"]);
      expect([...state.expandedPaths].sort()).toEqual(["a", "b", "c"]);
      expect(new Set(JSON.parse(map.get("pty-win-expanded")!))).toEqual(new Set(["a", "b", "c"]));
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("respects {notify:false}", () => {
      const { storage } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const onChange = vi.fn();
      const store = createExpandedPathsStore({ state, storage, onChange });
      store.init();
      store.replace(["x"], { notify: false });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("has / size / raw", () => {
    it("has reflects membership", () => {
      const { storage } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const store = createExpandedPathsStore({ state, storage });
      store.init();
      store.add("p");
      expect(store.has("p")).toBe(true);
      expect(store.has("q")).toBe(false);
    });

    it("size reflects current count", () => {
      const { storage } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const store = createExpandedPathsStore({ state, storage });
      store.init();
      expect(store.size()).toBe(0);
      store.add("a"); store.add("b");
      expect(store.size()).toBe(2);
    });

    it("raw returns the live backing Set", () => {
      const { storage } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const store = createExpandedPathsStore({ state, storage });
      store.init();
      store.add("a");
      expect(store.raw()).toBe(state.expandedPaths);
    });
  });

  describe("onChange semantics", () => {
    it("onChange not called on init", () => {
      const { storage } = mkMemStorage({ "pty-win-expanded": JSON.stringify(["x"]) });
      const state: any = { expandedPaths: new Set() };
      const onChange = vi.fn();
      const store = createExpandedPathsStore({ state, storage, onChange });
      store.init();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("onChange is optional", () => {
      const { storage } = mkMemStorage();
      const state: any = { expandedPaths: new Set() };
      const store = createExpandedPathsStore({ state, storage });
      store.init();
      expect(() => store.add("p")).not.toThrow();
      expect(() => store.toggle("p")).not.toThrow();
      expect(() => store.clear()).not.toThrow();
    });
  });
});
