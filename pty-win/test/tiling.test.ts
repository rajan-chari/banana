import { describe, it, expect } from "vitest";
import {
  buildBalancedTree,
  removeSessionFromLayout,
  appendLeafToTree,
  getLeafList,
  treeContains,
  countLeaves,
  insertAdjacentToPane,
  type TileNode,
  type LeafNode,
} from "../src/tiling.js";

// Helpers
const leaf = (s: string): LeafNode => ({ type: "leaf", session: s });

describe("buildBalancedTree", () => {
  it("returns null for empty array", () => {
    expect(buildBalancedTree([])).toBeNull();
  });

  it("returns a leaf for single session", () => {
    expect(buildBalancedTree(["a"])).toEqual(leaf("a"));
  });

  it("returns horizontal split for 2 sessions", () => {
    const tree = buildBalancedTree(["a", "b"])!;
    expect(tree.type).toBe("split");
    expect(tree.direction).toBe("h");
    expect(getLeafList(tree)).toEqual(["a", "b"]);
  });

  it("returns vertical split for 3+ sessions", () => {
    const tree = buildBalancedTree(["a", "b", "c"])!;
    expect(tree.type).toBe("split");
    expect(tree.direction).toBe("v");
    expect(getLeafList(tree)).toEqual(["a", "b", "c"]);
  });

  it("preserves all sessions for large input", () => {
    const names = ["a", "b", "c", "d", "e", "f", "g"];
    const tree = buildBalancedTree(names)!;
    expect(getLeafList(tree).sort()).toEqual(names.sort());
    expect(countLeaves(tree)).toBe(7);
  });

  it("ratio reflects balanced split", () => {
    const tree = buildBalancedTree(["a", "b"]) as any;
    expect(tree.ratio).toBe(0.5);
  });
});

