import * as pty from "@homebridge/node-pty-prebuilt-multiarch";
import { execFile } from "child_process";
import { EventEmitter } from "events";
import { EmcomClient } from "./emcom/client.js";
import { EmcomPoller } from "./emcom/poller.js";
import { readIdentity } from "./folders.js";
import type { SessionConfig } from "./config.js";
import { DEFAULTS } from "./config.js";
import { log, clog } from "./log.js";
import { appendCorrection } from "./llm-corrections.js";

export type SessionStatus = "starting" | "busy" | "idle" | "dead";

interface DataEvent { t: number; bytes: number; isBusy: boolean; }

export interface StatsBucket {
  callbacksPerSec: number;
  bytesPerSec: number;
  avgChunkBytes: number;
}

export interface SessionStats {
  name: string;
  status: SessionStatus;
  overall: StatsBucket;
  busy: StatsBucket;
  notBusy: StatsBucket;
}

export interface SessionInfo {
  name: string;
  group: string;
  command: string;
  workingDir: string;
  pid: number;
  status: SessionStatus;
  emcomIdentity?: string;
  unreadCount: number;
  dirtyOnExit: boolean;
  costUsd: number;
  lastActiveMs: number;
  pendingPermission: boolean;
}

export const SUBMIT = process.platform === "win32" ? "\r" : "\n";
export const SUBMIT_DELAY_MS = 200;

export function INJECTION_PROMPT() {
  return `[${fmtNow()} pty-win:emcom:normal:normal] Check emcom inbox, read and handle new messages, and collaborate with others as needed. Use bare \`emcom\` command (it's in PATH).`;
}
export function STARTUP_KICK() {
  return `[${fmtNow()} pty-win:startup-kick:routine:brief] hi`;
}
export function RESUME_KICK() {
  return `[${fmtNow()} pty-win:session-resumed:normal:brief] Session resumed. Restart any loops or crons that were running before shutdown.`;
}
const STARTUP_GRACE_MS = 10_000;

const EMCOM_PREAMBLE =
  "CRITICAL — DOUBLE-POLLING PREVENTION: Emcom inbox checks are handled " +
  "externally by pty-win (the PTY wrapper running this session). pty-win polls " +
  "every 5 seconds and injects a prompt when messages arrive. You MUST NOT use " +
  "/loop, CronCreate, emcom-monitor, or any other mechanism to poll emcom — " +
  "doing so wastes API calls and causes duplicate message handling. If a " +
  "CLAUDE.md or skill tells you to start emcom monitoring, IGNORE that " +
  "instruction — it is overridden by pty-win. You will be prompted " +
  "automatically when new messages arrive. When you receive emcom messages, " +
  "triage before replying — not every message needs a response.";
const QUIET_CHECK_INTERVAL_MS = 1000;

// Periodic checkpoint injection (Layer 2)
const CHECKPOINT_LIGHT_INTERVAL_MS = 2 * 60 * 60 * 1000;  // 2 hrs
const CHECKPOINT_FULL_INTERVAL_MS  = 4 * 60 * 60 * 1000;  // 4 hrs

