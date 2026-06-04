import { describe, it, expect } from "vitest";
import { STRIP_ALT_SCREEN_COMMANDS, stripTuiOwnership } from "../src/session.js";

describe("stripTuiOwnership", () => {
  it("strips alt-screen enter and exit (DECSET 1049)", () => {
    expect(stripTuiOwnership("\x1b[?1049h")).toBe("");
    expect(stripTuiOwnership("\x1b[?1049l")).toBe("");
    expect(stripTuiOwnership("before\x1b[?1049hafter")).toBe("beforeafter");
  });

  it("strips legacy alt-screen variants", () => {
    expect(stripTuiOwnership("\x1b[?47h\x1b[?47l")).toBe("");
    expect(stripTuiOwnership("\x1b[?1047h\x1b[?1048h\x1b[?1047l\x1b[?1048l")).toBe("");
  });

  it("strips mouse tracking modes (1000/1002/1003/1006/1015)", () => {
    expect(stripTuiOwnership("\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h\x1b[?1015h")).toBe("");
    expect(stripTuiOwnership("\x1b[?1002l\x1b[?1006l")).toBe("");
  });

  it("preserves unrelated CSI sequences", () => {
    const input = "\x1b[H\x1b[2J\x1b[31mred\x1b[0m\x1b[?25l\x1b[?25h";
    expect(stripTuiOwnership(input)).toBe(input);
  });

  it("preserves focus tracking 1004 and bracketed-paste 2004 (apps still want them)", () => {
    const input = "\x1b[?1004h\x1b[?2004h";
    expect(stripTuiOwnership(input)).toBe(input);
  });

  it("preserves plain text", () => {
    expect(stripTuiOwnership("hello world")).toBe("hello world");
    expect(stripTuiOwnership("")).toBe("");
  });

  it("handles a realistic copilot startup chunk", () => {
    const chunk = "\x1b[?9001h\x1b[?1004h\x1b[?25l\x1b[2J\x1b[m\x1b[H" +
      "Welcome\x1b[?1049h\x1b[?1002h\x1b[?1006h\x1b[?25l[Session] Issues";
    const out = stripTuiOwnership(chunk);
    expect(out).not.toContain("\x1b[?1049h");
    expect(out).not.toContain("\x1b[?1002h");
    expect(out).not.toContain("\x1b[?1006h");
    expect(out).toContain("Welcome");
    expect(out).toContain("[Session] Issues");
    expect(out).toContain("\x1b[?1004h");
  });
});

describe("STRIP_ALT_SCREEN_COMMANDS", () => {
  it("targets copilot and agency cp", () => {
    expect(STRIP_ALT_SCREEN_COMMANDS).toContain("copilot");
    expect(STRIP_ALT_SCREEN_COMMANDS).toContain("agency cp");
  });

  it("does not target claude (uses normal buffer natively)", () => {
    expect(STRIP_ALT_SCREEN_COMMANDS).not.toContain("claude");
    expect(STRIP_ALT_SCREEN_COMMANDS).not.toContain("agency cc");
  });
});
