// @vitest-environment happy-dom
//
// Tests for public/lib/sessions-store.js — createSessionsStore factory
// (Phase 9e-A — sixth model-layer slice).
//
// Covers the replaceAll writer + the read-only API surface (byName /
// has / size / names / list / entries / raw). updateStatus (9e-B) and
// remove (9e-C) get their own tests in those phases.

import { describe, it, expect, vi } from "vitest";
import { createSessionsStore } from "../public/lib/sessions-store.js";

type SI = { name: string; status?: string; unreadCount?: number };

function mkStore(initial: SI[] = []) {
  const state: any = { sessions: new Map(initial.map((s) => [s.name, s])) };
  const onChange = vi.fn();
  const store = createSessionsStore({ state, onChange });
  return { store, state, onChange };
}

describe("createSessionsStore", () => {
  describe("readers", () => {
    it("byName returns the SessionInfo for an existing name", () => {
      const { store } = mkStore([{ name: "a", status: "idle" }]);
      expect(store.byName("a")?.status).toBe("idle");
    });

    it("byName returns undefined for an unknown name", () => {
      const { store } = mkStore([{ name: "a" }]);
      expect(store.byName("ghost")).toBeUndefined();
    });

    it("has returns true/false correctly", () => {
      const { store } = mkStore([{ name: "a" }]);
      expect(store.has("a")).toBe(true);
      expect(store.has("ghost")).toBe(false);
    });

    it("size returns the Map size", () => {
      const { store } = mkStore([{ name: "a" }, { name: "b" }]);
      expect(store.size()).toBe(2);
    });

    it("names returns insertion-order array of session names", () => {
      const { store } = mkStore([{ name: "a" }, { name: "b" }, { name: "c" }]);
      expect(store.names()).toEqual(["a", "b", "c"]);
    });

    it("list returns insertion-order array of SessionInfo values", () => {
      const { store } = mkStore([{ name: "a" }, { name: "b" }]);
      expect(store.list().map((s: SI) => s.name)).toEqual(["a", "b"]);
    });

    it("entries returns [name, info] pairs", () => {
      const { store } = mkStore([{ name: "a", status: "busy" }]);
      expect(store.entries()).toEqual([["a", { name: "a", status: "busy" }]]);
    });

    it("raw returns the backing Map (for helpers that take Map<string, SessionInfo>)", () => {
      const { store, state } = mkStore([{ name: "a" }]);
      expect(store.raw()).toBe(state.sessions);
    });

    it("returns empty results when the store is empty", () => {
      const { store } = mkStore();
      expect(store.size()).toBe(0);
      expect(store.names()).toEqual([]);
      expect(store.list()).toEqual([]);
      expect(store.entries()).toEqual([]);
      expect(store.byName("anything")).toBeUndefined();
      expect(store.has("anything")).toBe(false);
    });
  });

  describe("replaceAll", () => {
    it("replaces all sessions with the new list", () => {
      const { store, state } = mkStore([{ name: "old" }]);
      store.replaceAll([{ name: "a" }, { name: "b" }] as any);
      expect([...state.sessions.keys()]).toEqual(["a", "b"]);
    });

    it("returns the set of names that were present BEFORE the replacement", () => {
      const { store } = mkStore([{ name: "a" }, { name: "b" }]);
      const prev = store.replaceAll([{ name: "c" }] as any);
      expect([...prev].sort()).toEqual(["a", "b"]);
    });

    it("returns an empty set when the store was empty", () => {
      const { store } = mkStore();
      const prev = store.replaceAll([{ name: "a" }] as any);
      expect(prev.size).toBe(0);
    });

    it("returns an empty result when called with an empty list", () => {
      const { store, state } = mkStore([{ name: "a" }, { name: "b" }]);
      store.replaceAll([]);
      expect(state.sessions.size).toBe(0);
    });

    it("fires onChange exactly once with kind:'replace' and prevNames", () => {
      const { store, onChange } = mkStore([{ name: "a" }]);
      store.replaceAll([{ name: "b" }, { name: "c" }] as any);
      expect(onChange).toHaveBeenCalledTimes(1);
      const arg = onChange.mock.calls[0][0];
      expect(arg.kind).toBe("replace");
      expect([...arg.prevNames]).toEqual(["a"]);
    });

    it("accepts any Iterable (Set, generator) — not just Array", () => {
      const { store } = mkStore();
      const set = new Set([{ name: "x" }, { name: "y" }]);
      store.replaceAll(set as any);
      expect(store.names()).toEqual(["x", "y"]);
    });

    it("backing Map identity is preserved (helpers holding the Map ref keep working)", () => {
      const { store, state } = mkStore();
      const refBefore = state.sessions;
      store.replaceAll([{ name: "a" }] as any);
      expect(state.sessions).toBe(refBefore);
    });
  });

  describe("onChange wiring", () => {
    it("default no-op onChange does not throw", () => {
      const state: any = { sessions: new Map() };
      const store = createSessionsStore({ state });
      expect(() => store.replaceAll([{ name: "a" }] as any)).not.toThrow();
    });
  });
});
