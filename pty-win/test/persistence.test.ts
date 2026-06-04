import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadSavedCosts, loadCostHistory } from "../src/server/persistence.js";

describe("loadSavedCosts", () => {
  let scratch: string;
  beforeEach(() => { scratch = mkdtempSync(join(tmpdir(), "pty-win-costs-")); });
  afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });

  it("returns empty map when file does not exist", () => {
    expect(loadSavedCosts(join(scratch, "nope.json")).size).toBe(0);
  });

  it("loads numeric session costs", () => {
    const p = join(scratch, "costs.json");
    writeFileSync(p, JSON.stringify({ sessions: { foo: 1.5, bar: 0.25 } }));
    const m = loadSavedCosts(p);
    expect(m.get("foo")).toBe(1.5);
    expect(m.get("bar")).toBe(0.25);
    expect(m.size).toBe(2);
  });

  it("skips non-numeric cost entries", () => {
    const p = join(scratch, "costs.json");
    writeFileSync(p, JSON.stringify({ sessions: { foo: 1, bar: "nope", baz: null } }));
    const m = loadSavedCosts(p);
    expect(m.get("foo")).toBe(1);
    expect(m.has("bar")).toBe(false);
    expect(m.has("baz")).toBe(false);
  });

  it("returns empty map when sessions key is missing", () => {
    const p = join(scratch, "costs.json");
    writeFileSync(p, JSON.stringify({ other: "thing" }));
    expect(loadSavedCosts(p).size).toBe(0);
  });

  it("returns empty map on corrupt JSON without throwing", () => {
    const p = join(scratch, "costs.json");
    writeFileSync(p, "{not json");
    expect(loadSavedCosts(p).size).toBe(0);
  });

  it("returns empty map when sessions is not an object", () => {
    const p = join(scratch, "costs.json");
    writeFileSync(p, JSON.stringify({ sessions: "string-value" }));
    expect(loadSavedCosts(p).size).toBe(0);
  });
});

describe("loadCostHistory", () => {
  let scratch: string;
  beforeEach(() => { scratch = mkdtempSync(join(tmpdir(), "pty-win-cost-hist-")); });
  afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });

  it("returns empty array when file does not exist", () => {
    expect(loadCostHistory(join(scratch, "nope.json"), 100)).toEqual([]);
  });

  it("loads the array as-is when within cap", () => {
    const p = join(scratch, "h.json");
    const data = [{ ts: 1, cost: 0.1 }, { ts: 2, cost: 0.2 }];
    writeFileSync(p, JSON.stringify(data));
    expect(loadCostHistory(p, 100)).toEqual(data);
  });

  it("truncates to the last `max` samples", () => {
    const p = join(scratch, "h.json");
    const data = Array.from({ length: 50 }, (_, i) => ({ ts: i, cost: i / 10 }));
    writeFileSync(p, JSON.stringify(data));
    const out = loadCostHistory(p, 10);
    expect(out.length).toBe(10);
    expect(out[0]).toEqual({ ts: 40, cost: 4 });
    expect(out[9]).toEqual({ ts: 49, cost: 4.9 });
  });

  it("returns empty array on corrupt JSON", () => {
    const p = join(scratch, "h.json");
    writeFileSync(p, "{not json");
    expect(loadCostHistory(p, 100)).toEqual([]);
  });

  it("returns empty array when content is not an array", () => {
    const p = join(scratch, "h.json");
    writeFileSync(p, JSON.stringify({ samples: [] }));
    expect(loadCostHistory(p, 100)).toEqual([]);
  });
});
