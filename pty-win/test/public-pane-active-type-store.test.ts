import { describe, it, expect } from "vitest";
import { createPaneActiveTypeStore } from "../public/lib/pane-active-type-store.js";

function mkStore(initial: Array<[string, "claude" | "pwsh"]> = []) {
  const state: { activePaneTypes?: Map<string, "claude" | "pwsh"> } = {
    activePaneTypes: new Map(initial),
  };
  const store = createPaneActiveTypeStore({ state });
  return { store, state };
}

describe("createPaneActiveTypeStore", () => {
  it("returns undefined for unknown name", () => {
    const { store } = mkStore();
    expect(store.get("ghost")).toBeUndefined();
  });

  it("set then get returns the stored type", () => {
    const { store } = mkStore();
    store.set("foo", "pwsh");
    expect(store.get("foo")).toBe("pwsh");
  });

  it("set overwrites existing value", () => {
    const { store } = mkStore([["foo", "claude"]]);
    store.set("foo", "pwsh");
    expect(store.get("foo")).toBe("pwsh");
  });

  it("has reflects presence", () => {
    const { store } = mkStore();
    expect(store.has("foo")).toBe(false);
    store.set("foo", "claude");
    expect(store.has("foo")).toBe(true);
  });

  it("delete removes entry and returns boolean", () => {
    const { store } = mkStore([["foo", "claude"]]);
    expect(store.delete("foo")).toBe(true);
    expect(store.has("foo")).toBe(false);
    expect(store.delete("foo")).toBe(false);
  });

  it("clear empties the store", () => {
    const { store } = mkStore([["a", "claude"], ["b", "pwsh"]]);
    store.clear();
    expect(store.has("a")).toBe(false);
    expect(store.has("b")).toBe(false);
  });

  it("raw exposes the underlying Map", () => {
    const { store, state } = mkStore();
    store.set("foo", "pwsh");
    expect(store.raw()).toBe(state.activePaneTypes);
    expect(store.raw().get("foo")).toBe("pwsh");
  });

  it("eager-initializes state.activePaneTypes when missing", () => {
    const state: { activePaneTypes?: Map<string, "claude" | "pwsh"> } = {};
    const store = createPaneActiveTypeStore({ state });
    expect(state.activePaneTypes).toBeInstanceOf(Map);
    store.set("foo", "claude");
    expect(state.activePaneTypes?.get("foo")).toBe("claude");
  });
});
