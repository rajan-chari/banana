// @vitest-environment happy-dom
//
// Tests for public/lib/pinned-folders-store.js — createPinnedFoldersStore
// (Phase 8b — second model-layer slice, mirrors favorites-store). Verifies
// init/persist/add/remove semantics, onChange notification, and the
// notify-suppression opt-out used for batching with companion stores.

import { describe, it, expect, vi } from "vitest";
import { createPinnedFoldersStore } from "../public/lib/pinned-folders-store.js";

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

describe("createPinnedFoldersStore", () => {
  describe("init", () => {
    it("loads existing pinned folders into state.pinnedFolders", () => {
      const { storage } = mkMemStorage({ "pty-win-pinned": JSON.stringify(["a", "b"]) });
      const state: any = { pinnedFolders: [] };
      const store = createPinnedFoldersStore({ state, storage });
      store.init();
      expect(state.pinnedFolders).toEqual(["a", "b"]);
    });

    it("starts empty when storage has no entry (no default seed)", () => {
      const { storage } = mkMemStorage();
      const state: any = { pinnedFolders: [] };
      const store = createPinnedFoldersStore({ state, storage });
      store.init();
      expect(state.pinnedFolders).toEqual([]);
    });

    it("recovers from corrupted storage by treating as empty", () => {
      const { storage } = mkMemStorage({ "pty-win-pinned": "broken{" });
      const state: any = { pinnedFolders: [] };
      const store = createPinnedFoldersStore({ state, storage });
      store.init();
      expect(state.pinnedFolders).toEqual([]);
    });

    it("uses custom storage key when provided", () => {
      const { storage, map } = mkMemStorage({ "alt-pins": JSON.stringify(["x"]) });
      const state: any = { pinnedFolders: [] };
      createPinnedFoldersStore({ state, storage, key: "alt-pins" }).init();
      expect(state.pinnedFolders).toEqual(["x"]);
      expect(map.has("pty-win-pinned")).toBe(false);
    });
  });

  describe("add", () => {
    it("appends, persists, notifies, returns true", () => {
      const { storage, map } = mkMemStorage();
      const state: any = { pinnedFolders: [] };
      const onChange = vi.fn();
      const store = createPinnedFoldersStore({ state, storage, onChange });
      store.init();
      expect(store.add("p")).toBe(true);
      expect(state.pinnedFolders).toEqual(["p"]);
      expect(JSON.parse(map.get("pty-win-pinned")!)).toEqual(["p"]);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("returns false and skips persist/notify on duplicate", () => {
      const { storage } = mkMemStorage();
      const state: any = { pinnedFolders: [] };
      const onChange = vi.fn();
      const store = createPinnedFoldersStore({ state, storage, onChange });
      store.init();
      store.add("p");
      onChange.mockClear();
      expect(store.add("p")).toBe(false);
      expect(state.pinnedFolders).toEqual(["p"]);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("suppresses onChange when {notify:false} but still persists", () => {
      const { storage, map } = mkMemStorage();
      const state: any = { pinnedFolders: [] };
      const onChange = vi.fn();
      const store = createPinnedFoldersStore({ state, storage, onChange });
      store.init();
      expect(store.add("p", { notify: false })).toBe(true);
      expect(state.pinnedFolders).toEqual(["p"]);
      expect(JSON.parse(map.get("pty-win-pinned")!)).toEqual(["p"]);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("removes existing, persists, notifies, returns true", () => {
      const { storage, map } = mkMemStorage();
      const state: any = { pinnedFolders: [] };
      const onChange = vi.fn();
      const store = createPinnedFoldersStore({ state, storage, onChange });
      store.init();
      store.add("a"); store.add("b");
      onChange.mockClear();
      expect(store.remove("a")).toBe(true);
      expect(state.pinnedFolders).toEqual(["b"]);
      expect(JSON.parse(map.get("pty-win-pinned")!)).toEqual(["b"]);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("returns false and skips persist/notify when missing", () => {
      const { storage } = mkMemStorage();
      const state: any = { pinnedFolders: [] };
      const onChange = vi.fn();
      const store = createPinnedFoldersStore({ state, storage, onChange });
      store.init();
      expect(store.remove("missing")).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("suppresses onChange when {notify:false}", () => {
      const { storage } = mkMemStorage();
      const state: any = { pinnedFolders: [] };
      const onChange = vi.fn();
      const store = createPinnedFoldersStore({ state, storage, onChange });
      store.init();
      store.add("a");
      onChange.mockClear();
      expect(store.remove("a", { notify: false })).toBe(true);
      expect(state.pinnedFolders).toEqual([]);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("has / list / count", () => {
    it("has reflects presence", () => {
      const { storage } = mkMemStorage();
      const state: any = { pinnedFolders: [] };
      const store = createPinnedFoldersStore({ state, storage });
      store.init();
      store.add("p");
      expect(store.has("p")).toBe(true);
      expect(store.has("q")).toBe(false);
    });

    it("list returns the live backing array", () => {
      const { storage } = mkMemStorage();
      const state: any = { pinnedFolders: [] };
      const store = createPinnedFoldersStore({ state, storage });
      store.init();
      store.add("a");
      expect(store.list()).toBe(state.pinnedFolders);
      expect(store.list()).toEqual(["a"]);
    });

    it("count reflects current size", () => {
      const { storage } = mkMemStorage();
      const state: any = { pinnedFolders: [] };
      const store = createPinnedFoldersStore({ state, storage });
      store.init();
      expect(store.count()).toBe(0);
      store.add("a"); store.add("b");
      expect(store.count()).toBe(2);
      store.remove("a");
      expect(store.count()).toBe(1);
    });
  });

  describe("onChange semantics", () => {
    it("onChange not called on init", () => {
      const { storage } = mkMemStorage({ "pty-win-pinned": JSON.stringify(["x"]) });
      const state: any = { pinnedFolders: [] };
      const onChange = vi.fn();
      const store = createPinnedFoldersStore({ state, storage, onChange });
      store.init();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("onChange is optional", () => {
      const { storage } = mkMemStorage();
      const state: any = { pinnedFolders: [] };
      const store = createPinnedFoldersStore({ state, storage });
      store.init();
      expect(() => store.add("p")).not.toThrow();
      expect(() => store.remove("p")).not.toThrow();
    });
  });
});