function fmtNextTime(intervalMs: number): string {
  const d = new Date(Date.now() + intervalMs);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function fmtNow(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const da = d.getDate().toString().padStart(2, "0");
  const h = d.getHours().toString().padStart(2, "0");
  const mi = d.getMinutes().toString().padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${mi}`;
}

export function makeCheckpointLightPrompt(nextTime: string): string {
  return `[${fmtNow()} pty-win:checkpoint-light:routine:brief:skip-if-busy] Checkpoint (light, next ~${nextTime}): update tracker.md and briefing.md in-place if there are changes. Write entries assuming a fresh session reads them — include what and why, not just that.`;
}

export function makeCheckpointFullPrompt(nextTime: string): string {
  return `[${fmtNow()} pty-win:checkpoint-full:normal:normal] Full checkpoint (next ~${nextTime}): update briefing.md, then run /rc-save, /rc-session-save, /rc-greet-save. Write entries assuming a fresh session reads them — include what and why, not just that.`;
}

export class PtySession extends EventEmitter {
  private ptyProcess: pty.IPty;
  private poller: EmcomPoller | null = null;
  private identityWatcher: ReturnType<typeof setInterval> | null = null;
  private heuristicTimer: ReturnType<typeof setInterval> | null = null;
  private checkpointStartDelay: ReturnType<typeof setTimeout> | null = null;
  private checkpointLightTimer: ReturnType<typeof setInterval> | null = null;
  private checkpointFullTimer: ReturnType<typeof setInterval> | null = null;
  private pendingCheckpoint: "light" | "full" | null = null;
  private checkpointInFlight = false;
  private lastCheckpointTime = 0;
  private status: SessionStatus = "starting";
  private pendingMessages = false;
  private unreadCount = 0;
  private lastOutputTime = Date.now();
  private needsStartupKick = false;
  private isResumedSession = false;
  private dirtyOnExit = false;
  private busyStartTime = 0;
  private busyTimeoutSaved = false;
  private dataEvents: DataEvent[] = [];
  // Raw PTY byte buffer (capped, replaces server-side xterm-headless rendering).
  // Accumulates the most recent ~RAW_BUF_MAX_BYTES of PTY output as-is, ANSI
  // escapes included. Read by /snapshot endpoint and (optionally) by anything
  // that wants a short post-hoc view. Browsers receive the full stream over WS
  // and render it via xterm.js client-side; this buffer is purely for
  // server-side inspection/debugging.
  private rawBuffer = "";
  private static readonly RAW_BUF_MAX_BYTES = 32 * 1024;
  private injectionHistory: Array<{ time: number; type: string; prompt: string; statusBefore: string }> = [];
  private detectionHistory: Array<{ time: number; quietMs: number; promptType: string; mlResult: string | null; statusBefore: string; statusAfter: string; action: string; reason: string }> = [];
  private lastHookStopTime = 0;
  private lastHookNotifyType = "";
  private lastHookPromptSubmitTime = 0;
  private inputBoxDirty = false;
  private pendingPermission = false;
  private graceEnded = false;
  // Retained for debug-endpoint compatibility; no longer written to since
  // hook-driven idle detection replaced the LLM escalation path.
  private llmHistory: Array<{ time: number; trigger: string; ready: boolean | null; why: string; latencyMs: number }> = [];
  costUsd = 0;
  readonly name: string;
  readonly command: string;
  readonly workingDir: string;

  constructor(private config: SessionConfig) {
    super();
    this.name = config.name;
    this.command = config.command;
    this.workingDir = config.workingDir;

    // Spawn process in PTY
    const AI_COMMANDS = ["claude", "agency cc", "agency cp", "copilot", "pi"];
    const CLAUDE_COMMANDS = ["claude", "agency cc", "agency cp"]; // support --append-system-prompt
    const isClaude = AI_COMMANDS.includes(config.command);
    const supportsPreamble = CLAUDE_COMMANDS.includes(config.command);
    const hasEmcom = !!(config.emcomIdentity && config.emcomServer);
    const preambleArgs = supportsPreamble && hasEmcom
      ? ["--append-system-prompt", EMCOM_PREAMBLE]
      : [];
    const allArgs = [...preambleArgs, ...config.args];

    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const commandParts = config.command.split(/\s+/);
    const shellArgs = isWin
      ? ["/c", ...commandParts, ...allArgs]
      : ["-c", `${config.command} ${allArgs.map((a) => `'${a}'`).join(" ")}`];

    const cols = config.cols || 120;
    const rows = config.rows || 40;

    this.ptyProcess = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: config.workingDir,
      env: process.env as Record<string, string>,
    });

    clog(`process started: ${this.name} (pid ${this.ptyProcess.pid}, cmd: ${config.command}, cwd: ${config.workingDir})`);

    // Emcom integration (optional)
    if (config.emcomIdentity && config.emcomServer) {
      const client = new EmcomClient(config.emcomServer, config.emcomIdentity);
      this.poller = new EmcomPoller(client, config.pollIntervalMs, config.name);

      this.poller.onNewMessages((emails) => {
        const from = [...new Set(emails.map((e) => e.sender))];
        log(`[${this.name}] ${emails.length} new message(s) from: ${from.join(", ")}`);
        this.emit("notification", emails.length, from);
        this.pendingMessages = true;
        if (this.status === "idle") this.inject();
      });

      this.poller.onUnreadCount((count) => {
        if (count !== this.unreadCount) {
          this.unreadCount = count;
          this.pendingMessages = count > 0;
          this.emit("status-change");
        }
      });
    }

    // Wire PTY output
    const costRegexLive = /\$(\d+\.\d+)\s+\d+m\d*s/;      // live status bar ($9.97 2m34s or $0.50 553ms)
    const costRegexExit = /Total cost:\s+\$(\d+\.\d+)/;  // exit summary

    const isClaudeCmd = this.config.command === "claude";
    this.ptyProcess.onData((data) => {
      const now = Date.now();
      this.lastOutputTime = now;
      this.dataEvents.push({ t: now, bytes: data.length, isBusy: this.status === "busy" });
      // Append to capped raw buffer (replaces server-side xterm-headless).
      this.rawBuffer += data;
      if (this.rawBuffer.length > PtySession.RAW_BUF_MAX_BYTES) {
        this.rawBuffer = this.rawBuffer.slice(-PtySession.RAW_BUF_MAX_BYTES);
      }
      const costMatch = costRegexExit.exec(data) || costRegexLive.exec(data);
      if (costMatch) this.costUsd = parseFloat(costMatch[1]);
      this.emit("data", data);
      // Status transitions on PTY data:
      //   - For Claude sessions: don't flip to busy on bytes. Hooks own the
      //     status. Trailing bytes after hook:stop (cursor redraw, prompt
      //     re-render) would otherwise wrongly flip us to busy and we'd wait
      //     ~60s for hook:notify(idle) to come back. The "starting" → "busy"
      //     transition is fine because no hook has fired yet on a fresh
      //     Claude.
      //   - For generic shells (bash/cmd/pwsh): no hooks fire. Keep the old
      //     behavior — output means busy, quiet for 3s means idle.
      if (this.status === "starting") {
        this.setStatus("busy");
      } else if (!isClaudeCmd && this.status === "idle") {
        this.setStatus("busy");
      }
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      clog(`process exited: ${this.name} (pid ${this.ptyProcess.pid}, exit code: ${exitCode})`);
      this.stop();
      this.setStatus("dead");
      // Layer 4: check for uncommitted changes on exit
      this.checkDirtyState().then(() => this.emit("exit", exitCode));
    });

    // Startup grace period — fallback in case SessionStart hook doesn't fire
    // (older Claude Code versions, hook timeout, etc.). hookSessionStart()
    // can end the grace early; this timer will then no-op via graceEnded.
    // Important: don't check needsStartupKick here — that flag gets cleared
    // after the kick fires, so the timer would re-set it and trigger a second
    // kick on the next hook:stop.
    setTimeout(() => {
      if (this.graceEnded || this.status === "dead") return;
      this.graceEnded = true;
      const isResume = config.args.includes("--continue") || config.args.includes("-c");
      if (isClaude) {
        this.needsStartupKick = true;
        this.isResumedSession = isResume;
        log(`[${this.name}] Startup grace ended (timer fallback) — will kick when prompt detected (${isResume ? "resume" : "fresh"})`);
      }
      if (this.status === "starting") this.setStatus("busy");
    }, isClaude ? STARTUP_GRACE_MS : 5000);
  }

  start(): void {
    this.poller?.start();
    if (!this.poller) this.watchForIdentity();
    this.startHeuristic();
    this.startCheckpointTimers();
  }

  stop(): void {
    this.poller?.stop();
    this.stopIdentityWatcher();
    this.stopHeuristic();
    this.stopCheckpointTimers();
  }

  write(data: string): void {
    this.ptyProcess.write(data);
  }

  /** Relay a prompt injection via MessageChannel.
   *  PTY writes from setInterval callbacks (heuristic tick) are unreliable —
   *  Claude Code swallows \r for long text. MessagePort.on('message') runs in
   *  the I/O phase of the event loop (same as HTTP handlers), making writes
   *  reliable. The actual write (text + delayed SUBMIT) is handled by the
   *  injectWrite() function in server.ts, triggered by the port message. */
  relayWrite(text: string, source: string = "unknown"): void {
    this.config.injectionPort.postMessage({ name: this.name, text, source });
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
  }

  kill(): void {
    clog(`process killed: ${this.name} (pid ${this.ptyProcess.pid})`);
    this.stop();
    this.ptyProcess.kill();
  }

  getPid(): number {
    return this.ptyProcess.pid;
  }

  getStatus(): SessionStatus {
    return this.status;
  }

  getInfo(): SessionInfo {
    return {
      name: this.name,
      group: this.name.replace(/~pwsh$/, ""),
      command: this.command,
      workingDir: this.workingDir,
      pid: this.ptyProcess.pid,
      status: this.status,
      emcomIdentity: this.config.emcomIdentity,
      unreadCount: this.unreadCount,
      dirtyOnExit: this.dirtyOnExit,
      costUsd: this.costUsd,
      lastActiveMs: this.lastOutputTime,
      pendingPermission: this.pendingPermission,
    };
  }

  /** Last N lines of raw PTY output (ANSI codes intact, no rendering). */
  getSnapshot(n: number = 8): string[] {
    return this.rawBuffer.split("\n").slice(-n);
  }

  clearUnread(): void {
    this.unreadCount = 0;
  }

  /** Hook: Claude Code session started (or resumed/cleared/compacted).
   *  Ends the startup grace period immediately so the heuristic can begin
   *  watching for the prompt glyph and fire the kick as soon as Claude
   *  renders its input. Without this hook, we wait 10s blindly before
   *  even starting to look. `source` is one of: startup, resume, clear,
   *  compact. Only startup and resume care about the kick — clear/compact
   *  mean Claude is already established and just rewriting its context. */
  hookSessionStart(source: string): void {
    if (this.status === "dead") return;
    if (this.graceEnded) {
      clog(`hook:session-start → ${this.name} (source=${source}) — grace already ended, ignoring`);
      return;
    }
    this.graceEnded = true;
    if (source === "clear" || source === "compact") {
      clog(`hook:session-start → ${this.name} (source=${source}) — no kick needed`);
      return;
    }
    clog(`hook:session-start → ${this.name} (source=${source}) — ending grace early`);
    this.needsStartupKick = true;
    this.isResumedSession = source === "resume";
    if (this.status === "starting") this.setStatus("busy");
  }

  /** Hook: Claude finished a turn → idle.
   *  Don't inject from here — the Stop hook fires before Claude Code's
   *  input prompt is fully interactive (writes get swallowed). The
   *  heuristic/screen detection confirms the prompt is visible first,
   *  then handles startup kicks, emcom, and checkpoints. */
  hookStop(): void {
    if (this.status === "dead") return;
    clog(`hook:stop → ${this.name} (was ${this.status})`);
    this.lastHookStopTime = Date.now();
    this.clearPendingPermission("hook:stop");
    this.setStatus("idle");
    this.maybeFireOnIdle("hook:stop");
  }

  /** Hook: user/injection sent input → busy */
  hookPromptSubmit(): void {
    if (this.status === "dead") return;
    this.lastHookPromptSubmitTime = Date.now();
    this.inputBoxDirty = false;
    this.clearPendingPermission("hook:prompt-submit");
    if (this.needsStartupKick) {
      this.needsStartupKick = false;
      clog(`hook:prompt-submit → ${this.name} — startup kick cancelled (user already active)`);
    }
    clog(`hook:prompt-submit → ${this.name} (was ${this.status})`);
    this.setStatus("busy");
  }

  /** Called when the user types into the terminal — marks input box as dirty.
   *  Cleared by hookPromptSubmit. Gates maybeFireOnIdle to avoid injecting
   *  while the user has unsent text in the input box. */
  markUserInput(data: string): void {
    // pendingPermission alert clears as soon as the user touches the terminal
    // (digit to pick option, arrow keys, Escape, etc). Claude Code doesn't
    // fire any hook when the user declines a permission prompt, so input is
    // our only signal. Focus events don't count — they're auto-emitted on
    // pane click and would clear the alert before the user has seen it.
    const isFocusEvent = data === "\x1b[I" || data === "\x1b[O";
    if (!isFocusEvent) {
      this.clearPendingPermission("user-input");
    }

    // Ignore terminal control responses (focus events ESC[I/O, mouse reports,
    // etc.) — these come through onData automatically, not from user typing.
    // Only printable ASCII marks the input box dirty.
    // Escape sequences (focus events ESC[I/O, arrow keys, mouse reports, etc.)
    // start with \x1b and must not mark the box dirty even if they contain
    // printable bytes like '[' or 'O'. Only bare printable text counts.
    if (!data.startsWith("\x1b") && /[\x20-\x7e]/.test(data)) {
      this.inputBoxDirty = true;
    } else if (data.startsWith("\x1b")) {
      const known: Record<string, string> = {
        "\x1b[I": "focus-in", "\x1b[O": "focus-out",
        "\x1b[A": "arrow-up", "\x1b[B": "arrow-down",
        "\x1b[C": "arrow-right", "\x1b[D": "arrow-left",
      };
      const hex = Buffer.from(data).toString("hex");
      const label = known[data] ?? hex;
      clog(`[${this.name}] input: ignored escape (${label} ${hex})`);
    }
  }

  clearInputDirty(): void {
    if (this.inputBoxDirty) {
      this.inputBoxDirty = false;
      clog(`[${this.name}] input box cleared by user`);
      this.maybeFireOnIdle("user-cleared-input");
    }
  }

  /** Hook: notification — Claude Code emits these for idle_prompt,
   *  permission_prompt, and potentially other types over time. Matcher
   *  is `.*` so all types reach us; handle the known ones, log the rest. */
  hookNotify(type: string): void {
    if (this.status === "dead") return;
    this.lastHookNotifyType = type;
    if (type === "permission_prompt") {
      clog(`hook:notify(permission) → ${this.name} — pending permission`);
      // Don't change status — permission prompts are transient and the
      // turn isn't actually over. Surface the pending state to the UI
      // so the user sees a visual cue something is waiting on them.
      if (!this.pendingPermission) {
        this.pendingPermission = true;
        this.emit("status-change");
      }
      return;
    }
    if (type === "idle_prompt") {
      clog(`hook:notify(idle) → ${this.name} — confirmed idle`);
      this.clearPendingPermission("hook:notify(idle)");
      if (this.status !== "idle") this.setStatus("idle");
      // Confirmed idle — also a good moment to fire pending injects (esp. for
      // startup kicks where no prior hook:stop has fired).
      this.maybeFireOnIdle("hook:notify(idle)");
      return;
    }
    clog(`hook:notify(${type}) → ${this.name} — unhandled type, ignoring`);
  }

  private clearPendingPermission(reason: string): void {
    if (this.pendingPermission) {
      this.pendingPermission = false;
      clog(`[${this.name}] pending permission cleared (${reason})`);
      this.emit("status-change");
    }
  }

  /** Called when a hook signals idle. Fires the highest-priority pending
   *  inject: startup-kick, then emcom, then checkpoint. Mirrors what the
   *  heuristic used to do when it detected an "input" prompt via screen. */
  private maybeFireOnIdle(reason: string): void {
    if (this.status !== "idle") return;
    if (this.inputBoxDirty) {
      clog(`[${this.name}] maybeFireOnIdle skipped — input box dirty (trigger: ${reason})`);
      return;
    }
    if (this.needsStartupKick) {
      this.needsStartupKick = false;
      const kick = this.isResumedSession ? RESUME_KICK() : STARTUP_KICK();
      const kickType = this.isResumedSession ? "resume-kick" : "startup-kick";
      log(`[${this.name}] Injecting ${this.isResumedSession ? "resume" : "startup"} kick (trigger: ${reason})`);
      this.recordInjection(kickType, kick);
      const kickRaw = this.getRawTail(8 * 1024);
      this.relayWrite(kick, kickType);
      this.setStatus("busy");
      this.verifyInjectAfter({ screen: kickRaw, why: kickType, injectText: kick }, kickType);
      // Cooldown: pause heuristic so we don't fire a follow-on inject (e.g.
      // emcom-auto) while Claude is still rendering the kick's response.
      this.stopHeuristic();
      setTimeout(() => {
        if (this.status !== "dead") this.startHeuristic();
      }, this.config.injectionCooldownMs);
      return;
    }
    if (this.pendingMessages) {
      this.inject();
      return;
    }
    if (this.pendingCheckpoint && !this.checkpointStartDelay) {
      this.scheduleCheckpointInjection(this.pendingCheckpoint);
    }
  }

  /** Force session to idle — triggers emcom injection if messages are pending. */
  forceIdle(): void {
    log(`[${this.name}] Force-idle requested (was ${this.status})`);
    this.setStatus("idle");
    if (this.pendingMessages) this.inject();
  }

  /** Trigger emcom injection immediately (for quick-message send from UI). */
  injectEmcom(): void {
    this.pendingMessages = true;
    if (this.status === "idle") this.inject();
  }

  /** Last N lines (split by \n) of raw PTY output. ANSI codes intact. */
  getContentLines(n: number): string[] {
    return this.rawBuffer.split("\n").slice(-n);
  }

  /** Last N bytes of raw PTY output (ANSI codes intact, no rendering). */
  getRawTail(maxBytes: number = PtySession.RAW_BUF_MAX_BYTES): string {
    if (this.rawBuffer.length <= maxBytes) return this.rawBuffer;
    return this.rawBuffer.slice(-maxBytes);
  }

  // --- Debug instrumentation ---

  private recordInjection(type: string, prompt: string): void {
    this.injectionHistory.push({ time: Date.now(), type, prompt, statusBefore: this.status });
    if (this.injectionHistory.length > 50) this.injectionHistory.shift();
  }

  private recordDetectionTick(quietMs: number, promptType: string, mlResult: string | null, action: string, reason: string): void {
    const statusBefore = this.status;
    this.detectionHistory.push({ time: Date.now(), quietMs, promptType, mlResult, statusBefore, statusAfter: this.status, action, reason });
    if (this.detectionHistory.length > 100) this.detectionHistory.shift();
  }

  getDebugState(): Record<string, unknown> {
    const now = Date.now();
    return {
      name: this.name, command: this.command, workingDir: this.workingDir,
      pid: this.ptyProcess?.pid,
      status: this.status,
      busyStartTime: this.busyStartTime,
      busyElapsedMs: this.busyStartTime > 0 && this.status === "busy" ? now - this.busyStartTime : 0,
      busyTimeoutSaved: this.busyTimeoutSaved,
      needsStartupKick: this.needsStartupKick,
      isResumedSession: this.isResumedSession,
      dirtyOnExit: this.dirtyOnExit,
      pendingMessages: this.pendingMessages,
      unreadCount: this.unreadCount,
      pollerActive: this.poller !== null,
      pendingCheckpoint: this.pendingCheckpoint,
      checkpointInFlight: this.checkpointInFlight,
      lastCheckpointTime: this.lastCheckpointTime,
      lastCheckpointAgoMs: this.lastCheckpointTime > 0 ? now - this.lastCheckpointTime : null,
      checkpointLightTimerActive: this.checkpointLightTimer !== null,
      checkpointFullTimerActive: this.checkpointFullTimer !== null,
      heuristicTimerActive: this.heuristicTimer !== null,
      lastOutputTime: this.lastOutputTime,
      quietMs: now - this.lastOutputTime,
      costUsd: this.costUsd,
      injectionHistory: this.injectionHistory,
      detectionHistory: this.detectionHistory,
    };
  }

  getDetectionState(): Record<string, unknown> {
    const now = Date.now();
    const quietMs = now - this.lastOutputTime;
    return {
      session: this.name, status: this.status,
      quiet: { lastOutputTime: this.lastOutputTime, quietMs, thresholdMs: this.config.quietThresholdMs, isQuiet: quietMs >= this.config.quietThresholdMs },
      // No more screen detection — hook-driven idle detection. The raw byte
      // tail is available via /api/sessions/:name/snapshot?raw=1 if needed.
      heuristic: { timerActive: this.heuristicTimer !== null, tickIntervalMs: 1000 },
      busyTimeout: { startTime: this.busyStartTime, elapsedMs: this.busyStartTime > 0 ? now - this.busyStartTime : 0, thresholdMs: this.config.busyTimeoutMs, timeoutSampleSaved: this.busyTimeoutSaved },
      hooks: { lastStopTime: this.lastHookStopTime || null, lastNotifyType: this.lastHookNotifyType || null, lastPromptSubmitTime: this.lastHookPromptSubmitTime || null },
    };
  }

  getDetectionHistory() { return this.detectionHistory; }
  getInjectionHistory() { return this.injectionHistory; }

  debugForceInject(): void {
    const prompt = INJECTION_PROMPT();
    this.recordInjection("emcom", prompt);
    this.relayWrite(prompt, "debug-force");
    this.setStatus("busy");
  }

  debugTriggerCheckpoint(type: "light" | "full"): { injected: boolean; reason?: string } {
    this.pendingCheckpoint = type;
    if (this.status === "idle") {
      this.injectCheckpoint();
      return { injected: true };
    }
    return { injected: false, reason: `session is ${this.status}, queued as pending` };
  }

  getStats(): SessionStats {
    const WINDOW_MS = 5000;
    const cutoff = Date.now() - WINDOW_MS;
    // Prune old events
    this.dataEvents = this.dataEvents.filter((e) => e.t >= cutoff);

    const bucket = (events: DataEvent[]): StatsBucket => {
      const cbs = events.length;
      const bytes = events.reduce((s, e) => s + e.bytes, 0);
      return {
        callbacksPerSec: Math.round(cbs / (WINDOW_MS / 1000) * 10) / 10,
        bytesPerSec: Math.round(bytes / (WINDOW_MS / 1000)),
        avgChunkBytes: cbs > 0 ? Math.round(bytes / cbs) : 0,
      };
    };

    return {
      name: this.name,
      status: this.status,
      overall: bucket(this.dataEvents),
      busy: bucket(this.dataEvents.filter((e) => e.isBusy)),
      notBusy: bucket(this.dataEvents.filter((e) => !e.isBusy)),
    };
  }

  /**
   * Periodically check for identity.json appearing in the session's working dir.
   * Once found, attach emcom poller and stop watching.
   */
  private watchForIdentity(): void {
    if (this.identityWatcher) return;
    const WATCH_INTERVAL_MS = 5000;
    this.identityWatcher = setInterval(() => {
      const identity = readIdentity(this.workingDir);
      if (!identity) return;

      this.stopIdentityWatcher();
      this.attachEmcom(identity.name, identity.server);
    }, WATCH_INTERVAL_MS);
  }

  private stopIdentityWatcher(): void {
    if (this.identityWatcher) {
      clearInterval(this.identityWatcher);
      this.identityWatcher = null;
    }
  }

  /**
   * Dynamically attach emcom polling to a session that started without it.
   */
  private attachEmcom(identityName: string, server: string): void {
    if (this.poller) return;

    this.config.emcomIdentity = identityName;
    this.config.emcomServer = server;

    const client = new EmcomClient(server, identityName);
    this.poller = new EmcomPoller(client, this.config.pollIntervalMs || DEFAULTS.pollIntervalMs, this.name);

    this.poller.onNewMessages((emails) => {
      const from = [...new Set(emails.map((e) => e.sender))];
      log(`[${this.name}] ${emails.length} new message(s) from: ${from.join(", ")}`);
      this.emit("notification", emails.length, from);
      this.pendingMessages = true;
      if (this.status === "idle") this.inject();
    });

    this.poller.onUnreadCount((count) => {
      if (count !== this.unreadCount) {
        this.unreadCount = count;
        this.pendingMessages = count > 0;
        this.emit("status-change");
      }
    });

    this.poller.start();
    log(`[${this.name}] emcom attached dynamically (identity=${identityName})`);

    // Broadcast updated session info so frontend sees the identity
    this.emit("status-change", this.status);
  }

  private setStatus(s: SessionStatus): void {
    if (this.status === s) return;
    this.status = s;
    if (s === "busy") {
      this.busyStartTime = Date.now();
      this.busyTimeoutSaved = false;
    }
    // Stamp checkpoint time when session goes idle after a checkpoint response
    if (s === "idle" && this.checkpointInFlight) {
      this.checkpointInFlight = false;
      this.lastCheckpointTime = Date.now();
    }
    this.emit("status-change", s);
  }

  private startHeuristic(): void {
    if (this.heuristicTimer) return;
    // Hooks drive idle detection once Claude is up — but on first start
    // hooks haven't fired yet (nothing's been submitted), so the kick path
    // needs a different signal. We use a cheap byte-level pattern match on
    // the raw buffer: when Claude renders its prompt, the `❯` glyph appears
    // in the output. That + a brief quiet period = Claude is past the
    // boot/welcome screen and ready to accept input.
    //
    // This is a one-shot startup signal; once the kick fires, hooks own
    // the rest of the session's status.
    const AI_CMDS = ["claude", "agency cc", "agency cp", "copilot", "pi"];
    const isAI = AI_CMDS.includes(this.config.command);
    const STARTUP_PROMPT_QUIET_MS = 1_000;
    const STARTUP_FALLBACK_QUIET_MS = 30_000;
    // The Claude Code prompt glyph. Searching the raw byte buffer for this
    // is far cheaper than running an xterm-headless cell renderer, and it's
    // unaffected by the grey-placeholder rendering issue (it just confirms
    // Claude has drawn a prompt at some point).
    const PROMPT_GLYPH = "❯"; // ❯

    this.heuristicTimer = setInterval(() => {
      if (this.status === "dead") return;
      const quietMs = Date.now() - this.lastOutputTime;

      if (isAI) {
        if (!this.needsStartupKick) return; // hooks own everything else
        if (this.inputBoxDirty) return;
        // Primary: prompt glyph visible AND brief quiet → Claude is ready.
        const promptVisible = this.rawBuffer.includes(PROMPT_GLYPH);
        if (promptVisible && quietMs >= STARTUP_PROMPT_QUIET_MS) {
          if (this.status === "busy") this.setStatus("idle");
          this.maybeFireOnIdle(`startup-kick(prompt-visible, quiet ${quietMs}ms)`);
          return;
        }
        // Periodic diagnostic: log once per minute while waiting.
        if (quietMs > 0 && Math.floor(quietMs / 60_000) > Math.floor((quietMs - 1000) / 60_000)) {
          clog(`[${this.name}] waiting for startup kick: glyph=${promptVisible}, quiet=${quietMs}ms, bufLen=${this.rawBuffer.length}`);
        }
        // Fallback: very long quiet (≥30s) without ever seeing the glyph
        // shouldn't happen on a healthy Claude, but if it does, kick anyway
        // to avoid wedging the session forever.
        if (quietMs >= STARTUP_FALLBACK_QUIET_MS) {
          if (this.status === "busy") this.setStatus("idle");
          this.maybeFireOnIdle(`startup-kick(fallback, quiet ${quietMs}ms, no glyph seen)`);
        }
        return;
      }
      // Generic sessions: simple quiet threshold (no hooks available).
      if (this.status === "busy" && quietMs >= 3_000) {
        this.setStatus("idle");
      }
    }, QUIET_CHECK_INTERVAL_MS);
  }

  // --- LLM escalation ---

  getLlmHistory() { return this.llmHistory; }

  /** Watch for hook:prompt-submit within VERIFY_WINDOW_MS of any inject.
   *  If absent, the inject didn't submit. Recovery is unconditional: re-send
   *  SUBMIT once and watch again. The hook is ground truth — no need for an
   *  LLM check on screen content (Claude Code's grey placeholder text fooled
   *  earlier checkStuckInput attempts into saying not-stuck on real stuck
   *  cases). Empty Enter on already-empty input is harmless. */
  private verifyInjectAfter(
    snapshot: { screen: string; why: string; injectText: string },
    source: string,
    attempt: number = 0,
  ): void {
    const VERIFY_WINDOW_MS = 5_000;
    const MAX_RETRIES = 2;
    const injectAt = Date.now();
    setTimeout(() => {
      const submitted = this.lastHookPromptSubmitTime > injectAt;
      if (submitted) {
        const recoveredTag = attempt > 0 ? ` [recovered after ${attempt} retry]` : "";
        clog(`[${this.name}] [verify] inject submitted (source=${source})${recoveredTag}`);
        if (attempt > 0) {
          void appendCorrection({
            time: new Date().toISOString(),
            session: this.name,
            screen: snapshot.screen,
            llmSaid: source === "llm-driven" ? true : null,
            llmWhy: snapshot.why,
            actualOutcome: "recovered_by_resend",
          });
        }
        return;
      }
      if (attempt < MAX_RETRIES) {
        clog(`[${this.name}] [verify] no hook:prompt-submit within ${VERIFY_WINDOW_MS}ms (source=${source}) — re-sending SUBMIT (retry ${attempt + 1}/${MAX_RETRIES})`);
        this.relayWrite(SUBMIT, `recover:${source}`);
        // Re-arm: watch for the hook after the retry. The new injectAt window
        // means a retry that succeeds is correctly attributed to the recovery.
        this.verifyInjectAfter(snapshot, source, attempt + 1);
      } else {
        clog(`[${this.name}] [verify] gave up after ${MAX_RETRIES} retries (source=${source})`);
        void appendCorrection({
          time: new Date().toISOString(),
          session: this.name,
          screen: snapshot.screen,
          llmSaid: source === "llm-driven" ? true : null,
          llmWhy: snapshot.why,
          actualOutcome: "gave_up",
        });
      }
    }, VERIFY_WINDOW_MS).unref?.();
  }

  private stopHeuristic(): void {
    if (this.heuristicTimer) {
      clearInterval(this.heuristicTimer);
      this.heuristicTimer = null;
    }
  }

  private inject(source: string = "emcom-auto"): void {
    if (this.inputBoxDirty) {
      clog(`[${this.name}] inject skipped — input box dirty (source: ${source})`);
      return;
    }
    this.pendingMessages = false;
    this.unreadCount = 0;
    const identity = this.config.emcomIdentity;
    const label = identity ? `${this.name} (@${identity})` : this.name;
    const prompt = INJECTION_PROMPT();
    clog(`emcom check → ${label}`);
    this.recordInjection("emcom", prompt);
    const screenAtInject = this.getRawTail(8 * 1024);
    this.relayWrite(prompt, source);
    this.setStatus("busy");
    this.verifyInjectAfter({ screen: screenAtInject, why: source, injectText: prompt }, source);

    // Cooldown: don't go idle again for a while
    this.stopHeuristic();
    setTimeout(() => {
      if (this.status !== "dead") this.startHeuristic();
    }, this.config.injectionCooldownMs);
  }

  // --- Layer 2: Periodic checkpoint injection ---

  private startCheckpointTimers(): void {
    const AI_COMMANDS = ["claude", "agency cc", "agency cp", "copilot", "pi"];
    if (!AI_COMMANDS.includes(this.config.command)) return;

    const offset = this.config.checkpointOffsetMs || 0;
    if (offset > 0) {
      clog(`checkpoint stagger for ${this.name}: ${offset / 1000}s offset per round`);
    }

    this.checkpointLightTimer = setInterval(() => {
      if (this.status === "dead") return;
      if (this.pendingCheckpoint === "full") {
        clog(`checkpoint (light) skipped → ${this.name} (full pending)`);
        return;
      }
      if (this.lastOutputTime <= this.lastCheckpointTime) {
        clog(`checkpoint (light) skipped → ${this.name} (no activity)`);
        return;
      }
      this.pendingCheckpoint = "light";
      this.scheduleCheckpointInjection("light");
    }, CHECKPOINT_LIGHT_INTERVAL_MS);

    this.checkpointFullTimer = setInterval(() => {
      if (this.status === "dead") return;
      if (this.lastOutputTime <= this.lastCheckpointTime) {
        clog(`checkpoint (full) skipped → ${this.name} (no activity)`);
        return;
      }
      this.pendingCheckpoint = "full";
      this.scheduleCheckpointInjection("full");
    }, CHECKPOINT_FULL_INTERVAL_MS);
  }

  /** Stagger checkpoint injection by repo offset — runs every round, not just the first. */
  private scheduleCheckpointInjection(type: string): void {
    const offset = this.config.checkpointOffsetMs || 0;
    if (offset > 0) {
      clog(`checkpoint (${type}) scheduled → ${this.name} (in ${offset / 1000}s)`);
      this.checkpointStartDelay = setTimeout(() => {
        this.checkpointStartDelay = null;
        if (this.status === "idle") {
          this.injectCheckpoint();
        } else {
          clog(`checkpoint (${type}) queued → ${this.name} (status: ${this.status})`);
        }
      }, offset);
    } else {
      if (this.status === "idle") {
        this.injectCheckpoint();
      } else {
        clog(`checkpoint (${type}) queued → ${this.name} (status: ${this.status})`);
      }
    }
  }

  private stopCheckpointTimers(): void {
    if (this.checkpointStartDelay) {
      clearTimeout(this.checkpointStartDelay);
      this.checkpointStartDelay = null;
    }
    if (this.checkpointLightTimer) {
      clearInterval(this.checkpointLightTimer);
      this.checkpointLightTimer = null;
    }
    if (this.checkpointFullTimer) {
      clearInterval(this.checkpointFullTimer);
      this.checkpointFullTimer = null;
    }
  }

  private injectCheckpoint(): void {
    if (!this.pendingCheckpoint) return;
    const type = this.pendingCheckpoint;
    const intervalMs = type === "full" ? CHECKPOINT_FULL_INTERVAL_MS : CHECKPOINT_LIGHT_INTERVAL_MS;
    const nextTime = fmtNextTime(intervalMs);
    let prompt = type === "full" ? makeCheckpointFullPrompt(nextTime) : makeCheckpointLightPrompt(nextTime);
    if (this.costUsd > 0) {
      prompt += ` Session cost: $${this.costUsd.toFixed(2)}.`;
    }
    this.pendingCheckpoint = null;
    this.checkpointInFlight = true;
    clog(`injecting ${type} checkpoint → ${this.name}`);
    this.recordInjection(`checkpoint-${type}`, prompt);
    const cpScreen = this.getRawTail(8 * 1024);
    this.relayWrite(prompt, `checkpoint-${type}`);
    this.setStatus("busy");
    this.verifyInjectAfter({ screen: cpScreen, why: `checkpoint-${type}`, injectText: prompt }, `checkpoint-${type}`);

    this.stopHeuristic();
    setTimeout(() => {
      if (this.status !== "dead") this.startHeuristic();
    }, this.config.injectionCooldownMs);
  }

  // --- Layer 4: Dirty state detection on exit ---

  private checkDirtyState(): Promise<void> {
    return new Promise((resolve) => {
      execFile("git", ["status", "--porcelain"], { cwd: this.workingDir, timeout: 5000 }, (err, stdout) => {
        if (!err && stdout.trim().length > 0) {
          this.dirtyOnExit = true;
          log(`[${this.name}] Dirty workspace on exit (${stdout.trim().split("\n").length} changed files)`);
          this.emit("status-change", this.status);
        }
        resolve();
      });
    });
  }
}
