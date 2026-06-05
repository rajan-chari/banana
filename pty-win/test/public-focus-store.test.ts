// @vitest-environment happy-dom
//
// Tests for public/lib/focus-store.js — createFocusStore factory
// (Phase 9c-A — fifth model-layer slice).
//
// Verifies the get/set/setOrFirst/clear/refocusToFirstLeaf semantics
// and that the store mirrors writes to state.focusedPane (so existing
// readers across the codebase don't have to switch in one go).

import { describe, it, expect, vi } from "vitest";
import { createFocusStore } from "../public/lib/focus-store.js";

type LayoutNode =
  | { type: "leaf"; name: string }
  | { type: "split"; children: LayoutNode[] };

function leaf(name: string): LayoutNode { return { type: "leaf", name }; }
function split(...children: LayoutNode[]): LayoutNode { return { type: "split", children }; }

function getLeaves(node: LayoutNode | null): string[] {
  if (!node) return [];
  if (node.type === "leaf") return [node.name];
  return node.children.flatMap((c) => getLeaves(c));
}

function treeContains(node: LayoutNode | null, name: string): boolean {
  if (!node) return false;
  if (node.type === "leaf") return node.name === name;
  return node.children.some((c) => treeContains(c, name));
}

function mkStore(layout: LayoutNode | null = null, focusedPane: string | null = null) {
  const state: any = { focusedPane };
  const onChange = vi.fn();
  const store = createFocusStore({
    state,
    getActiveLayout: () => layout,
    getLeafList: getLeaves,
    treeContains,
    onChange,
  });
  return { store, state, onChange };
}

