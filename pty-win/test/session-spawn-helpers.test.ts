import { describe, expect, it } from "vitest";
import {
  appendRawBuffer,
  buildSpawnPlan,
  extractCost,
  trackModeEscapes,
} from "../src/session-spawn-helpers.js";

describe("buildSpawnPlan", () => {
  const baseCfg = { command: "claude", args: ["--foo"], workingDir: "/w" } as const;

  it("uses cmd.exe with /c on win32", () => {
    const p = buildSpawnPlan({ ...baseCfg }, "preamble", "win32");
    expect(p.shell).toBe("cmd.exe");
    expect(p.shellArgs[0]).toBe("/c");
    expect(p.shellArgs).toContain("claude");
    expect(p.shellArgs).toContain("--foo");
  });

  it("uses /bin/sh -c with quoted args on linux", () => {
    const p = buildSpawnPlan({ ...baseCfg }, "preamble", "linux");
    expect(p.shell).toBe("/bin/sh");
    expect(p.shellArgs[0]).toBe("-c");
    expect(p.shellArgs[1]).toContain("claude");
    expect(p.shellArgs[1]).toContain("'--foo'");
  });

  it("injects --append-system-prompt only when emcom is configured AND command supports it", () => {
    const withEmcom = buildSpawnPlan({
      ...baseCfg,
      emcomIdentity: "id",
      emcomServer: "http://x",
    }, "PREAMBLE", "win32");
    expect(withEmcom.shellArgs).toContain("--append-system-prompt");
    expect(withEmcom.shellArgs).toContain("PREAMBLE");

    const noEmcom = buildSpawnPlan({ ...baseCfg }, "PREAMBLE", "win32");
    expect(noEmcom.shellArgs).not.toContain("--append-system-prompt");
  });

  it("does NOT inject preamble for copilot even when emcom is set", () => {
    const p = buildSpawnPlan({
      command: "copilot",
      args: [],
      workingDir: "/w",
      emcomIdentity: "id",
      emcomServer: "http://x",
    }, "PREAMBLE", "win32");
    expect(p.shellArgs).not.toContain("--append-system-prompt");
  });

  it("flags isClaude for known AI commands and hasWorkingHooks for the hook-trusted subset", () => {
    expect(buildSpawnPlan({ ...baseCfg, command: "claude" }, "", "linux").isClaude).toBe(true);
    expect(buildSpawnPlan({ ...baseCfg, command: "claude" }, "", "linux").hasWorkingHooks).toBe(true);
    expect(buildSpawnPlan({ ...baseCfg, command: "copilot" }, "", "linux").isClaude).toBe(true);
    expect(buildSpawnPlan({ ...baseCfg, command: "copilot" }, "", "linux").hasWorkingHooks).toBe(false);
    expect(buildSpawnPlan({ ...baseCfg, command: "bash" }, "", "linux").isClaude).toBe(false);
  });

  it("defaults cols=120 and rows=40 when omitted", () => {
    const p = buildSpawnPlan({ ...baseCfg }, "", "linux");
    expect(p.cols).toBe(120);
    expect(p.rows).toBe(40);
  });

  it("respects explicit cols/rows", () => {
    const p = buildSpawnPlan({ ...baseCfg, cols: 200, rows: 60 }, "", "linux");
    expect(p.cols).toBe(200);
    expect(p.rows).toBe(60);
  });

  it("falls back to defaults when cols/rows are 0 (falsy)", () => {
    const p = buildSpawnPlan({ ...baseCfg, cols: 0, rows: 0 }, "", "linux");
    expect(p.cols).toBe(120);
    expect(p.rows).toBe(40);
  });

  it("splits multi-word commands on whitespace for win32 cmd args", () => {
    const p = buildSpawnPlan({
      ...baseCfg,
      command: "agency cc",
    }, "", "win32");
    expect(p.shellArgs).toEqual(expect.arrayContaining(["/c", "agency", "cc", "--foo"]));
  });
});

describe("extractCost", () => {
  it("returns null when no cost pattern is present", () => {
    expect(extractCost("nothing here")).toBeNull();
  });

  it("extracts live status-bar cost", () => {
    expect(extractCost("$9.97 2m34s | foo")).toBe(9.97);
    expect(extractCost("$0.50 553ms remaining")).toBe(0.5);
  });

  it("extracts exit summary cost", () => {
    expect(extractCost("Total cost:   $1.23\n")).toBe(1.23);
  });

  it("prefers exit summary over live bar when both are present", () => {
    expect(extractCost("Total cost: $5.00\n$1.00 0m1s")).toBe(5);
  });
});

describe("appendRawBuffer", () => {
  it("appends when total stays under cap", () => {
    expect(appendRawBuffer("abc", "def", 10)).toBe("abcdef");
  });

  it("truncates from the left to keep only the last maxBytes", () => {
    expect(appendRawBuffer("abcdef", "ghij", 5)).toBe("fghij");
  });

  it("equal-length boundary is not truncated", () => {
    expect(appendRawBuffer("abc", "de", 5)).toBe("abcde");
  });

  it("handles empty inputs", () => {
    expect(appendRawBuffer("", "", 10)).toBe("");
    expect(appendRawBuffer("abc", "", 10)).toBe("abc");
    expect(appendRawBuffer("", "abc", 10)).toBe("abc");
  });
});

describe("trackModeEscapes", () => {
  // eslint-disable-next-line no-control-regex
  const RE = /\x1b\[\?(1049|1047|1047|47|1002|1003|1006|1015|1000|1004|2004)([hl])/g;

  it("records mode enable (h) and disable (l) into the map", () => {
    const state = new Map<string, "h" | "l">();
    trackModeEscapes("\x1b[?1049h prompt \x1b[?1000h", state, new RegExp(RE.source, "g"));
    expect(state.get("1049")).toBe("h");
    expect(state.get("1000")).toBe("h");
  });

  it("updates a previously seen mode to its new state", () => {
    const state = new Map<string, "h" | "l">();
    const re = new RegExp(RE.source, "g");
    trackModeEscapes("\x1b[?1049h", state, re);
    trackModeEscapes("\x1b[?1049l", state, re);
    expect(state.get("1049")).toBe("l");
  });

  it("ignores chunks with no tracked modes", () => {
    const state = new Map<string, "h" | "l">();
    trackModeEscapes("plain text\nno escapes here", state, new RegExp(RE.source, "g"));
    expect(state.size).toBe(0);
  });

  it("resets regex lastIndex so /g state from a prior call does not skip matches", () => {
    const re = new RegExp(RE.source, "g");
    re.lastIndex = 999;
    const state = new Map<string, "h" | "l">();
    trackModeEscapes("\x1b[?2004h", state, re);
    expect(state.get("2004")).toBe("h");
  });
});
