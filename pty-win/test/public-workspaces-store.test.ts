// @vitest-environment happy-dom
//
// Tests for public/lib/workspaces-store.js — createWorkspacesStore factory
// (Phase 9b-A — fourth model-layer slice). Verifies init/list/byId/active/
// create/setActive/transaction semantics, persistence integration, and
// activeWorkspaceId validation.
//
// Uses injected loadFn/saveFn rather than touching real localStorage so
// each test is hermetic and the persistence.js dependency is isolated.

import { describe, it, expect, vi } from "vitest";
import { createWorkspacesStore } from "../public/lib/workspaces-store.js";

function mkFakePersistence(initialBlob: any = null) {
  let blob: any = initialBlob;
  const saveFn = vi.fn(() => { /* see writeBlob */ });
  const loadFn = vi.fn(() => blob);
  return {
    loadFn,
    saveFn,
    setBlob(next: any) { blob = next; },
    getBlob() { return blob; },
  };
}

function mkState(): any {
  return {
    workspaces: [],
    activeWorkspaceId: null,
    nextWorkspaceId: 1,
    isDashboard: true,
  };
}

describe("createWorkspacesStore", () => {
  describe("init", () => {
    it("loads existing blob into state fields", () => {
      const fake = mkFakePersistence({
        workspaces: [{ id: "ws-1", name: "Foo", layout: null }],
        activeWorkspaceId: "ws-1",
        isDashboard: false,
        nextId: 2,
      });
      const state = mkState();
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.init();
      expect(state.workspaces).toEqual([{ id: "ws-1", name: "Foo", layout: null }]);
      expect(state.activeWorkspaceId).toBe("ws-1");
      expect(state.isDashboard).toBe(false);
      expect(state.nextWorkspaceId).toBe(2);
    });

    it("uses defaults when blob is null (fresh install)", () => {
      const fake = mkFakePersistence(null);
      const state = mkState();
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.init();
      expect(state.workspaces).toEqual([]);
      expect(state.activeWorkspaceId).toBe(null);
      expect(state.isDashboard).toBe(true);
      expect(state.nextWorkspaceId).toBe(1);
    });

    it("treats blob isDashboard !== false as true (matches pre-9b-A semantic)", () => {
      // Old app.js: state.isDashboard = savedWs.isDashboard !== false
      // So missing/undefined/true all become true; only explicit false stays false.
      const fake = mkFakePersistence({ workspaces: [], activeWorkspaceId: null });
      const state = mkState();
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.init();
      expect(state.isDashboard).toBe(true);
    });

    it("validates activeWorkspaceId: clears it and forces dashboard when target ws is missing", () => {
      const fake = mkFakePersistence({
        workspaces: [{ id: "ws-other", name: "Other", layout: null }],
        activeWorkspaceId: "ws-gone",
        isDashboard: false,
        nextId: 5,
      });
      const state = mkState();
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.init();
      expect(state.activeWorkspaceId).toBe(null);
      expect(state.isDashboard).toBe(true);
      // Defensive write-back so subsequent loads don't see the stale id.
      expect(fake.saveFn).toHaveBeenCalled();
    });

    it("does NOT notify onChange during init (caller controls first render)", () => {
      const fake = mkFakePersistence({ workspaces: [{ id: "ws-1", name: "A", layout: null }], activeWorkspaceId: "ws-gone", isDashboard: false, nextId: 2 });
      const state = mkState();
      const onChange = vi.fn();
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.init();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("preserves nextId of 1 when blob has no nextId field", () => {
      const fake = mkFakePersistence({ workspaces: [] });
      const state = mkState();
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.init();
      expect(state.nextWorkspaceId).toBe(1);
    });
  });

  describe("list / byId / active", () => {
    it("list() returns the live array reference", () => {
      const state = mkState();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      expect(store.list()).toBe(state.workspaces);
    });

    it("byId returns the workspace or undefined", () => {
      const state = mkState();
      state.workspaces = [{ id: "ws-1", name: "A", layout: null }, { id: "ws-2", name: "B", layout: null }];
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      expect(store.byId("ws-2")?.name).toBe("B");
      expect(store.byId("ws-nope")).toBeUndefined();
    });

    it("active() returns null when activeWorkspaceId is null", () => {
      const state = mkState();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      expect(store.active()).toBe(null);
    });

    it("active() returns the active workspace when set", () => {
      const state = mkState();
      state.workspaces = [{ id: "ws-1", name: "A", layout: null }];
      state.activeWorkspaceId = "ws-1";
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      expect(store.active()?.id).toBe("ws-1");
    });

    it("active() returns null (not undefined) when activeWorkspaceId references missing ws", () => {
      // Edge case: should only happen if external code corrupts state after init().
      // Init() validates, but the live state could drift. Be safe.
      const state = mkState();
      state.activeWorkspaceId = "ws-zombie";
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      expect(store.active()).toBe(null);
    });
  });

  describe("create", () => {
    it("assigns ws-N id from nextWorkspaceId and increments it", () => {
      const state = mkState();
      state.nextWorkspaceId = 7;
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      const ws = store.create(null);
      expect(ws.id).toBe("ws-7");
      expect(state.nextWorkspaceId).toBe(8);
    });

    it("uses pre-incremented id number in the default name (matches pre-9b-A)", () => {
      // Pre-9b-A: id="ws-3", name="Workspace 3" (nextWorkspaceId was 3, incremented to 4, then 4-1=3).
      const state = mkState();
      state.nextWorkspaceId = 3;
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      const ws = store.create(null);
      expect(ws.name).toBe("Workspace 3");
    });

    it("uses explicit name when provided", () => {
      const state = mkState();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      const ws = store.create("My Project");
      expect(ws.name).toBe("My Project");
    });

    it("appends to state.workspaces", () => {
      const state = mkState();
      state.workspaces = [{ id: "ws-existing", name: "X", layout: null }];
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      const ws = store.create(null);
      expect(state.workspaces).toHaveLength(2);
      expect(state.workspaces[1]).toBe(ws);
    });

    it("persists and notifies on create", () => {
      const state = mkState();
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.create(null);
      expect(fake.saveFn).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("ws.layout starts null", () => {
      const state = mkState();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      const ws = store.create(null);
      expect(ws.layout).toBe(null);
    });
  });

  describe("setActive", () => {
    it("sets activeWorkspaceId and clears isDashboard when switching to a ws", () => {
      const state = mkState();
      state.workspaces = [{ id: "ws-1", name: "A", layout: null }];
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      expect(store.setActive("ws-1")).toBe(true);
      expect(state.activeWorkspaceId).toBe("ws-1");
      expect(state.isDashboard).toBe(false);
      expect(fake.saveFn).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("setActive(null) clears activeWorkspaceId and sets isDashboard true", () => {
      const state = mkState();
      state.workspaces = [{ id: "ws-1", name: "A", layout: null }];
      state.activeWorkspaceId = "ws-1";
      state.isDashboard = false;
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      expect(store.setActive(null)).toBe(true);
      expect(state.activeWorkspaceId).toBe(null);
      expect(state.isDashboard).toBe(true);
    });

    it("no-ops (no persist, no notify) when id refers to a missing workspace", () => {
      const state = mkState();
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      expect(store.setActive("ws-nope")).toBe(false);
      expect(state.activeWorkspaceId).toBe(null);
      expect(fake.saveFn).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("no-ops when requested state matches current state", () => {
      const state = mkState();
      state.workspaces = [{ id: "ws-1", name: "A", layout: null }];
      state.activeWorkspaceId = "ws-1";
      state.isDashboard = false;
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      expect(store.setActive("ws-1")).toBe(false);
      expect(fake.saveFn).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("transaction", () => {
    it("batches multiple mutations into one persist + one notify", () => {
      const state = mkState();
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.transaction(() => {
        const ws = store.create(null);
        store.setActive(ws.id);
      });
      expect(fake.saveFn).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(state.workspaces).toHaveLength(1);
      expect(state.activeWorkspaceId).toBe(state.workspaces[0].id);
    });

    it("returns the value from the fn", () => {
      const state = mkState();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      const result = store.transaction(() => store.create("X"));
      expect(result.name).toBe("X");
    });

    it("no persist or notify when transaction body does no mutations", () => {
      const state = mkState();
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.transaction(() => { /* read-only */ });
      expect(fake.saveFn).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("nested transactions only commit at the outermost", () => {
      const state = mkState();
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.transaction(() => {
        store.create("Outer");
        store.transaction(() => {
          store.create("Inner");
        });
        expect(fake.saveFn).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();
      });
      expect(fake.saveFn).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(state.workspaces.map((w: any) => w.name)).toEqual(["Outer", "Inner"]);
    });

    it("still persists+notifies if transaction body throws (matches raw-mutation behavior)", () => {
      const state = mkState();
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      expect(() => store.transaction(() => {
        store.create("Partial");
        throw new Error("kaboom");
      })).toThrow("kaboom");
      expect(state.workspaces).toHaveLength(1);
      expect(fake.saveFn).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("remove", () => {
    it("removes the workspace by id, persists, and notifies", () => {
      const state = mkState();
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.create("A"); store.create("B");
      fake.saveFn.mockClear(); onChange.mockClear();
      const ok = store.remove("ws-1");
      expect(ok).toBe(true);
      expect(state.workspaces).toHaveLength(1);
      expect(state.workspaces[0].id).toBe("ws-2");
      expect(fake.saveFn).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("returns false and is a no-op when id is unknown", () => {
      const state = mkState();
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.create("A");
      fake.saveFn.mockClear(); onChange.mockClear();
      expect(store.remove("ws-99")).toBe(false);
      expect(state.workspaces).toHaveLength(1);
      expect(fake.saveFn).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("does NOT clear activeWorkspaceId — caller orchestrates the switch", () => {
      const state = mkState();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      const ws = store.create("A");
      store.setActive(ws.id);
      store.remove(ws.id);
      // activeWorkspaceId still points at the removed workspace — caller's job
      // (app.js removeWorkspace orchestrator) to either setActive(null) or
      // switch to another ws. The init() defense will heal it on next reload.
      expect(state.activeWorkspaceId).toBe(ws.id);
    });
  });

  describe("rename", () => {
    it("sets name + customName=true and persists/notifies", () => {
      const state = mkState();
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      const ws = store.create("A");
      fake.saveFn.mockClear(); onChange.mockClear();
      expect(store.rename(ws.id, "Renamed")).toBe(true);
      expect(ws.name).toBe("Renamed");
      expect(ws.customName).toBe(true);
      expect(fake.saveFn).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("returns false and is a no-op when id is unknown", () => {
      const state = mkState();
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      expect(store.rename("ws-99", "X")).toBe(false);
      expect(fake.saveFn).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("returns false and is a no-op when name + customName already match", () => {
      const state = mkState();
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      const ws = store.create("A");
      store.rename(ws.id, "Renamed");
      fake.saveFn.mockClear(); onChange.mockClear();
      expect(store.rename(ws.id, "Renamed")).toBe(false);
      expect(fake.saveFn).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("re-marks customName even if name unchanged but customName was false", () => {
      const state = mkState();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, loadFn: fake.loadFn, saveFn: fake.saveFn });
      const ws = store.create("A");
      // ws.customName is undefined initially
      expect(store.rename(ws.id, "A")).toBe(true);
      expect(ws.customName).toBe(true);
    });
  });

  describe("reorder", () => {
    it("reorders workspaces via the reorderWorkspaces helper and persists/notifies", () => {
      const state = mkState();
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.create("A"); store.create("B"); store.create("C");
      fake.saveFn.mockClear(); onChange.mockClear();
      const ok = store.reorder("ws-1", "ws-3", "right");
      expect(ok).toBe(true);
      expect(state.workspaces.map((w: any) => w.id)).toEqual(["ws-2", "ws-3", "ws-1"]);
      expect(fake.saveFn).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("returns false and is a no-op when order is unchanged", () => {
      const state = mkState();
      const onChange = vi.fn();
      const fake = mkFakePersistence(null);
      const store = createWorkspacesStore({ state, onChange, loadFn: fake.loadFn, saveFn: fake.saveFn });
      store.create("A"); store.create("B");
      fake.saveFn.mockClear(); onChange.mockClear();
      // reorderWorkspaces with src=tgt is a no-op
      expect(store.reorder("ws-1", "ws-1", "left")).toBe(false);
      expect(fake.saveFn).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
