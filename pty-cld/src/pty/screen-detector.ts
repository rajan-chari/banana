import pkg from "@xterm/headless";
const { Terminal } = pkg;
import { log } from "../log.js";

export type PromptType = "input" | "permission" | "busy" | "unknown";

// Claude Code UI patterns (observed from screenshots)
//
// Busy:   "※ Zigzagging… (1m 8s · ↑ 1.4k tokens)"  — animated, constantly rewriting
//         "* Transmuting… (44s · ↓ 340 tokens)"      — alternate prefix
// Done:   "※ Cooked for 1m 16s"                      — static completion line
// Idle:   "> " or "❯ " at line start                  — input prompt, cursor waiting
//
// Busy vs done: busy has "verb…" (ellipsis) + "(stats)", done has "verb for duration".
// The leading character cycles (※, *, emoji, etc.) — don't match on prefix.

const INPUT_PROMPT_RE = /^[❯>]\s*$/;
const PERMISSION_PROMPT_RE = /allow|permission|approve|deny|y\/n|yes.*no/i;
const BUSY_ANIMATION_RE = /\S+…\s+\(\d/;              // "Zigzagging… (1m" — verb + ellipsis + (stats)
const COMPLETION_RE = /\S+\s+for\s+\d+[ms]/;          // "Cooked for 1m 16s" — verb + for + duration

export class ScreenDetector {
  private terminal: InstanceType<typeof Terminal>;
  private sessionName: string;
  private lastDiagTime = 0;

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
    const lastLines = this.getLastNonEmptyLines(5);

    // Diagnostic: log cursor position and what we see (throttled)
    const now = Date.now();
    if (now - this.lastDiagTime > 5000) {
      this.lastDiagTime = now;
      const linesDebug = lastLines.map((l, i) => `  [${i}] "${l.slice(-80)}"`).join("\n");
      log(`[${this.sessionName}] Screen diag: cursorY=${buf.cursorY} baseY=${buf.baseY} lines=${lastLines.length}\n${linesDebug}`);
    }

    // Check all recent lines for patterns — order matters
    for (const line of lastLines) {
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

    log(`[${this.sessionName}] Screen: unknown (last line: "${lastLine.slice(-80)}")`);
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
