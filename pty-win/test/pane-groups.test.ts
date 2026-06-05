import { describe, it, expect } from "vitest";
import { rebuildPaneGroups } from "../public/lib/pane-groups.js";
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

describe("rebuildPaneGroups", () => {
  it("returns empty map for no sessions", () => {
    const result = rebuildPaneGroups(new Map(), mkStore());
    expect(result.size).toBe(0);
  });

  it("creates group for single Claude session", () => {
    const result = rebuildPaneGroups(sessions({ name: "myapp" }), mkStore());
    expect(result.size).toBe(1);
    const pg = result.get("myapp")!;
    expect(pg.claude).toBe("myapp");
    expect(pg.pwsh).toBeUndefined();
    expect(pg.activeType).toBe("claude");
  });

  it("creates group for single PowerShell session", () => {
    const result = rebuildPaneGroups(sessions({ name: "myapp~pwsh" }), mkStore());
    expect(result.size).toBe(1);
    const pg = result.get("myapp")!;
    expect(pg.pwsh).toBe("myapp~pwsh");
    expect(pg.claude).toBeUndefined();
    // activeType flips to pwsh because claude is missing
    expect(pg.activeType).toBe("pwsh");
  });

  it("groups Claude + PowerShell for same folder", () => {
    const result = rebuildPaneGroups(
      sessions({ name: "myapp" }, { name: "myapp~pwsh" }),
      mkStore()
    );
    expect(result.size).toBe(1);
    const pg = result.get("myapp")!;
    expect(pg.claude).toBe("myapp");
    expect(pg.pwsh).toBe("myapp~pwsh");
    expect(pg.activeType).toBe("claude");
  });

  it("creates separate groups for different folders", () => {
    const result = rebuildPaneGroups(
      sessions({ name: "app1" }, { name: "app2" }),
      mkStore()
    );
    expect(result.size).toBe(2);
    expect(result.has("app1")).toBe(true);
    expect(result.has("app2")).toBe(true);
  });

  it("uses activePaneTypes store value when present", () => {
    const store = mkStore([["myapp", "pwsh"]]);
    const result = rebuildPaneGroups(
      sessions({ name: "myapp" }, { name: "myapp~pwsh" }),
      store
    );
    expect(result.get("myapp")!.activeType).toBe("pwsh");
  });

  it("flips activeType to claude when pwsh session disappears (and updates store)", () => {
    const store = mkStore([["myapp", "pwsh"]]);
    // Only Claude session remains
    const result = rebuildPaneGroups(sessions({ name: "myapp" }), store);
    const pg = result.get("myapp")!;
    expect(pg.activeType).toBe("claude");
    expect(pg.pwsh).toBeUndefined();
    // Store mirrored the flip:
    expect(store.get("myapp")).toBe("claude");
  });

  it("flips activeType to pwsh when claude session disappears (and updates store)", () => {
    const store = mkStore([["myapp", "claude"]]);
    // Only PowerShell session remains
    const result = rebuildPaneGroups(sessions({ name: "myapp~pwsh" }), store);
    const pg = result.get("myapp")!;
    expect(pg.activeType).toBe("pwsh");
    expect(pg.claude).toBeUndefined();
    expect(store.get("myapp")).toBe("pwsh");
  });

  it("defaults to claude when no store entry", () => {
    const result = rebuildPaneGroups(
      sessions({ name: "myapp" }, { name: "myapp~pwsh" }),
      mkStore()
    );
    expect(result.get("myapp")!.activeType).toBe("claude");
  });

  it("handles multiple groups with mixed session types", () => {
    const result = rebuildPaneGroups(
      sessions(
        { name: "app1" },
        { name: "app1~pwsh" },
        { name: "app2" },
        { name: "app3~pwsh" },
      ),
      mkStore()
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
    const result = rebuildPaneGroups(sess, mkStore());
    expect(result.size).toBe(1);
    expect(result.get("shared-group")!.claude).toBe("custom-name");
    expect(result.get("shared-group")!.pwsh).toBe("shared-group~pwsh");
  });

  it("handles rebuild with empty store (fresh start)", () => {
    const result = rebuildPaneGroups(
      sessions({ name: "a" }, { name: "b" }, { name: "c" }),
      mkStore()
    );
    expect(result.size).toBe(3);
    for (const [, pg] of result) {
      expect(pg.activeType).toBe("claude");
    }
  });

  // 9d-0 stale-entry cleanup: groups that disappear should release their store
  // entry so a reappearance defaults back to "claude" — preserves pre-9d-0
  // behavior where activeType lived on cached PaneGroup objects that were
  // thrown away when the group went away.
  it("removes stale store entries for groups not in the rebuilt map", () => {
    const store = mkStore([["myapp", "pwsh"], ["other", "claude"]]);
    // Only `other` is in the new session list.
    const result = rebuildPaneGroups(sessions({ name: "other" }), store);
    expect(result.has("myapp")).toBe(false);
    expect(store.has("myapp")).toBe(false);
    expect(store.has("other")).toBe(true);
  });

  it("group that disappears and later returns defaults to claude", () => {
    const store = mkStore([["myapp", "pwsh"]]);
    // First: group disappears.
    rebuildPaneGroups(new Map(), store);
    expect(store.has("myapp")).toBe(false);
    // Then: group returns with both sessions.
    const result = rebuildPaneGroups(
      sessions({ name: "myapp" }, { name: "myapp~pwsh" }),
      store,
    );
    expect(result.get("myapp")!.activeType).toBe("claude");
  });

  it("does not delete store entries for groups still present", () => {
    const store = mkStore([["a", "pwsh"], ["b", "claude"]]);
    const result = rebuildPaneGroups(
      sessions({ name: "a" }, { name: "a~pwsh" }, { name: "b" }, { name: "b~pwsh" }),
      store,
    );
    expect(result.size).toBe(2);
    expect(store.get("a")).toBe("pwsh");
    expect(store.get("b")).toBe("claude");
  });
});
