import pkg from "@xterm/headless";
const { Terminal } = pkg;
import { log } from "../log.js";

export type PromptType = "input" | "permission" | "busy" | "unknown";

// Claude Code UI patterns (observed from screenshots)
//
// Busy:   "※ Zigzagging… (1m 8s · ↑ 1.4k tokens)"  — with duration + token stats
//         "※ Perusing… (thinking with high effort)"   — with thinking label, no digits
// Done:   "※ Cooked for 1m 16s"                      — static completion line
// Idle:   "> " or "❯ " at line start                  — input prompt, cursor waiting
// Status: "[working\banana\pty-cld]  @pine  $3.69"   — bottom status bar (skip this)
//         "▸▸ accept edits on (shift+tab to cycle)"   — mode indicator line
//
// The leading character cycles (※, *, emoji, etc.) — don't match on prefix.
// cursorY lands on the status bar — don't trust it for prompt location.

const INPUT_PROMPT_RE = /^[❯>]\s*$/;
const PERMISSION_PROMPT_RE = /allow|permission|approve|deny|y\/n|yes.*no/i;
const BUSY_ANIMATION_RE = /\S+…\s+\(/;               // "Zigzagging… (" — verb + ellipsis + open paren
const COMPLETION_RE = /\S+\s+for\s+\d+[ms]/;          // "Cooked for 1m 16s"
const STATUS_BAR_RE = /^\s*[▸▶●⏺]\s|@\w+\s+\$|shift.tab|accept\s+edits/i;  // status bar indicators

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
    const contentLines = this.getContentLines(8);

    // Diagnostic: log what we see (throttled to every 5s)
    const now = Date.now();
    if (now - this.lastDiagTime > 5000) {
      this.lastDiagTime = now;
      const linesDebug = contentLines.map((l, i) => `  [${i}] "${l.slice(-80)}"`).join("\n");
      log(`[${this.sessionName}] Screen diag: rows=${this.terminal.rows} cursorY=${buf.cursorY} content lines=${contentLines.length}\n${linesDebug}`);
    }

    // Check all lines for patterns — order matters
    for (const line of contentLines) {
      if (BUSY_ANIMATION_RE.test(line)) {
        log(`[${this.sessionName}] Screen: busy animation detected`);
        return "busy";
      }
    }

    const joined = contentLines.join(" ");
    if (PERMISSION_PROMPT_RE.test(joined)) {
      log(`[${this.sessionName}] Screen: permission prompt detected`);
      return "permission";
    }

    // Look for input prompt anywhere in the content lines
    const hasCompletion = contentLines.some(l => COMPLETION_RE.test(l));
    for (let i = contentLines.length - 1; i >= 0; i--) {
      if (INPUT_PROMPT_RE.test(contentLines[i])) {
        if (hasCompletion) {
          log(`[${this.sessionName}] Screen: input prompt + completion marker`);
        } else {
          log(`[${this.sessionName}] Screen: input prompt detected`);
        }
        return "input";
      }
    }

    const lastLine = contentLines[contentLines.length - 1] ?? "";
    log(`[${this.sessionName}] Screen: unknown (last line: "${lastLine.slice(-80)}")`);
    return "unknown";
  }

  /**
   * Get the last N non-empty content lines from the viewport,
   * scanning bottom-up and skipping the status bar at the bottom.
   */
  private getContentLines(n: number): string[] {
    const buf = this.terminal.buffer.active;
    const lines: string[] = [];

    // Scan from the bottom of the viewport upward, skipping status bar lines
    for (let y = this.terminal.rows - 1; y >= 0 && lines.length < n; y--) {
      const line = buf.getLine(buf.baseY + y);
      if (!line) continue;
      const text = line.translateToString(true);
      if (text.trim().length === 0) continue;

      // Skip status bar lines (bottom of screen)
      if (STATUS_BAR_RE.test(text)) continue;

      lines.unshift(text);
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
