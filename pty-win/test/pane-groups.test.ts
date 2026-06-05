import { describe, it, expect } from "vitest";
import { reconcilePaneActiveTypes, getPaneGroups, getPaneGroup } from "../public/lib/pane-groups.js";
import type { SessionInfo } from "../public/lib/pane-groups.js";
import { createPaneActiveTypeStore } from "../public/lib/pane-active-type-store.js";

// Helper to build sessions map
function sessions(...entries: Array<{ name: string; group?: string; command?: string; status?: SessionInfo["status"] }>): Map<string, SessionInfo> {
  const map = new Map<string, SessionInfo>();
  for (const e of entries) {
    map.set(e.name, {
      name: e.name,
      group: e.group || e.name.replace(/~pwsh$/, ""),
      command: e.command || (e.name.endsWith("~pwsh") ? "pwsh" : "claude"),
      status: e.status || "idle",
    });
  }
  return map;
}

function mkStore(initial: Array<[string, "claude" | "pwsh"]> = []) {
  const state: { activePaneTypes?: Map<string, "claude" | "pwsh"> } = {
    activePaneTypes: new Map(initial),
  };
  return createPaneActiveTypeStore({ state });
}

// reconcilePaneActiveTypes (formerly rebuildPaneGroups) is now a
// side-effect-only function: it mutates the activePaneTypes store to
// stay consistent with the live sessions map. Membership shape coverage
// lives under getPaneGroups (the pure selector callers actually read).
describe("reconcilePaneActiveTypes (side effects)", () => {
  it("no-ops on empty store + empty sessions", () => {
    const store = mkStore();
    reconcilePaneActiveTypes(new Map(), store);
    expect(store.raw().size).toBe(0);
  });

  it("flips active type to claude when pwsh sibling disappears", () => {
    const store = mkStore([["myapp", "pwsh"]]);
    reconcilePaneActiveTypes(sessions({ name: "myapp" }), store);
    expect(store.get("myapp")).toBe("claude");
  });

  it("flips active type to pwsh when claude sibling disappears", () => {
    const store = mkStore([["myapp", "claude"]]);
    reconcilePaneActiveTypes(sessions({ name: "myapp~pwsh" }), store);
    expect(store.get("myapp")).toBe("pwsh");
  });

  it("does NOT touch valid entries (both siblings present)", () => {
    const store = mkStore([["myapp", "pwsh"]]);
    reconcilePaneActiveTypes(
      sessions({ name: "myapp" }, { name: "myapp~pwsh" }),
      store,
    );
    expect(store.get("myapp")).toBe("pwsh");
  });

  it("prunes stale store entries for groups not in the rebuilt map", () => {
    const store = mkStore([["myapp", "pwsh"], ["other", "claude"]]);
    reconcilePaneActiveTypes(sessions({ name: "other" }), store);
    expect(store.has("myapp")).toBe(false);
    expect(store.has("other")).toBe(true);
  });

  it("group that disappears and later returns defaults to claude", () => {
    const store = mkStore([["myapp", "pwsh"]]);
    // First: group disappears.
    reconcilePaneActiveTypes(new Map(), store);
    expect(store.has("myapp")).toBe(false);
    // Then: group returns with both sessions — defaults to "claude" via
    // the selector since the store has no entry.
    const selected = getPaneGroups(
      sessions({ name: "myapp" }, { name: "myapp~pwsh" }),
      store.raw(),
    );
    expect(selected.get("myapp")!.activeType).toBe("claude");
  });

  it("does not delete store entries for groups still present", () => {
    const store = mkStore([["a", "pwsh"], ["b", "claude"]]);
    reconcilePaneActiveTypes(
      sessions({ name: "a" }, { name: "a~pwsh" }, { name: "b" }, { name: "b~pwsh" }),
      store,
    );
    expect(store.get("a")).toBe("pwsh");
    expect(store.get("b")).toBe("claude");
  });

  it("empty sessions prunes all entries", () => {
    const store = mkStore([["a", "claude"], ["b", "pwsh"], ["c", "claude"]]);
    reconcilePaneActiveTypes(new Map(), store);
    expect(store.raw().size).toBe(0);
  });

  it("returns void (no Map return value)", () => {
    const store = mkStore();
    const result = reconcilePaneActiveTypes(sessions({ name: "x" }), store);
    expect(result).toBeUndefined();
  });
});

