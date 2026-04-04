import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ScreenDetector, type PromptType } from "./screen-detector.js";

vi.mock("../log.js", () => ({ log: vi.fn() }));

// Helper: write to detector and wait for xterm to process the data
function writeAndFlush(detector: ScreenDetector, data: string): Promise<void> {
  return new Promise<void>((resolve) => {
    // Access internal terminal to use write callback
    const terminal = (detector as any).terminal;
    terminal.write(data, () => resolve());
  });
}

// Helper: set screen content by writing lines at the bottom of the viewport
async function setScreen(detector: ScreenDetector, lines: string[]): Promise<void> {
  // Clear screen and move cursor to top
  await writeAndFlush(detector, "\x1b[2J\x1b[H");
  // Write blank lines to fill viewport except for content
  const rows = (detector as any).terminal.rows;
  const blankCount = rows - lines.length;
  for (let i = 0; i < blankCount; i++) {
    await writeAndFlush(detector, "\r\n");
  }
  // Write content lines
  for (let i = 0; i < lines.length; i++) {
    await writeAndFlush(detector, lines[i]);
    if (i < lines.length - 1) await writeAndFlush(detector, "\r\n");
  }
}

describe("ScreenDetector — prompt detection", () => {
  let detector: ScreenDetector;

  beforeEach(() => {
    detector = new ScreenDetector(120, 40, "test");
  });

  afterEach(() => {
    detector.dispose();
  });

  // --- Input prompt patterns ---

  it("detects ❯ input prompt", async () => {
    await setScreen(detector, ["Some previous output", "❯ "]);
    expect(detector.detectPromptType()).toBe("input");
  });

  it("detects > input prompt", async () => {
    await setScreen(detector, ["Some previous output", "> "]);
    expect(detector.detectPromptType()).toBe("input");
  });

  it("detects bare ❯ with no trailing space", async () => {
    await setScreen(detector, ["Previous line", "❯"]);
    expect(detector.detectPromptType()).toBe("input");
  });

  // --- Busy animation patterns ---

  it("detects busy animation with duration and tokens", async () => {
    await setScreen(detector, ["※ Zigzagging… (1m 8s · ↑ 1.4k tokens)"]);
    expect(detector.detectPromptType()).toBe("busy");
  });

  it("detects busy animation with thinking label", async () => {
    await setScreen(detector, ["※ Perusing… (thinking with high effort)"]);
    expect(detector.detectPromptType()).toBe("busy");
  });

  it("detects busy animation with short duration", async () => {
    await setScreen(detector, ["* Brewing… (4s)"]);
    expect(detector.detectPromptType()).toBe("busy");
  });

  it("detects busy animation with emoji prefix", async () => {
    await setScreen(detector, ["🔄 Reading… (2m 30s · ↑ 500 tokens)"]);
    expect(detector.detectPromptType()).toBe("busy");
  });

  // --- Permission prompt patterns ---

  it("detects Allow/Deny permission prompt", async () => {
    await setScreen(detector, [
      "Claude wants to run: git status",
      "Allow this action? (y/n)",
    ]);
    expect(detector.detectPromptType()).toBe("permission");
  });

  it("detects permission prompt with Allow keyword", async () => {
    await setScreen(detector, [
      "Allow Claude to edit file.ts?",
      "Yes  No",
    ]);
    expect(detector.detectPromptType()).toBe("permission");
  });

  // --- Status bar filtering ---

  it("skips status bar lines and finds input prompt above", async () => {
    await setScreen(detector, [
      "❯ ",
      "▸▸ accept edits on (shift+tab to cycle)",
      " @pine  $3.69",
    ]);
    expect(detector.detectPromptType()).toBe("input");
  });

  it("skips status bar with shift+tab", async () => {
    await setScreen(detector, [
      "Some output",
      "❯",
      "  shift+tab to cycle modes",
    ]);
    expect(detector.detectPromptType()).toBe("input");
  });

  // --- Unknown / edge cases ---

  it("returns unknown for plain text content", async () => {
    await setScreen(detector, [
      "Here is the analysis of the code:",
      "The function does X and Y.",
    ]);
    expect(detector.detectPromptType()).toBe("unknown");
  });

  it("returns unknown for empty screen", () => {
    const fresh = new ScreenDetector(120, 40, "test-empty");
    expect(fresh.detectPromptType()).toBe("unknown");
    fresh.dispose();
  });

  // --- Busy takes priority over input prompt ---

  it("busy animation overrides input prompt in content lines", async () => {
    await setScreen(detector, [
      "❯ ",
      "※ Analyzing… (5s · ↑ 200 tokens)",
    ]);
    expect(detector.detectPromptType()).toBe("busy");
  });
});

describe("ScreenDetector — snapshot", () => {
  it("returns full viewport text", async () => {
    const detector = new ScreenDetector(40, 5, "test-snap");
    await writeAndFlush(detector, "Hello\r\nWorld\r\n");
    const snap = detector.snapshot();
    expect(snap).toContain("Hello");
    expect(snap).toContain("World");
    detector.dispose();
  });

  it("updates on resize", async () => {
    const detector = new ScreenDetector(80, 24, "test-resize");
    detector.resize(120, 40);
    await writeAndFlush(detector, "Test\r\n");
    expect(detector.snapshot()).toContain("Test");
    detector.dispose();
  });
});
