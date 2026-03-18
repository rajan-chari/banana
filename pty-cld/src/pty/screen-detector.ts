import { Terminal } from "@xterm/headless";
import { log } from "../log.js";

export type PromptType = "input" | "permission" | "busy" | "unknown";

// Claude Code UI patterns (observed from screenshots)
//
// Busy:   "* Transmuting… (44s · ↓ 340 tokens)"  — animated, constantly rewriting
// Done:   "※ Sautéed for 2m 32s"                  — static completion line
// Idle:   "> " or "❯ " at line start               — input prompt, cursor waiting
//
// The cooking verbs rotate: Transmuting, Simmering, Sautéing, Brewing, etc.
// The completion marker is always ※ (reference mark).

const INPUT_PROMPT_RE = /^[❯>]\s*$/;
const PERMISSION_PROMPT_RE = /allow|permission|approve|deny|y\/n|yes.*no/i;
const BUSY_ANIMATION_RE = /^\s*\*\s+\S+…\s+\(/;  // "* Transmuting… ("
const COMPLETION_RE = /^※\s+/;                     // "※ Sautéed for"

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
    const lastLines = this.getLastNonEmptyLines(5);

    // Check all recent lines for patterns — order matters
    for (const line of lastLines) {
      // Animated busy line: "* Transmuting… (44s · ↓ 340 tokens)"
      if (BUSY_ANIMATION_RE.test(line)) {
        log(`[${this.sessionName}] Screen: busy animation detected`);
        return "busy";
      }
    }

    const joined = lastLines.join(" ");
    if (PERMISSION_PROMPT_RE.test(joined)) {
      log(`[${this.sessionName}] Screen: permission prompt detected`);
      return "permission";
    }

    // Look for the idle input prompt "> " at the cursor line
    // Strongest signal: completion line (※) above, then "> " prompt below
    const lastLine = lastLines[lastLines.length - 1] ?? "";
    const hasCompletion = lastLines.some(l => COMPLETION_RE.test(l));

    if (INPUT_PROMPT_RE.test(lastLine)) {
      if (hasCompletion) {
        log(`[${this.sessionName}] Screen: input prompt + completion marker`);
      } else {
        log(`[${this.sessionName}] Screen: input prompt detected`);
      }
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
