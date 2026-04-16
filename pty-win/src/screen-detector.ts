import pkg from "@xterm/headless";
const { Terminal } = pkg;
import { log } from "./log.js";

export type PromptType = "input" | "permission" | "busy" | "unknown";

// Claude Code UI patterns
const INPUT_PROMPT_RE = /^[❯>]\s*$/;
const PERMISSION_PROMPT_RE = /allow|permission|approve|deny|y\/n|yes.*no/i;
const BUSY_ANIMATION_RE = /\S+…\s+\(/;
const STATUS_BAR_RE = /^\s*[▸▶●⏺]\s|@\w+\s+\$|shift.tab|accept\s+edits/i;

export class ScreenDetector {
  private terminal: InstanceType<typeof Terminal>;
  private sessionName: string;
  private lastDiagTime = 0;
  private lastOutputTime = Date.now();
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
    this.lastOutputTime = Date.now();
    this.pendingData += data;
  }

  /** Flush buffered data to xterm-headless. Called before any read. */
  private flush(): void {
    if (this.pendingData) {
      this.terminal.write(this.pendingData);
      this.pendingData = "";
    }
  }

  resize(cols: number, rows: number): void {
    this.flush();
    this.terminal.resize(cols, rows);
  }

  /** Check if output has been quiet for at least thresholdMs */
  isQuiet(thresholdMs: number): boolean {
    return Date.now() - this.lastOutputTime >= thresholdMs;
  }

  /** Claude-specific: detect what kind of prompt is showing */
  detectPromptType(): PromptType {
    this.flush();
    const buf = this.terminal.buffer.active;
    const contentLines = this.getContentLines(8);

    const now = Date.now();
    if (now - this.lastDiagTime > 10_000) {
      this.lastDiagTime = now;
      const linesDebug = contentLines.map((l, i) => `  [${i}] "${l.slice(-80)}"`).join("\n");
      log(`[${this.sessionName}] Screen diag: cursorY=${buf.cursorY} lines=${contentLines.length}\n${linesDebug}`);
    }

    for (const line of contentLines) {
      if (BUSY_ANIMATION_RE.test(line)) return "busy";
    }

    const joined = contentLines.join(" ");
    if (PERMISSION_PROMPT_RE.test(joined)) return "permission";

    for (let i = contentLines.length - 1; i >= 0; i--) {
      if (INPUT_PROMPT_RE.test(contentLines[i])) return "input";
    }

    return "unknown";
  }

  getContentLines(n: number): string[] {
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

  /** Get last N lines for dashboard preview */
  snapshot(n: number = 8): string[] {
    this.flush();
    const buf = this.terminal.buffer.active;
    const lines: string[] = [];
    for (let y = this.terminal.rows - 1; y >= 0 && lines.length < n; y--) {
      const line = buf.getLine(buf.baseY + y);
      if (!line) continue;
      const text = line.translateToString(true);
      if (text.trim().length > 0) lines.unshift(text);
    }
    return lines;
  }

  getCursorY(): number {
    this.flush();
    return this.terminal.buffer.active.cursorY;
  }

  dispose(): void {
    this.terminal.dispose();
  }
}
