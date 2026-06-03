// Pure helpers — no DOM needed. Default node environment.
//
// Companion to tracker e0ca3757 / 8eb3a993 Phase 2.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normPath,
  cssId,
  truncatePath,
  fmtAge,
  fmtAgo,
  staleClass,
  fmtDate,
  sevOrder,
} from "../public/lib/format.js";

describe("normPath", () => {
  it("lowercases and converts backslashes to forward slashes", () => {
    expect(normPath("C:\\Users\\Foo")).toBe("c:/users/foo");
  });
  it("leaves already-normalized paths unchanged (other than case)", () => {
    expect(normPath("/Home/User")).toBe("/home/user");
  });
  it("returns empty string for null/undefined/empty", () => {
    expect(normPath(null)).toBe("");
    expect(normPath(undefined)).toBe("");
    expect(normPath("")).toBe("");
  });
});

describe("cssId", () => {
  it("replaces non-alphanumeric chars with underscores", () => {
    expect(cssId("C:/Users/foo.bar-baz")).toBe("C__Users_foo_bar_baz");
  });
  it("leaves bare alphanumerics unchanged", () => {
    expect(cssId("abc123")).toBe("abc123");
  });
  it("handles empty string", () => {
    expect(cssId("")).toBe("");
  });
});

describe("truncatePath", () => {
  it("returns empty string for falsy input", () => {
    expect(truncatePath("")).toBe("");
    expect(truncatePath(null)).toBe("");
    expect(truncatePath(undefined)).toBe("");
  });
  it("returns the path unchanged when 3 or fewer segments", () => {
    expect(truncatePath("a/b")).toBe("a/b");
    expect(truncatePath("a/b/c")).toBe("a/b/c");
  });
  it("truncates to last two segments when more than 3", () => {
    expect(truncatePath("a/b/c/d")).toBe(".../c/d");
    expect(truncatePath("/x/y/z/w")).toBe(".../z/w");
  });
  it("normalizes backslashes before counting segments", () => {
    expect(truncatePath("C:\\foo\\bar\\baz")).toBe(".../bar/baz");
  });
});

// ---------- Time-dependent helpers ----------

const NOW = new Date("2026-06-03T12:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fmtAge", () => {
  it("returns '-' for falsy input", () => {
    expect(fmtAge(null)).toBe("-");
    expect(fmtAge(undefined)).toBe("-");
    expect(fmtAge("")).toBe("-");
  });
  it("uses minutes when under one hour", () => {
    const ts = new Date(NOW - 30 * 60_000).toISOString();
    expect(fmtAge(ts)).toBe("30m");
  });
  it("uses hours when 1-23 hours old", () => {
    const ts = new Date(NOW - 5 * 3_600_000).toISOString();
    expect(fmtAge(ts)).toBe("5h");
  });
  it("uses days when 24+ hours old", () => {
    const ts = new Date(NOW - 3 * 86_400_000).toISOString();
    expect(fmtAge(ts)).toBe("3d");
  });
  it("rounds down at boundaries", () => {
    // 59 minutes -> still minutes
    expect(fmtAge(new Date(NOW - 59 * 60_000).toISOString())).toBe("59m");
    // 60 minutes -> 1h
    expect(fmtAge(new Date(NOW - 60 * 60_000).toISOString())).toBe("1h");
    // 23h59m -> 23h, 24h -> 1d
    expect(fmtAge(new Date(NOW - (24 * 3_600_000 - 1)).toISOString())).toBe("23h");
    expect(fmtAge(new Date(NOW - 24 * 3_600_000).toISOString())).toBe("1d");
  });
});

describe("fmtAgo", () => {
  it("returns '-' for falsy input", () => {
    expect(fmtAgo(null)).toBe("-");
    expect(fmtAgo(undefined)).toBe("-");
    expect(fmtAgo(0)).toBe("-");
  });
  it("seconds for <60s", () => {
    expect(fmtAgo(NOW - 5_000)).toBe("5s");
    expect(fmtAgo(NOW - 59_000)).toBe("59s");
  });
  it("minutes for <60m", () => {
    expect(fmtAgo(NOW - 60_000)).toBe("1m");
    expect(fmtAgo(NOW - 45 * 60_000)).toBe("45m");
  });
  it("'NhMm' for 1h+", () => {
    expect(fmtAgo(NOW - (2 * 3_600_000 + 15 * 60_000))).toBe("2h15m");
    expect(fmtAgo(NOW - 3_600_000)).toBe("1h0m");
  });
});

describe("staleClass", () => {
  it("returns stale-green for missing date", () => {
    expect(staleClass(null)).toBe("stale-green");
    expect(staleClass(undefined)).toBe("stale-green");
    expect(staleClass("")).toBe("stale-green");
  });
  it("stale-green when <= 3 days", () => {
    expect(staleClass(new Date(NOW - 2 * 86_400_000).toISOString())).toBe("stale-green");
    expect(staleClass(new Date(NOW - 3 * 86_400_000).toISOString())).toBe("stale-green");
  });
  it("stale-yellow for 3 < days <= 7", () => {
    expect(staleClass(new Date(NOW - 5 * 86_400_000).toISOString())).toBe("stale-yellow");
    expect(staleClass(new Date(NOW - 7 * 86_400_000).toISOString())).toBe("stale-yellow");
  });
  it("stale-red for > 7 days", () => {
    expect(staleClass(new Date(NOW - 8 * 86_400_000).toISOString())).toBe("stale-red");
    expect(staleClass(new Date(NOW - 30 * 86_400_000).toISOString())).toBe("stale-red");
  });
});

describe("fmtDate", () => {
  it("returns '-' for falsy input", () => {
    expect(fmtDate(null)).toBe("-");
    expect(fmtDate(undefined)).toBe("-");
    expect(fmtDate("")).toBe("-");
  });
  it("formats as MM/DD with zero-padding", () => {
    // Using full ISO date avoids per-host TZ inference; getMonth/getDate are local.
    const d = new Date(2026, 0, 5); // Jan 5
    expect(fmtDate(d.toISOString())).toBe("01/05");
  });
  it("pads single-digit days and months", () => {
    const d = new Date(2026, 8, 9); // Sep 9
    expect(fmtDate(d.toISOString())).toBe("09/09");
  });
});

describe("sevOrder", () => {
  it("ranks critical first, high second, everything else last", () => {
    expect(sevOrder("critical")).toBe(0);
    expect(sevOrder("high")).toBe(1);
    expect(sevOrder("normal")).toBe(2);
    expect(sevOrder("low")).toBe(2);
    expect(sevOrder("")).toBe(2);
    expect(sevOrder(null)).toBe(2);
    expect(sevOrder(undefined)).toBe(2);
  });
});
