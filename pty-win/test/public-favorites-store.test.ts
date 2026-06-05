// @vitest-environment happy-dom
//
// Tests for public/lib/favorites-store.js — createFavoritesStore factory
// (Phase 8a — model-layer demo slice). Verifies init/persist/add/remove
// semantics and onChange notification.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFavoritesStore } from "../public/lib/favorites-store.js";

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

describe("createFavoritesStore", () => {
  beforeEach(() => {
    // Each test brings its own in-mem storage; localStorage not used.
  });

  describe("init", () => {
    it("loads existing favorites from storage into state.favorites", () => {
      const { storage } = mkMemStorage({ "pty-win-favorites": JSON.stringify(["a", "b"]) });
      const state: any = { favorites: [] };
      const store = createFavoritesStore({ state, storage });
      store.init();
      expect(state.favorites).toEqual(["a", "b"]);
    });

    it("falls back to defaultEntry when storage is empty", () => {
      const { storage } = mkMemStorage();
      const state: any = { favorites: [] };
      const store = createFavoritesStore({ state, storage, defaultEntry: "C:\\" });
      store.init();
      expect(state.favorites).toEqual(["C:\\"]);
    });

    it("persists the default entry to storage on first init", () => {
      const { storage, map } = mkMemStorage();
      const state: any = { favorites: [] };
      createFavoritesStore({ state, storage, defaultEntry: "C:\\" }).init();
      expect(JSON.parse(map.get("pty-win-favorites")!)).toEqual(["C:\\"]);
    });

    it("does NOT insert defaultEntry when defaultEntry is null", () => {
      const { storage } = mkMemStorage();
      const state: any = { favorites: [] };
      const store = createFavoritesStore({ state, storage, defaultEntry: null as any });
      store.init();
      expect(state.favorites).toEqual([]);
    });

    it("recovers from corrupted storage by treating it as empty", () => {
      const { storage } = mkMemStorage({ "pty-win-favorites": "not json{" });
      const state: any = { favorites: [] };
      const store = createFavoritesStore({ state, storage, defaultEntry: "C:\\" });
      store.init();
      expect(state.favorites).toEqual(["C:\\"]);
    });

    it("uses custom storage key when provided", () => {
      const { storage, map } = mkMemStorage({ "custom-key": JSON.stringify(["x"]) });
      const state: any = { favorites: [] };
      createFavoritesStore({ state, storage, key: "custom-key" }).init();
      expect(state.favorites).toEqual(["x"]);
      expect(map.has("pty-win-favorites")).toBe(false);
    });
  });

  describe("add", () => {
    it("appends path to state.favorites, persists, fires onChange, returns true", () => {
      const { storage, map } = mkMemStorage();
      const state: any = { favorites: [] };
      const onChange = vi.fn();
      const store = createFavoritesStore({ state, storage, defaultEntry: null as any, onChange });
      store.init();
      expect(store.add("p")).toBe(true);
      expect(state.favorites).toEqual(["p"]);
      expect(JSON.parse(map.get("pty-win-favorites")!)).toEqual(["p"]);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("returns false and does NOT persist or fire onChange when path already present", () => {
      const { storage } = mkMemStorage();
      const state: any = { favorites: [] };
      const onChange = vi.fn();
      const store = createFavoritesStore({ state, storage, defaultEntry: null as any, onChange });
      store.init();
      store.add("p");
      onChange.mockClear();
      expect(store.add("p")).toBe(false);
      expect(state.favorites).toEqual(["p"]);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("suppresses onChange when {notify:false} is passed", () => {
      const { storage, map } = mkMemStorage();
      const state: any = { favorites: [] };
      const onChange = vi.fn();
      const store = createFavoritesStore({ state, storage, defaultEntry: null as any, onChange });
      store.init();
      expect(store.add("p", { notify: false })).toBe(true);
      expect(state.favorites).toEqual(["p"]);
      expect(JSON.parse(map.get("pty-win-favorites")!)).toEqual(["p"]);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("removes existing path, persists, fires onChange, returns true", () => {
      const { storage, map } = mkMemStorage();
      const state: any = { favorites: [] };
      const onChange = vi.fn();
      const store = createFavoritesStore({ state, storage, defaultEntry: null as any, onChange });
      store.init();
      store.add("a");
      store.add("b");
      onChange.mockClear();
      expect(store.remove("a")).toBe(true);
      expect(state.favorites).toEqual(["b"]);
      expect(JSON.parse(map.get("pty-win-favorites")!)).toEqual(["b"]);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("returns false and does NOT persist/notify when path not present", () => {
      const { storage } = mkMemStorage();
      const state: any = { favorites: [] };
      const onChange = vi.fn();
      const store = createFavoritesStore({ state, storage, defaultEntry: null as any, onChange });
      store.init();
      expect(store.remove("missing")).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("has / list / count", () => {
    it("has returns true for present path and false otherwise", () => {
      const { storage } = mkMemStorage();
      const state: any = { favorites: [] };
      const store = createFavoritesStore({ state, storage, defaultEntry: null as any });
      store.init();
      store.add("p");
      expect(store.has("p")).toBe(true);
      expect(store.has("q")).toBe(false);
    });

    it("list returns the backing array (live view)", () => {
      const { storage } = mkMemStorage();
      const state: any = { favorites: [] };
      const store = createFavoritesStore({ state, storage, defaultEntry: null as any });
      store.init();
      store.add("a");
      expect(store.list()).toBe(state.favorites);
      expect(store.list()).toEqual(["a"]);
    });

    it("count reflects current size", () => {
      const { storage } = mkMemStorage();
      const state: any = { favorites: [] };
      const store = createFavoritesStore({ state, storage, defaultEntry: null as any });
      store.init();
      expect(store.count()).toBe(0);
      store.add("a");
      store.add("b");
      expect(store.count()).toBe(2);
      store.remove("a");
      expect(store.count()).toBe(1);
    });
  });

  describe("onChange semantics", () => {
    it("onChange not called on init even when defaultEntry is seeded", () => {
      const { storage } = mkMemStorage();
      const state: any = { favorites: [] };
      const onChange = vi.fn();
      const store = createFavoritesStore({ state, storage, defaultEntry: "C:\\", onChange });
      store.init();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("onChange is optional (no throw when omitted)", () => {
      const { storage } = mkMemStorage();
      const state: any = { favorites: [] };
      const store = createFavoritesStore({ state, storage, defaultEntry: null as any });
      store.init();
      expect(() => store.add("p")).not.toThrow();
      expect(() => store.remove("p")).not.toThrow();
    });
  });
});
