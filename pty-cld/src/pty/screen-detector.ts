import { Terminal } from "@xterm/headless";
import { log } from "../log.js";

export type PromptType = "input" | "permission" | "unknown";

// Claude Code prompt patterns
const INPUT_PROMPT_RE = /[❯>$]\s*$/;
const PERMISSION_PROMPT_RE = /allow|permission|approve|deny|y\/n|yes.*no/i;

export class ScreenDetector {
  private terminal: Terminal;
  private sessionName: string;

  constructor(cols: number, rows: number, sessionName: string) {
    this.sessionName = sessionName;
    this.terminal = new Terminal({
      cols,
      rows,
      scrollback: 200,
      allowProposedApi: true,
    });
  }

  /** Feed raw PTY output into the headless terminal */
  write(data: string): void {
    this.terminal.write(data);
  }

  /** Resize the headless terminal (must stay in sync with node-pty) */
  resize(cols: number, rows: number): void {
    this.terminal.resize(cols, rows);
  }

  /**
   * Read the rendered screen and determine what kind of prompt is showing.
   * Call this when output has gone quiet to decide if injection is safe.
   */
  detectPromptType(): PromptType {
    const buf = this.terminal.buffer.active;
    // Read from cursor line upward to find the last non-empty line
    const lastLines = this.getLastNonEmptyLines(3);
    const joined = lastLines.join(" ");

    if (PERMISSION_PROMPT_RE.test(joined)) {
      log(`[${this.sessionName}] Screen: permission prompt detected`);
      return "permission";
    }

    // Check the very last non-empty line for an input prompt char
    const lastLine = lastLines[lastLines.length - 1] ?? "";
    if (INPUT_PROMPT_RE.test(lastLine)) {
      log(`[${this.sessionName}] Screen: input prompt detected`);
      return "input";
    }

    log(`[${this.sessionName}] Screen: unknown (last line: "${lastLine.slice(-60)}")`);
    return "unknown";
  }

  /** Get the last N non-empty rendered lines from the viewport */
  private getLastNonEmptyLines(n: number): string[] {
    const buf = this.terminal.buffer.active;
    const lines: string[] = [];

    // Scan from cursor position upward
    for (let y = buf.cursorY; y >= 0 && lines.length < n; y--) {
      const line = buf.getLine(buf.baseY + y);
      if (line) {
        const text = line.translateToString(true);
        if (text.trim().length > 0) {
          lines.unshift(text);
        }
      }
    }
    return lines;
  }

  /** Get a full text snapshot of the visible viewport (for debugging) */
  snapshot(): string {
    const buf = this.terminal.buffer.active;
    const lines: string[] = [];
    for (let y = 0; y < this.terminal.rows; y++) {
      const line = buf.getLine(buf.viewportY + y);
      lines.push(line ? line.translateToString(true) : "");
    }
    return lines.join("\n");
  }

  dispose(): void {
    this.terminal.dispose();
  }
}