describe("getLeafList", () => {
  it("returns empty for null", () => {
    expect(getLeafList(null)).toEqual([]);
  });

  it("returns single session for leaf", () => {
    expect(getLeafList(leaf("x"))).toEqual(["x"]);
  });

  it("returns all sessions in order", () => {
    const tree = buildBalancedTree(["a", "b", "c", "d"])!;
    // All names present (order depends on tree shape)
    expect(getLeafList(tree).sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("treeContains", () => {
  it("finds session in leaf", () => {
    expect(treeContains(leaf("a"), "a")).toBe(true);
  });

  it("does not find missing session in leaf", () => {
    expect(treeContains(leaf("a"), "b")).toBe(false);
  });

  it("finds session deep in tree", () => {
    const tree = buildBalancedTree(["a", "b", "c", "d", "e"])!;
    expect(treeContains(tree, "e")).toBe(true);
    expect(treeContains(tree, "a")).toBe(true);
  });

  it("returns false for absent session", () => {
    const tree = buildBalancedTree(["a", "b", "c"])!;
    expect(treeContains(tree, "z")).toBe(false);
  });
});

describe("countLeaves", () => {
  it("counts 1 for leaf", () => {
    expect(countLeaves(leaf("a"))).toBe(1);
  });

  it("counts correctly for balanced tree", () => {
    expect(countLeaves(buildBalancedTree(["a", "b", "c", "d"])!)).toBe(4);
  });
});

describe("removeSessionFromLayout", () => {
  it("returns null when removing only leaf", () => {
    expect(removeSessionFromLayout(leaf("a"), "a")).toBeNull();
  });

  it("leaves unrelated leaf untouched", () => {
    expect(removeSessionFromLayout(leaf("a"), "b")).toEqual(leaf("a"));
  });

  it("returns null for null input", () => {
    expect(removeSessionFromLayout(null, "a")).toBeNull();
  });

  it("collapses to sibling when removing from 2-node tree", () => {
    const tree = buildBalancedTree(["a", "b"])!;
    const result = removeSessionFromLayout(tree, "a");
    expect(result).toEqual(leaf("b"));
  });

  it("preserves remaining sessions in larger tree", () => {
    const tree = buildBalancedTree(["a", "b", "c", "d"])!;
    const result = removeSessionFromLayout(tree, "b")!;
    const remaining = getLeafList(result);
    expect(remaining.sort()).toEqual(["a", "c", "d"]);
    expect(treeContains(result, "b")).toBe(false);
  });

  it("can remove all sessions one by one", () => {
    let tree: TileNode | null = buildBalancedTree(["a", "b", "c"])!;
    tree = removeSessionFromLayout(tree, "a");
    expect(tree).not.toBeNull();
    tree = removeSessionFromLayout(tree!, "b");
    expect(tree).not.toBeNull();
    tree = removeSessionFromLayout(tree!, "c");
    expect(tree).toBeNull();
  });

  it("does not corrupt tree when removing non-existent session", () => {
    const tree = buildBalancedTree(["a", "b", "c"])!;
    const result = removeSessionFromLayout(tree, "z")!;
    expect(getLeafList(result).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("appendLeafToTree", () => {
  it("splits leaf into horizontal pair", () => {
    const result = appendLeafToTree(leaf("a"), leaf("b"));
    expect(result.type).toBe("split");
    expect(result.direction).toBe("h");
    expect(getLeafList(result)).toEqual(["a", "b"]);
  });

  it("appends to trailing edge of split", () => {
    const tree = buildBalancedTree(["a", "b"])!;
    const result = appendLeafToTree(tree, leaf("c"));
    expect(getLeafList(result)).toContain("c");
    expect(countLeaves(result)).toBe(3);
    // "a" should still be the leftmost
    expect(getLeafList(result)[0]).toBe("a");
  });

  it("appended session is always last in leaf list", () => {
    let tree: TileNode = leaf("a");
    tree = appendLeafToTree(tree, leaf("b"));
    tree = appendLeafToTree(tree, leaf("c"));
    tree = appendLeafToTree(tree, leaf("d"));
    const leaves = getLeafList(tree);
    expect(leaves).toEqual(["a", "b", "c", "d"]);
  });
});

describe("insertAdjacentToPane", () => {
  it("returns null for null input", () => {
    expect(insertAdjacentToPane(null, "a", "b", "right")).toBeNull();
  });

  it("inserts right of target leaf", () => {
    const result = insertAdjacentToPane(leaf("a"), "a", "b", "right")!;
    expect(result.type).toBe("split");
    expect(result.direction).toBe("h");
    expect(getLeafList(result)).toEqual(["a", "b"]);
  });

  it("inserts left of target leaf", () => {
    const result = insertAdjacentToPane(leaf("a"), "a", "b", "left")!;
    expect(result.type).toBe("split");
    expect(result.direction).toBe("h");
    expect(getLeafList(result)).toEqual(["b", "a"]);
  });

  it("inserts below target leaf", () => {
    const result = insertAdjacentToPane(leaf("a"), "a", "b", "bottom")!;
    expect(result.type).toBe("split");
    expect(result.direction).toBe("v");
    expect(getLeafList(result)).toEqual(["a", "b"]);
  });

  it("inserts above target leaf", () => {
    const result = insertAdjacentToPane(leaf("a"), "a", "b", "top")!;
    expect(result.type).toBe("split");
    expect(result.direction).toBe("v");
    expect(getLeafList(result)).toEqual(["b", "a"]);
  });

  it("leaves non-target leaves untouched", () => {
    const result = insertAdjacentToPane(leaf("a"), "z", "b", "right");
    expect(result).toEqual(leaf("a"));
  });

  it("inserts deep in tree next to correct target", () => {
    const tree = buildBalancedTree(["a", "b", "c"])!;
    const result = insertAdjacentToPane(tree, "c", "x", "right")!;
    const leaves = getLeafList(result);
    expect(leaves).toContain("x");
    expect(leaves).toContain("a");
    expect(leaves).toContain("b");
    expect(leaves).toContain("c");
    expect(countLeaves(result)).toBe(4);
  });
});
