// WS-handler pure helpers — extracted from app.js connect()'s `sessions` case.
//
// Companion to tracker e0ca3757 / 8eb3a993 Phase 3.

import { describe, it, expect } from "vitest";
import {
  hasSessionNameSetChanged,
  findOrphanedLeaves,
  classifyOrphanGroups,
  rebalanceLayoutsWithoutLeaves,
} from "../public/lib/ws-handlers.js";

describe("hasSessionNameSetChanged", () => {
  it("returns false for identical sets", () => {
    expect(hasSessionNameSetChanged(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(false);
  });

  it("returns false when ordering differs but set is identical (from iterables)", () => {
    expect(hasSessionNameSetChanged(["a", "b", "c"], ["c", "a", "b"])).toBe(false);
  });

  it("returns true on addition", () => {
    expect(hasSessionNameSetChanged(new Set(["a"]), new Set(["a", "b"]))).toBe(true);
  });

  it("returns true on removal", () => {
    expect(hasSessionNameSetChanged(new Set(["a", "b"]), new Set(["a"]))).toBe(true);
  });

  it("returns true on replacement (same size, different names)", () => {
    expect(hasSessionNameSetChanged(new Set(["a", "b"]), new Set(["a", "c"]))).toBe(true);
  });

  it("returns false for empty=empty", () => {
    expect(hasSessionNameSetChanged(new Set(), new Set())).toBe(false);
  });

  it("returns true for empty → non-empty", () => {
    expect(hasSessionNameSetChanged(new Set(), new Set(["x"]))).toBe(true);
  });

  it("accepts arrays as inputs", () => {
    expect(hasSessionNameSetChanged(["a"], ["a", "b"])).toBe(true);
  });
});

describe("findOrphanedLeaves", () => {
  // simple stub: layouts are arrays of leaf names
  const leafList = (layout: string[]) => layout;

  it("returns empty when all leaves are present in serverGroups", () => {
    const wss = [{ layout: ["a", "b"] }, { layout: ["c"] }];
    const out = findOrphanedLeaves(wss, new Set(["a", "b", "c"]), leafList);
    expect([...out]).toEqual([]);
  });

  it("finds leaves missing from serverGroups", () => {
    const wss = [{ layout: ["a", "b"] }, { layout: ["c", "d"] }];
    const out = findOrphanedLeaves(wss, new Set(["a", "c"]), leafList);
    expect(new Set(out)).toEqual(new Set(["b", "d"]));
  });

  it("skips workspaces with null/undefined layout", () => {
    const wss = [{ layout: null as unknown as string[] }, { layout: undefined as unknown as string[] }, { layout: ["x"] }];
    const out = findOrphanedLeaves(wss, new Set(), leafList);
    expect([...out]).toEqual(["x"]);
  });

  it("dedupes leaves across workspaces", () => {
    const wss = [{ layout: ["a", "b"] }, { layout: ["a", "b"] }];
    const out = findOrphanedLeaves(wss, new Set(), leafList);
    expect([...out].sort()).toEqual(["a", "b"]);
  });

  it("returns empty for empty workspaces", () => {
    expect([...findOrphanedLeaves([], new Set(), leafList)]).toEqual([]);
  });
});

describe("classifyOrphanGroups", () => {
  it("recreatable=[g] when only the claude session has metadata", () => {
    const meta = new Map<string, unknown>([["alice", { workingDir: "C:/a" }]]);
    expect(classifyOrphanGroups(["alice"], meta)).toEqual({
      recreatable: ["alice"],
      unrecoverable: [],
    });
  });

  it("recreatable=[g~pwsh] when only the pwsh session has metadata", () => {
    const meta = new Map<string, unknown>([["alice~pwsh", { workingDir: "C:/a" }]]);
    expect(classifyOrphanGroups(["alice"], meta)).toEqual({
      recreatable: ["alice~pwsh"],
      unrecoverable: [],
    });
  });

  it("recreatable=[g, g~pwsh] when both sessions have metadata", () => {
    const meta = new Map<string, unknown>([
      ["alice", { workingDir: "C:/a" }],
      ["alice~pwsh", { workingDir: "C:/a" }],
    ]);
    expect(classifyOrphanGroups(["alice"], meta)).toEqual({
      recreatable: ["alice", "alice~pwsh"],
      unrecoverable: [],
    });
  });

  it("unrecoverable=[g] when neither has metadata", () => {
    expect(classifyOrphanGroups(["ghost"], new Map())).toEqual({
      recreatable: [],
      unrecoverable: ["ghost"],
    });
  });

  it("handles multiple orphans with mixed metadata", () => {
    const meta = new Map<string, unknown>([
      ["alice", {}],
      ["bob~pwsh", {}],
    ]);
    expect(classifyOrphanGroups(["alice", "bob", "carol"], meta)).toEqual({
      recreatable: ["alice", "bob~pwsh"],
      unrecoverable: ["carol"],
    });
  });

  it("returns empty for empty input", () => {
    expect(classifyOrphanGroups([], new Map())).toEqual({
      recreatable: [],
      unrecoverable: [],
    });
  });

  it("accepts a Set of orphan groups", () => {
    const meta = new Map<string, unknown>([["alice", {}]]);
    const result = classifyOrphanGroups(new Set(["alice", "ghost"]), meta);
    expect(result.recreatable).toEqual(["alice"]);
    expect(result.unrecoverable).toEqual(["ghost"]);
  });
});

describe("rebalanceLayoutsWithoutLeaves", () => {
  const leafList = (layout: string[]) => layout;
  // Treat a layout as the array of surviving names. Use a tagged copy so we
  // can distinguish "rebalanced" outputs from original arrays.
  const build = (leaves: string[]) => leaves.slice();

  it("returns empty when no leaves overlap deadLeaves", () => {
    const wss = [{ id: "w1", layout: ["a", "b"] }];
    expect(rebalanceLayoutsWithoutLeaves(wss, ["x"], leafList, build)).toEqual([]);
  });

  it("returns an update with surviving leaves when some are dead", () => {
    const ws = { id: "w1", layout: ["a", "b", "c"] };
    const out = rebalanceLayoutsWithoutLeaves([ws], ["b"], leafList, build);
    expect(out).toHaveLength(1);
    expect(out[0].workspace).toBe(ws);
    expect(out[0].newLayout).toEqual(["a", "c"]);
  });

  it("returns an empty-leaves layout when all leaves are dead (does not skip)", () => {
    const ws = { id: "w1", layout: ["a", "b"] };
    const out = rebalanceLayoutsWithoutLeaves([ws], ["a", "b"], leafList, build);
    expect(out).toHaveLength(1);
    expect(out[0].newLayout).toEqual([]);
  });

  it("includes only workspaces with overlap", () => {
    const w1 = { id: "w1", layout: ["a", "b"] };
    const w2 = { id: "w2", layout: ["c", "d"] };
    const w3 = { id: "w3", layout: ["e", "b"] };
    const out = rebalanceLayoutsWithoutLeaves([w1, w2, w3], ["b"], leafList, build);
    expect(out.map((u) => u.workspace.id)).toEqual(["w1", "w3"]);
  });

  it("skips workspaces with null/undefined layout", () => {
    const wss = [
      { id: "w1", layout: null as unknown as string[] },
      { id: "w2", layout: ["a", "b"] },
    ];
    const out = rebalanceLayoutsWithoutLeaves(wss, ["a"], leafList, build);
    expect(out).toHaveLength(1);
    expect(out[0].workspace.id).toBe("w2");
  });

  it("accepts a Set of deadLeaves", () => {
    const ws = { id: "w1", layout: ["a", "b", "c"] };
    const out = rebalanceLayoutsWithoutLeaves([ws], new Set(["a", "c"]), leafList, build);
    expect(out[0].newLayout).toEqual(["b"]);
  });

  it("does not mutate the input layouts", () => {
    const ws = { id: "w1", layout: ["a", "b", "c"] };
    const before = [...ws.layout];
    rebalanceLayoutsWithoutLeaves([ws], ["b"], leafList, build);
    expect(ws.layout).toEqual(before);
  });
});
