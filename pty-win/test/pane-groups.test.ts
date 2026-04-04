import { describe, it, expect } from "vitest";
import { rebuildPaneGroups, type SessionInfo, type PaneGroup } from "../src/pane-groups.js";

// Helper to build sessions map
function sessions(...entries: Array<{ name: string; group?: string; command?: string; status?: string }>): Map<string, SessionInfo> {
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

const empty = new Map<string, PaneGroup>();

describe("rebuildPaneGroups", () => {
  it("returns empty map for no sessions", () => {
    const result = rebuildPaneGroups(new Map(), empty);
    expect(result.size).toBe(0);
  });

  it("creates group for single Claude session", () => {
    const result = rebuildPaneGroups(sessions({ name: "myapp" }), empty);
    expect(result.size).toBe(1);
    const pg = result.get("myapp")!;
    expect(pg.claude).toBe("myapp");
    expect(pg.pwsh).toBeUndefined();
    expect(pg.activeType).toBe("claude");
  });

  it("creates group for single PowerShell session", () => {
    const result = rebuildPaneGroups(sessions({ name: "myapp~pwsh" }), empty);
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
      empty
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
      empty
    );
    expect(result.size).toBe(2);
    expect(result.has("app1")).toBe(true);
    expect(result.has("app2")).toBe(true);
  });

  it("preserves activeType from previous groups", () => {
    const prev = new Map<string, PaneGroup>([
      ["myapp", { claude: "myapp", pwsh: "myapp~pwsh", activeType: "pwsh" }],
    ]);
    const result = rebuildPaneGroups(
      sessions({ name: "myapp" }, { name: "myapp~pwsh" }),
      prev
    );
    expect(result.get("myapp")!.activeType).toBe("pwsh");
  });

  it("flips activeType to claude when pwsh session disappears", () => {
    const prev = new Map<string, PaneGroup>([
      ["myapp", { claude: "myapp", pwsh: "myapp~pwsh", activeType: "pwsh" }],
    ]);
    // Only Claude session remains
    const result = rebuildPaneGroups(sessions({ name: "myapp" }), prev);
    const pg = result.get("myapp")!;
    expect(pg.activeType).toBe("claude");
    expect(pg.pwsh).toBeUndefined();
  });

  it("flips activeType to pwsh when claude session disappears", () => {
    const prev = new Map<string, PaneGroup>([
      ["myapp", { claude: "myapp", pwsh: "myapp~pwsh", activeType: "claude" }],
    ]);
    // Only PowerShell session remains
    const result = rebuildPaneGroups(sessions({ name: "myapp~pwsh" }), prev);
    const pg = result.get("myapp")!;
    expect(pg.activeType).toBe("pwsh");
    expect(pg.claude).toBeUndefined();
  });

  it("defaults to claude when no previous activeType", () => {
    const result = rebuildPaneGroups(
      sessions({ name: "myapp" }, { name: "myapp~pwsh" }),
      empty
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
      empty
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
    const result = rebuildPaneGroups(sess, empty);
    expect(result.size).toBe(1);
    expect(result.get("shared-group")!.claude).toBe("custom-name");
    expect(result.get("shared-group")!.pwsh).toBe("shared-group~pwsh");
  });

  it("handles rebuild with no previous groups (fresh start)", () => {
    const result = rebuildPaneGroups(
      sessions({ name: "a" }, { name: "b" }, { name: "c" }),
      empty
    );
    expect(result.size).toBe(3);
    for (const [, pg] of result) {
      expect(pg.activeType).toBe("claude");
    }
  });
});