describe("getPaneGroups (pure selector)", () => {
  function rawActive(initial: Array<[string, "claude" | "pwsh"]> = []) {
    return new Map<string, "claude" | "pwsh">(initial);
  }

  it("returns empty map for no sessions", () => {
    const result = getPaneGroups(new Map(), rawActive());
    expect(result.size).toBe(0);
  });

  it("creates group for single Claude session", () => {
    const result = getPaneGroups(sessions({ name: "myapp" }), rawActive());
    const pg = result.get("myapp")!;
    expect(pg.claude).toBe("myapp");
    expect(pg.pwsh).toBeUndefined();
    expect(pg.activeType).toBe("claude");
  });

  it("creates group for single PowerShell session (flips to pwsh)", () => {
    const result = getPaneGroups(sessions({ name: "myapp~pwsh" }), rawActive());
    const pg = result.get("myapp")!;
    expect(pg.pwsh).toBe("myapp~pwsh");
    expect(pg.claude).toBeUndefined();
    expect(pg.activeType).toBe("pwsh");
  });

  it("groups Claude + PowerShell for same folder", () => {
    const result = getPaneGroups(
      sessions({ name: "myapp" }, { name: "myapp~pwsh" }),
      rawActive(),
    );
    const pg = result.get("myapp")!;
    expect(pg.claude).toBe("myapp");
    expect(pg.pwsh).toBe("myapp~pwsh");
    expect(pg.activeType).toBe("claude");
  });

  it("creates separate groups for different folders", () => {
    const result = getPaneGroups(
      sessions({ name: "app1" }, { name: "app2" }),
      rawActive(),
    );
    expect(result.size).toBe(2);
    expect(result.has("app1")).toBe(true);
    expect(result.has("app2")).toBe(true);
  });

  it("uses activePaneTypes value when present", () => {
    const result = getPaneGroups(
      sessions({ name: "myapp" }, { name: "myapp~pwsh" }),
      rawActive([["myapp", "pwsh"]]),
    );
    expect(result.get("myapp")!.activeType).toBe("pwsh");
  });

  it("defaults activeType to 'claude' when no store entry", () => {
    const result = getPaneGroups(
      sessions({ name: "myapp" }, { name: "myapp~pwsh" }),
      rawActive(),
    );
    expect(result.get("myapp")!.activeType).toBe("claude");
  });

  it("handles multiple groups with mixed session types", () => {
    const result = getPaneGroups(
      sessions(
        { name: "app1" },
        { name: "app1~pwsh" },
        { name: "app2" },
        { name: "app3~pwsh" },
      ),
      rawActive(),
    );
    expect(result.size).toBe(3);
    expect(result.get("app1")!.claude).toBe("app1");
    expect(result.get("app1")!.pwsh).toBe("app1~pwsh");
    expect(result.get("app2")!.claude).toBe("app2");
    expect(result.get("app2")!.pwsh).toBeUndefined();
    expect(result.get("app3")!.claude).toBeUndefined();
    expect(result.get("app3")!.pwsh).toBe("app3~pwsh");
    expect(result.get("app3")!.activeType).toBe("pwsh"); // flipped
  });

  it("uses info.group for grouping, not just name parsing", () => {
    const sess = new Map<string, SessionInfo>();
    sess.set("custom-name", {
      name: "custom-name",
      group: "shared-group",
      command: "claude",
      status: "idle",
    });
    sess.set("shared-group~pwsh", {
      name: "shared-group~pwsh",
      group: "shared-group",
      command: "pwsh",
      status: "idle",
    });
    const result = getPaneGroups(sess, rawActive());
    expect(result.size).toBe(1);
    expect(result.get("shared-group")!.claude).toBe("custom-name");
    expect(result.get("shared-group")!.pwsh).toBe("shared-group~pwsh");
  });

  it("read-only flip: returns claude when stored pwsh but pwsh sibling absent", () => {
    const active = rawActive([["myapp", "pwsh"]]);
    const result = getPaneGroups(sessions({ name: "myapp" }), active);
    expect(result.get("myapp")!.activeType).toBe("claude");
    // Store NOT mutated by selector
    expect(active.get("myapp")).toBe("pwsh");
  });

  it("read-only flip: returns pwsh when stored claude but claude sibling absent", () => {
    const active = rawActive([["myapp", "claude"]]);
    const result = getPaneGroups(sessions({ name: "myapp~pwsh" }), active);
    expect(result.get("myapp")!.activeType).toBe("pwsh");
    expect(active.get("myapp")).toBe("claude");
  });

  it("does NOT prune stale store entries (reconcilePaneActiveTypes owns that)", () => {
    const active = rawActive([["gone", "pwsh"], ["still-here", "claude"]]);
    const result = getPaneGroups(sessions({ name: "still-here" }), active);
    expect(result.has("gone")).toBe(false);
    // Stale entry survives — only the reconciler prunes
    expect(active.has("gone")).toBe(true);
  });

  it("returns fresh group objects (mutating them does not affect activePaneTypes)", () => {
    const active = rawActive([["myapp", "claude"]]);
    const result = getPaneGroups(sessions({ name: "myapp" }), active);
    const pg = result.get("myapp")!;
    pg.activeType = "pwsh";
    expect(active.get("myapp")).toBe("claude");
  });
});

describe("getPaneGroup (convenience)", () => {
  it("returns the single named group", () => {
    const active = new Map<string, "claude" | "pwsh">();
    const result = getPaneGroup(sessions({ name: "myapp" }, { name: "myapp~pwsh" }), "myapp", active);
    expect(result?.claude).toBe("myapp");
    expect(result?.pwsh).toBe("myapp~pwsh");
  });

  it("returns undefined when no group with that name has live sessions", () => {
    const active = new Map<string, "claude" | "pwsh">();
    const result = getPaneGroup(sessions({ name: "other" }), "missing", active);
    expect(result).toBeUndefined();
  });
});