describe("createFocusStore", () => {
  describe("get", () => {
    it("returns the current state.focusedPane", () => {
      const { store } = mkStore(null, "a");
      expect(store.get()).toBe("a");
    });

    it("returns null when nothing is focused", () => {
      const { store } = mkStore();
      expect(store.get()).toBeNull();
    });
  });

  describe("set", () => {
    it("writes through to state.focusedPane and fires onChange", () => {
      const { store, state, onChange } = mkStore();
      expect(store.set("a")).toBe(true);
      expect(state.focusedPane).toBe("a");
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("no-ops (no onChange) when value matches current state", () => {
      const { store, onChange } = mkStore(null, "a");
      expect(store.set("a")).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("accepts null (clears focus)", () => {
      const { store, state } = mkStore(null, "a");
      expect(store.set(null)).toBe(true);
      expect(state.focusedPane).toBeNull();
    });

    it("does NOT validate against active layout (unvalidated by design)", () => {
      // set is used by click handlers where the pane is known-rendered.
      // setOrFirst is the validated variant.
      const { store, state } = mkStore(leaf("a"));
      expect(store.set("ghost")).toBe(true);
      expect(state.focusedPane).toBe("ghost");
    });
  });

  describe("clear", () => {
    it("sets focusedPane to null and returns true on change", () => {
      const { store, state } = mkStore(null, "a");
      expect(store.clear()).toBe(true);
      expect(state.focusedPane).toBeNull();
    });

    it("returns false when already null", () => {
      const { store, onChange } = mkStore();
      expect(store.clear()).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("setOrFirst", () => {
    it("sets the named pane when it is in the active layout", () => {
      const { store, state } = mkStore(split(leaf("a"), leaf("b")));
      expect(store.setOrFirst("b")).toBe("b");
      expect(state.focusedPane).toBe("b");
    });

    it("falls back to the first leaf when the named pane is not in layout", () => {
      const { store, state } = mkStore(split(leaf("a"), leaf("b")));
      expect(store.setOrFirst("ghost")).toBe("a");
      expect(state.focusedPane).toBe("a");
    });

    it("falls back to first leaf when name is null", () => {
      const { store } = mkStore(split(leaf("a"), leaf("b")));
      expect(store.setOrFirst(null)).toBe("a");
    });

    it("falls back to first leaf when name is undefined", () => {
      const { store } = mkStore(split(leaf("a"), leaf("b")));
      expect(store.setOrFirst(undefined)).toBe("a");
    });

    it("returns null when active layout is empty AND name is missing", () => {
      const { store, state } = mkStore(null);
      expect(store.setOrFirst(null)).toBeNull();
      expect(state.focusedPane).toBeNull();
    });

    it("returns null when active layout is empty AND name is not in any layout", () => {
      const { store, state } = mkStore(null);
      expect(store.setOrFirst("ghost")).toBeNull();
      expect(state.focusedPane).toBeNull();
    });
  });

  describe("refocusToFirstLeaf", () => {
    it("sets focusedPane to the first leaf of the active workspace", () => {
      const { store, state } = mkStore(split(leaf("a"), leaf("b")));
      expect(store.refocusToFirstLeaf()).toBe("a");
      expect(state.focusedPane).toBe("a");
    });

    it("returns null when the active workspace has no layout", () => {
      const { store, state } = mkStore(null, "stale");
      expect(store.refocusToFirstLeaf()).toBeNull();
      expect(state.focusedPane).toBeNull();
    });

    it("works after a layout shrinks (typical close-pane scenario)", () => {
      // start focused on "b" with both leaves present
      const initialLayout: LayoutNode = split(leaf("a"), leaf("b"));
      const state: any = { focusedPane: "b" };
      let currentLayout: LayoutNode | null = initialLayout;
      const store = createFocusStore({
        state,
        getActiveLayout: () => currentLayout,
        getLeafList: getLeaves,
        treeContains,
      });
      // workspace shrinks to just "a"
      currentLayout = leaf("a");
      expect(store.refocusToFirstLeaf()).toBe("a");
      expect(state.focusedPane).toBe("a");
    });
  });

  describe("defaultTreeContains (when treeContains dep omitted)", () => {
    it("falls back to a leaf.session/leaf.name check", () => {
      // Some callers pass {type:'leaf', session:'x'}, others {type:'leaf', name:'x'};
      // the default helper accepts both shapes.
      const state: any = { focusedPane: null };
      const store = createFocusStore({
        state,
        getActiveLayout: () => ({ type: "leaf", session: "a" }),
        getLeafList: (n: any) => (n?.session ? [n.session] : []),
      });
      expect(store.setOrFirst("a")).toBe("a");
    });
  });

  describe("onChange wiring", () => {
    it("does NOT fire when a no-op write occurs", () => {
      const { store, onChange } = mkStore(null, "a");
      store.set("a");
      store.clear();
      store.clear(); // already null after the first clear
      expect(onChange).toHaveBeenCalledTimes(1); // only the real clear
    });

    it("fires exactly once per real change in setOrFirst path", () => {
      const { store, onChange } = mkStore(split(leaf("a"), leaf("b")));
      store.setOrFirst("b");
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("captureForWorkspace", () => {
    it("writes the current focused pane onto ws.lastFocusedPane", () => {
      const { store } = mkStore(null, "b");
      const ws: any = {};
      store.captureForWorkspace(ws);
      expect(ws.lastFocusedPane).toBe("b");
    });

    it("captures null when nothing is focused", () => {
      const { store } = mkStore(null, null);
      const ws: any = { lastFocusedPane: "stale" };
      store.captureForWorkspace(ws);
      expect(ws.lastFocusedPane).toBeNull();
    });

    it("is a no-op when ws is null or undefined", () => {
      const { store } = mkStore(null, "x");
      expect(() => store.captureForWorkspace(null)).not.toThrow();
      expect(() => store.captureForWorkspace(undefined)).not.toThrow();
    });

    it("does NOT fire onChange (it's a workspace-side write, not focus mutation)", () => {
      const { store, onChange } = mkStore(null, "b");
      store.captureForWorkspace({} as any);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("restoreForWorkspace", () => {
    it("restores ws.lastFocusedPane when it's still in the layout", () => {
      const { store, state } = mkStore(split(leaf("a"), leaf("b")));
      const ws: any = { lastFocusedPane: "b" };
      expect(store.restoreForWorkspace(ws)).toBe("b");
      expect(state.focusedPane).toBe("b");
    });

    it("falls back to first leaf when lastFocusedPane is stale", () => {
      const { store, state } = mkStore(split(leaf("a"), leaf("b")));
      const ws: any = { lastFocusedPane: "ghost" };
      expect(store.restoreForWorkspace(ws)).toBe("a");
      expect(state.focusedPane).toBe("a");
    });

    it("falls back to first leaf when ws has no lastFocusedPane", () => {
      const { store, state } = mkStore(split(leaf("a"), leaf("b")));
      const ws: any = {};
      expect(store.restoreForWorkspace(ws)).toBe("a");
      expect(state.focusedPane).toBe("a");
    });

    it("falls back to first leaf when ws is null/undefined", () => {
      const { store, state } = mkStore(split(leaf("a"), leaf("b")));
      expect(store.restoreForWorkspace(null)).toBe("a");
      expect(state.focusedPane).toBe("a");
    });

    it("returns null when the active workspace has no layout", () => {
      const { store, state } = mkStore(null, "stale");
      const ws: any = { lastFocusedPane: "stale" };
      expect(store.restoreForWorkspace(ws)).toBeNull();
      expect(state.focusedPane).toBeNull();
    });
  });
});
