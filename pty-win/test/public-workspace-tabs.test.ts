// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { reorderWorkspaces, tabDropSide } from "../public/lib/workspace-tabs.js";

describe("tabDropSide", () => {
  const rect = { left: 100, width: 80 };
  // midpoint: 100 + 40 = 140

  it("returns 'left' when clientX is strictly less than midpoint", () => {
    expect(tabDropSide(rect, 100)).toBe("left");
    expect(tabDropSide(rect, 139)).toBe("left");
    expect(tabDropSide(rect, 0)).toBe("left");
  });

  it("returns 'right' when clientX is at or after midpoint", () => {
    expect(tabDropSide(rect, 140)).toBe("right");
    expect(tabDropSide(rect, 141)).toBe("right");
    expect(tabDropSide(rect, 180)).toBe("right");
  });

  it("handles zero-width rects deterministically", () => {
    expect(tabDropSide({ left: 50, width: 0 }, 50)).toBe("right");
    expect(tabDropSide({ left: 50, width: 0 }, 49)).toBe("left");
  });

  it("handles fractional midpoints", () => {
    expect(tabDropSide({ left: 0, width: 3 }, 1)).toBe("left"); // mid 1.5, 1 < 1.5
    expect(tabDropSide({ left: 0, width: 3 }, 2)).toBe("right");
  });
});

describe("reorderWorkspaces", () => {
  const list = () => [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
    { id: "d", name: "D" },
  ];

  it("moves source LEFT of target with side='left'", () => {
    const out = reorderWorkspaces(list(), "d", "b", "left");
    expect(out.map((w) => w.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("moves source RIGHT of target with side='right'", () => {
    const out = reorderWorkspaces(list(), "a", "c", "right");
    expect(out.map((w) => w.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("forward move with side='left' lands just before target", () => {
    const out = reorderWorkspaces(list(), "a", "d", "left");
    expect(out.map((w) => w.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("forward move with side='right' lands just after target", () => {
    const out = reorderWorkspaces(list(), "a", "c", "right");
    expect(out.map((w) => w.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("does not mutate input array", () => {
    const before = list();
    const frozen = JSON.stringify(before);
    reorderWorkspaces(before, "a", "d", "right");
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it("returns a copy unchanged when srcId === tgtId", () => {
    const before = list();
    const out = reorderWorkspaces(before, "b", "b", "left");
    expect(out.map((w) => w.id)).toEqual(["a", "b", "c", "d"]);
    expect(out).not.toBe(before);
  });

  it("returns array without the source removed when target id is missing", () => {
    const out = reorderWorkspaces(list(), "a", "z", "right");
    expect(out.map((w) => w.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("returns input copy when source id is missing", () => {
    const out = reorderWorkspaces(list(), "z", "b", "right");
    expect(out.map((w) => w.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("handles two-item list correctly", () => {
    const out = reorderWorkspaces([{ id: "a" }, { id: "b" }], "b", "a", "left");
    expect(out.map((w) => w.id)).toEqual(["b", "a"]);
  });
});
