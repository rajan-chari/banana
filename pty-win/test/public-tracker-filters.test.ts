// Tracker filter + sort — pure functions.
//
// Companion to tracker e0ca3757 / 8eb3a993 Phase 2.

import { describe, it, expect } from "vitest";
import {
  filterTrackerItems,
  sortTrackerItems,
  extractFilterOptions,
} from "../public/lib/tracker-filters.js";
import type { TrackerItem, TrackerFilters } from "../public/lib/tracker-filters.js";

const items: TrackerItem[] = [
  { id: "a", repo: "pty-win", number: 1, title: "Bravo", assigned_to: "moss", severity: "high",     labels: ["frontend", "perf"], created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-02T00:00:00Z", opened_by: "alice", responders: ["x", "y"] },
  { id: "b", repo: "pty-win", number: 2, title: "Alpha", assigned_to: "frost", severity: "normal", labels: ["backend"],          created_at: "2026-05-03T00:00:00Z", updated_at: "2026-05-04T00:00:00Z", opened_by: "bob",   responders: ["z"] },
  { id: "c", repo: "emcom",   number: 9, title: "Zeta",  assigned_to: "moss",  severity: "critical", labels: ["security"],       created_at: "2026-05-05T00:00:00Z", updated_at: "2026-05-06T00:00:00Z", opened_by: "carol", responders: [] },
  { id: "d", repo: "emcom",   number: 10, title: "Yankee", assigned_to: "frost", severity: "low",  labels: [],                   created_at: "2026-05-07T00:00:00Z", updated_at: "2026-05-08T00:00:00Z", opened_by: "dave",  responders: ["a", "b", "c"] },
];

describe("filterTrackerItems", () => {
  it("returns all items when filters are empty", () => {
    expect(filterTrackerItems(items, {}).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("filters by repo", () => {
    const out = filterTrackerItems(items, { repo: "pty-win" });
    expect(out.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("filters by severity", () => {
    expect(filterTrackerItems(items, { sev: "critical" }).map((i) => i.id)).toEqual(["c"]);
    expect(filterTrackerItems(items, { sev: "low" }).map((i) => i.id)).toEqual(["d"]);
  });

  it("filters by assignee", () => {
    expect(filterTrackerItems(items, { assignee: "moss" }).map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("filters by label category (must appear in labels[])", () => {
    expect(filterTrackerItems(items, { cat: "perf" }).map((i) => i.id)).toEqual(["a"]);
    expect(filterTrackerItems(items, { cat: "backend" }).map((i) => i.id)).toEqual(["b"]);
  });

  it("excludes items with missing labels[] when cat filter is set", () => {
    expect(filterTrackerItems(items, { cat: "anything" }).filter((i) => i.id === "d")).toHaveLength(0);
  });

  it("combines multiple filters as AND", () => {
    const out = filterTrackerItems(items, { repo: "pty-win", assignee: "moss" });
    expect(out.map((i) => i.id)).toEqual(["a"]);
  });

  it("empty string filter values are no-ops", () => {
    const filters: TrackerFilters = { repo: "", sev: "", assignee: "", cat: "" };
    expect(filterTrackerItems(items, filters)).toHaveLength(items.length);
  });

  it("does not mutate the input array", () => {
    const before = items.map((i) => i.id);
    filterTrackerItems(items, { repo: "pty-win" });
    expect(items.map((i) => i.id)).toEqual(before);
  });
});

describe("sortTrackerItems", () => {
  it("returns the input unchanged when field is 'status'", () => {
    expect(sortTrackerItems(items, "status", "asc")).toBe(items); // identity
  });

  it("does not mutate the input array", () => {
    const before = items.map((i) => i.id);
    sortTrackerItems(items, "title", "asc");
    expect(items.map((i) => i.id)).toEqual(before);
  });

  it("sorts by title asc / desc", () => {
    expect(sortTrackerItems(items, "title", "asc").map((i) => i.id)).toEqual(["b", "a", "d", "c"]);
    expect(sortTrackerItems(items, "title", "desc").map((i) => i.id)).toEqual(["c", "d", "a", "b"]);
  });

  it("sorts by ref using 'repo#number' lexicographic ordering", () => {
    const out = sortTrackerItems(items, "ref", "asc").map((i) => `${i.repo}#${i.number}`);
    expect(out).toEqual(["emcom#10", "emcom#9", "pty-win#1", "pty-win#2"]);
  });

  it("sorts by assignee", () => {
    expect(sortTrackerItems(items, "assignee", "asc").map((i) => i.assigned_to)).toEqual(["frost", "frost", "moss", "moss"]);
  });

  it("sorts by opened_by", () => {
    expect(sortTrackerItems(items, "opened_by", "asc").map((i) => i.opened_by)).toEqual(["alice", "bob", "carol", "dave"]);
  });

  it("sorts by responders joined string", () => {
    // joins: "x,y", "z", "", "a,b,c" -> asc: "", "a,b,c", "x,y", "z"
    const out = sortTrackerItems(items, "responders", "asc").map((i) => (i.responders || []).join(","));
    expect(out).toEqual(["", "a,b,c", "x,y", "z"]);
  });

  it("sorts by severity using sevOrder (critical < high < other)", () => {
    expect(sortTrackerItems(items, "severity", "asc").map((i) => i.severity))
      .toEqual(["critical", "high", "normal", "low"]);
  });

  it("sorts by age (created_at)", () => {
    expect(sortTrackerItems(items, "age", "asc").map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    expect(sortTrackerItems(items, "age", "desc").map((i) => i.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("sorts by updated_at", () => {
    expect(sortTrackerItems(items, "updated", "desc").map((i) => i.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("handles missing created_at / updated_at gracefully", () => {
    const noDates: TrackerItem[] = [
      { id: "x", repo: "r", number: 1 },
      { id: "y", repo: "r", number: 2 },
    ];
    expect(() => sortTrackerItems(noDates, "age", "asc")).not.toThrow();
    expect(() => sortTrackerItems(noDates, "updated", "asc")).not.toThrow();
  });
});

describe("extractFilterOptions", () => {
  it("returns sorted unique repos and assignees from the fixture", () => {
    const { repos, assignees } = extractFilterOptions(items);
    expect(repos).toEqual(["emcom", "pty-win"]);
    expect(assignees).toEqual(["frost", "moss"]);
  });

  it("returns empty arrays for empty input", () => {
    const out = extractFilterOptions([]);
    expect(out.repos).toEqual([]);
    expect(out.assignees).toEqual([]);
  });

  it("excludes falsy/empty repo and assigned_to values", () => {
    const it: TrackerItem[] = [
      { id: "1", repo: "", assigned_to: "" },
      { id: "2", repo: undefined as unknown as string, assigned_to: undefined as unknown as string },
      { id: "3", repo: "a", assigned_to: "x" },
    ];
    const { repos, assignees } = extractFilterOptions(it);
    expect(repos).toEqual(["a"]);
    expect(assignees).toEqual(["x"]);
  });

  it("dedupes repeated values", () => {
    const it: TrackerItem[] = [
      { id: "1", repo: "a", assigned_to: "x" },
      { id: "2", repo: "a", assigned_to: "x" },
      { id: "3", repo: "b", assigned_to: "y" },
      { id: "4", repo: "a", assigned_to: "x" },
    ];
    const { repos, assignees } = extractFilterOptions(it);
    expect(repos).toEqual(["a", "b"]);
    expect(assignees).toEqual(["x", "y"]);
  });

  it("sorts results case-sensitively (matches default String.sort)", () => {
    const it: TrackerItem[] = [
      { id: "1", repo: "Beta", assigned_to: "Zoe" },
      { id: "2", repo: "alpha", assigned_to: "alice" },
    ];
    // default sort puts uppercase before lowercase
    expect(extractFilterOptions(it).repos).toEqual(["Beta", "alpha"]);
    expect(extractFilterOptions(it).assignees).toEqual(["Zoe", "alice"]);
  });
});
