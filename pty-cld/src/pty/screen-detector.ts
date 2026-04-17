import pkg from "@xterm/headless";
const { Terminal } = pkg;
import { log } from "../log.js";

export type PromptType = "input" | "permission" | "busy" | "unknown";

// Claude Code UI patterns (observed from screenshots)
//
// Busy:   "※ Zigzagging… (1m 8s · ↑ 1.4k tokens)"  — animated status line
//         "※ Perusing… (thinking with high effort)"   — thinking variant
// Idle:   "❯ " at line start                          — input prompt, cursor waiting
// Status: "[working\banana\pty-cld]  @pine  $3.69"   — bottom status bar (skip)
//         "▸▸ accept edits on (shift+tab to cycle)"   — mode indicator (skip)
//
// The leading character on busy lines cycles (※, *, emoji) — don't match on prefix.
// cursorY lands on the status bar — scan viewport bottom-up instead.

const INPUT_PROMPT_RE = /^[❯>]\s*$/;
const PERMISSION_PROMPT_RE = /allow|permission|approve|deny|y\/n|yes.*no/i;
const BUSY_ANIMATION_RE = /\S+…\s+\(/;               // "Zigzagging… ("
const STATUS_BAR_RE = /^\s*[▸▶●⏺]\s|@\w+\s+\$|shift.tab|accept\s+edits/i;

export class ScreenDetector {
  private terminal: InstanceType<typeof Terminal>;
  private sessionName: string;
  private lastDiagTime = 0;
  private pendingData = "";  // buffered data, parsed on demand

  constructor(cols: number, rows: number, sessionName: string) {
    this.sessionName = sessionName;
    this.terminal = new Terminal({
      cols,
      rows,
      scrollback: 200,
      allowProposedApi: true,
    });
  }

  /** Buffer data for deferred parsing. Cheap — just string concat. */
  write(data: string): void {
    this.pendingData += data;
  }

  /** Flush buffered data to xterm-headless. Called before any read. */
  private flush(): void {
    if (this.pendingData) {
      this.terminal.write(this.pendingData);
      this.pendingData = "";
    }
  }

  /** Resize the headless terminal (must stay in sync with node-pty) */
  resize(cols: number, rows: number): void {
    this.flush();
    this.terminal.resize(cols, rows);
  }

  /**
   * Read the rendered screen and determine what kind of prompt is showing.
   * Called when output has been quiet — checks if injection is safe.
   */
  detectPromptType(): PromptType {
    this.flush();
    const buf = this.terminal.buffer.active;
    const contentLines = this.getContentLines(8);

    // Diagnostic: log what we see (throttled to every 10s)
    const now = Date.now();
    if (now - this.lastDiagTime > 10_000) {
      this.lastDiagTime = now;
      const linesDebug = contentLines.map((l, i) => `  [${i}] "${l.slice(-80)}"`).join("\n");
      log(`[${this.sessionName}] Screen diag: cursorY=${buf.cursorY} lines=${contentLines.length}\n${linesDebug}`);
    }

    // Check for busy animation
    for (const line of contentLines) {
      if (BUSY_ANIMATION_RE.test(line)) {
        log(`[${this.sessionName}] Screen: busy`);
        return "busy";
      }
    }

    // Check for permission prompt
    const joined = contentLines.join(" ");
    if (PERMISSION_PROMPT_RE.test(joined)) {
      log(`[${this.sessionName}] Screen: permission`);
      return "permission";
    }

    // Check for input prompt (❯ or >)
    for (let i = contentLines.length - 1; i >= 0; i--) {
      if (INPUT_PROMPT_RE.test(contentLines[i])) {
        log(`[${this.sessionName}] Screen: input prompt`);
        return "input";
      }
    }

    const lastLine = contentLines[contentLines.length - 1] ?? "";
    log(`[${this.sessionName}] Screen: unknown ("${lastLine.slice(-60)}")`);
    return "unknown";
  }

  /**
   * Get the last N non-empty content lines from the viewport,
   * scanning bottom-up and skipping the status bar.
   */
  private getContentLines(n: number): string[] {
    this.flush();
    const buf = this.terminal.buffer.active;
    const lines: string[] = [];

    for (let y = this.terminal.rows - 1; y >= 0 && lines.length < n; y--) {
      const line = buf.getLine(buf.baseY + y);
      if (!line) continue;
      const text = line.translateToString(true);
      if (text.trim().length === 0) continue;
      if (STATUS_BAR_RE.test(text)) continue;
      lines.unshift(text);
    }
    return lines;
  }

  /** Full text snapshot of visible viewport (for debugging) */
  snapshot(): string {
    this.flush();
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
