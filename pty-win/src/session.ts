import * as pty from "@homebridge/node-pty-prebuilt-multiarch";
import { execFile } from "child_process";
import { EventEmitter } from "events";
import type { EmcomEmail } from "./emcom/client.js";
import { EmcomPoller } from "./emcom/poller.js";
import { readIdentity } from "./folders.js";
import type { SessionConfig } from "./config.js";
import { DEFAULTS } from "./config.js";
import { log, clog } from "./log.js";
import { appendCorrection } from "./llm-corrections.js";
import { createEmcomPoller } from "./session-emcom.js";
import { SessionHookController } from "./session-hooks.js";
import { SessionHeuristicController } from "./session-heuristic.js";
import { verifyInjectionAfter } from "./session-injection-verifier.js";
import {
  SessionCheckpointController,
  makeCheckpointLightPrompt,
  makeCheckpointFullPrompt,
  type CheckpointType,
} from "./session-checkpoint.js";
import type { SessionStatus } from "./session-state.js";
export type { SessionStatus } from "./session-state.js";

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

function fmtNow(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const da = d.getDate().toString().padStart(2, "0");
  const h = d.getHours().toString().padStart(2, "0");
  const mi = d.getMinutes().toString().padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${mi}`;
}

export { makeCheckpointLightPrompt, makeCheckpointFullPrompt };

export class PtySession extends EventEmitter {
  private ptyProcess: pty.IPty;
  private poller: EmcomPoller | null = null;
  private identityWatcher: ReturnType<typeof setInterval> | null = null;
  private hookController: SessionHookController;
  private heuristicController: SessionHeuristicController;
  private checkpointController: SessionCheckpointController;
  private status: SessionStatus = "starting";
  private pendingMessages = false;
  private unreadCount = 0;
  private lastOutputTime = Date.now();
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
  // Track current state of mode-set escapes so we can replay them to
  // late-connecting WS clients. These get emitted once at startup by apps like
  // copilot (alt-screen + SGR mouse mode), then rotate out of rawBuffer as
  // conversation streams. Without re-sending them on connect, xterm.js stays
  // in the wrong mode and wheel events never reach the app.
  // Keyed by mode number (e.g. "1049"), value is the last-seen 'h'/'l' state.
  private modeState = new Map<string, "h" | "l">();
  // Modes we care about: alt-screen variants, mouse tracking, bracketed-paste,
  // focus reporting. Cursor blink/visibility (?25) is intentionally excluded —
  // it flips constantly and would generate spurious replay churn.
  private static readonly TRACKED_MODE_RE =
    // eslint-disable-next-line no-control-regex
    /\x1b\[\?(1049|1047|1048|47|1002|1003|1006|1015|1000|1004|2004)([hl])/g;
  private injectionHistory: Array<{ time: number; type: string; prompt: string; statusBefore: string }> = [];
  private detectionHistory: Array<{ time: number; quietMs: number; promptType: string; mlResult: string | null; statusBefore: string; statusAfter: string; action: string; reason: string }> = [];
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
    this.hookController = new SessionHookController({
      sessionName: this.name,
      getStatus: () => this.status,
      setStatus: (status) => this.setStatus(status),
      maybeFireOnIdle: (reason) => this.maybeFireOnIdle(reason),
      emitStatusChange: () => this.emit("status-change"),
      log: (message) => clog(message),
    });
    this.checkpointController = new SessionCheckpointController({
      sessionName: this.name,
      command: this.command,
      checkpointOffsetMs: this.config.checkpointOffsetMs || 0,
      getStatus: () => this.status,
      getLastOutputTime: () => this.lastOutputTime,
      getCostUsd: () => this.costUsd,
      onInject: (type, prompt) => this.injectCheckpoint(type, prompt),
      log: (message) => clog(message),
    });
    this.heuristicController = new SessionHeuristicController({
      command: this.command,
      sessionName: this.name,
      getStatus: () => this.status,
      getLastOutputTime: () => this.lastOutputTime,
      getNeedsStartupKick: () => this.hookController.getNeedsStartupKick(),
      getInputBoxDirty: () => this.hookController.getInputBoxDirty(),
      getRawBuffer: () => this.rawBuffer,
      setIdle: () => this.setStatus("idle"),
      maybeFireOnIdle: (reason) => this.maybeFireOnIdle(reason),
      log: (message) => clog(message),
    });

    // Spawn process in PTY
    const AI_COMMANDS = ["claude", "agency cc", "agency cp", "copilot", "pi"];
    // CLIs that accept --append-system-prompt for the emcom preamble. Claude
    // Code has it natively. `agency cc` is a Claude wrapper that passes args
    // through. `pi` has the same flag. `agency cp` and `copilot` are Copilot
    // CLI which does NOT support --append-system-prompt (preamble must come
    // via a different path — likely SessionStart hook returning
    // additionalContext).
    const PREAMBLE_FLAG_COMMANDS = ["claude", "agency cc", "pi"];
    const isClaude = AI_COMMANDS.includes(config.command);
    const supportsPreamble = PREAMBLE_FLAG_COMMANDS.includes(config.command);
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
      this.poller = this.buildEmcomPoller(config.emcomIdentity, config.emcomServer);
    }

    // Wire PTY output
    const costRegexLive = /\$(\d+\.\d+)\s+\d+m\d*s/;      // live status bar ($9.97 2m34s or $0.50 553ms)
    const costRegexExit = /Total cost:\s+\$(\d+\.\d+)/;  // exit summary

    // Commands whose hooks reliably fire (proven via testing): Claude Code
    // and the agency cc wrapper. Copilot, agency cp, and pi don't fire hooks
    // — their idle detection has to fall back to the quiet-threshold heuristic.
    const HOOKS_WORKING_COMMANDS = ["claude", "agency cc"];
    const hasWorkingHooks = HOOKS_WORKING_COMMANDS.includes(this.config.command);
    const isClaudeCmd = hasWorkingHooks;
    this.ptyProcess.onData((data) => {
      const now = Date.now();
      this.lastOutputTime = now;
      this.dataEvents.push({ t: now, bytes: data.length, isBusy: this.status === "busy" });
      // Append to capped raw buffer (replaces server-side xterm-headless).
      this.rawBuffer += data;
      if (this.rawBuffer.length > PtySession.RAW_BUF_MAX_BYTES) {
        this.rawBuffer = this.rawBuffer.slice(-PtySession.RAW_BUF_MAX_BYTES);
      }
      // Track mode-set escapes so they can be replayed to late-connecting WS
      // clients. These get rotated out of rawBuffer once conversation streams,
      // so we keep a separate state map.
      PtySession.TRACKED_MODE_RE.lastIndex = 0;
      let modeMatch: RegExpExecArray | null;
      while ((modeMatch = PtySession.TRACKED_MODE_RE.exec(data)) !== null) {
        const mode = modeMatch[1];
        const state = modeMatch[2];
        if (mode && state) this.modeState.set(mode, state as "h" | "l");
      }
      const costMatch = costRegexExit.exec(data) || costRegexLive.exec(data);
      if (costMatch && costMatch[1]) this.costUsd = parseFloat(costMatch[1]);
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
      const isResume = config.args.includes("--continue") || config.args.includes("-c");
      this.hookController.onStartupGraceTimeout(isClaude, isResume);
    }, isClaude ? STARTUP_GRACE_MS : 5000);
  }

  start(): void {
    this.poller?.start();
    if (!this.poller) this.watchForIdentity();
    this.startHeuristic();
    this.checkpointController.start();
  }

  stop(): void {
    this.poller?.stop();
    this.stopIdentityWatcher();
    this.stopHeuristic();
    this.checkpointController.stop();
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
      pendingPermission: this.hookController.getPendingPermission(),
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
    this.hookController.hookSessionStart(source);
  }

  /** Hook: Claude finished a turn → idle.
   *  Don't inject from here — the Stop hook fires before Claude Code's
   *  input prompt is fully interactive (writes get swallowed). The
   *  heuristic/screen detection confirms the prompt is visible first,
   *  then handles startup kicks, emcom, and checkpoints. */
  hookStop(): void {
    this.hookController.hookStop();
  }

  /** Hook: user/injection sent input → busy */
  hookPromptSubmit(): void {
    this.hookController.hookPromptSubmit();
  }

  /** Called when the user types into the terminal — marks input box as dirty.
   *  Cleared by hookPromptSubmit. Gates maybeFireOnIdle to avoid injecting
   *  while the user has unsent text in the input box. */
  markUserInput(data: string): void {
    this.hookController.markUserInput(data);
  }

  clearInputDirty(): void {
    this.hookController.clearInputDirty();
  }

  /** Hook: notification — Claude Code emits these for idle_prompt,
   *  permission_prompt, and potentially other types over time. Matcher
   *  is `.*` so all types reach us; handle the known ones, log the rest. */
  hookNotify(type: string): void {
    this.hookController.hookNotify(type);
  }

  /** Called when a hook signals idle. Fires the highest-priority pending
   *  inject: startup-kick, then emcom, then checkpoint. Mirrors what the
   *  heuristic used to do when it detected an "input" prompt via screen. */
  private maybeFireOnIdle(reason: string): void {
    if (this.status !== "idle") return;
    if (this.hookController.getInputBoxDirty()) {
      clog(`[${this.name}] maybeFireOnIdle skipped — input box dirty (trigger: ${reason})`);
      return;
    }
    const startupKick = this.hookController.consumeStartupKick();
    if (startupKick.needed) {
      const kick = startupKick.isResumed ? RESUME_KICK() : STARTUP_KICK();
      const kickType = startupKick.isResumed ? "resume-kick" : "startup-kick";
      log(`[${this.name}] Injecting ${startupKick.isResumed ? "resume" : "startup"} kick (trigger: ${reason})`);
      this.runInjection({
        prompt: kick,
        recordType: kickType,
        source: kickType,
      });
      return;
    }
    if (this.pendingMessages) {
      this.inject();
      return;
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

  /**
   * Returns escape sequences that re-establish all currently-active terminal
   * modes (alt-screen, mouse tracking, etc.) on a late-connecting xterm.js.
   * Prepended to the raw tail in WS replay so wheel events get forwarded to
   * apps like copilot that depend on mouse mode being on.
   */
  getModeReplay(): string {
    let out = "";
    for (const [mode, state] of this.modeState) {
      out += `\x1b[?${mode}${state}`;
    }
    return out;
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
    const checkpoint = this.checkpointController.getState();
    return {
      name: this.name, command: this.command, workingDir: this.workingDir,
      pid: this.ptyProcess?.pid,
      status: this.status,
      busyStartTime: this.busyStartTime,
      busyElapsedMs: this.busyStartTime > 0 && this.status === "busy" ? now - this.busyStartTime : 0,
      busyTimeoutSaved: this.busyTimeoutSaved,
      needsStartupKick: this.hookController.getNeedsStartupKick(),
      isResumedSession: this.hookController.getIsResumedSession(),
      dirtyOnExit: this.dirtyOnExit,
      pendingMessages: this.pendingMessages,
      unreadCount: this.unreadCount,
      pollerActive: this.poller !== null,
      pendingCheckpoint: checkpoint.pendingCheckpoint,
      checkpointInFlight: checkpoint.checkpointInFlight,
      lastCheckpointTime: checkpoint.lastCheckpointTime,
      lastCheckpointAgoMs: checkpoint.lastCheckpointTime > 0 ? now - checkpoint.lastCheckpointTime : null,
      checkpointLightTimerActive: checkpoint.checkpointLightTimerActive,
      checkpointFullTimerActive: checkpoint.checkpointFullTimerActive,
      heuristicTimerActive: this.heuristicController.isActive(),
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
      heuristic: { timerActive: this.heuristicController.isActive(), tickIntervalMs: 1000 },
      busyTimeout: { startTime: this.busyStartTime, elapsedMs: this.busyStartTime > 0 ? now - this.busyStartTime : 0, thresholdMs: this.config.busyTimeoutMs, timeoutSampleSaved: this.busyTimeoutSaved },
      hooks: {
        lastStopTime: this.hookController.getLastHookStopTime() || null,
        lastNotifyType: this.hookController.getLastHookNotifyType() || null,
        lastPromptSubmitTime: this.hookController.getLastHookPromptSubmitTime() || null,
      },
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
    return this.checkpointController.trigger(type);
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

    this.poller = this.buildEmcomPoller(identityName, server);

    this.poller.start();
    log(`[${this.name}] emcom attached dynamically (identity=${identityName})`);

    // Broadcast updated session info so frontend sees the identity
    this.emit("status-change", this.status);
  }

  private buildEmcomPoller(identity: string, server: string): EmcomPoller {
    return createEmcomPoller({
      server,
      identity,
      intervalMs: this.config.pollIntervalMs || DEFAULTS.pollIntervalMs,
      sessionName: this.name,
      onNewMessages: (emails) => this.handleEmcomMessages(emails),
      onUnreadCount: (count) => this.handleUnreadCount(count),
    });
  }

  private handleEmcomMessages(emails: EmcomEmail[]): void {
    const from = [...new Set(emails.map((e) => e.sender))];
    this.emit("notification", emails.length, from);
    this.pendingMessages = true;
    if (this.status === "idle") this.inject();
  }

  private handleUnreadCount(count: number): void {
    if (count === this.unreadCount) return;
    const wasZero = this.unreadCount === 0;
    this.unreadCount = count;
    this.pendingMessages = count > 0;
    this.emit("status-change");
    if (count > 0 && wasZero && this.status === "idle") this.inject();
  }

  private setStatus(s: SessionStatus): void {
    if (this.status === s) return;
    this.status = s;
    if (s === "busy") {
      this.busyStartTime = Date.now();
      this.busyTimeoutSaved = false;
    }
    if (s === "idle") this.checkpointController.onSessionIdle();
    this.emit("status-change", s);
  }

  private startHeuristic(): void {
    this.heuristicController.start();
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
  ): void {
    verifyInjectionAfter({
      source,
      snapshot,
      sessionName: this.name,
      submitKey: SUBMIT,
      getLastHookPromptSubmitTime: () => this.hookController.getLastHookPromptSubmitTime(),
      relayWrite: (text, relaySource) => this.relayWrite(text, relaySource),
      log: (message) => clog(message),
      onRecoveredByResend: (recoveredSnapshot, recoveredSource) => {
        void appendCorrection({
          time: new Date().toISOString(),
          session: this.name,
          screen: recoveredSnapshot.screen,
          llmSaid: recoveredSource === "llm-driven" ? true : null,
          llmWhy: recoveredSnapshot.why,
          actualOutcome: "recovered_by_resend",
        });
      },
      onGiveUp: (failedSnapshot, failedSource) => {
        void appendCorrection({
          time: new Date().toISOString(),
          session: this.name,
          screen: failedSnapshot.screen,
          llmSaid: failedSource === "llm-driven" ? true : null,
          llmWhy: failedSnapshot.why,
          actualOutcome: "gave_up",
        });
      },
    });
  }

  private stopHeuristic(): void {
    this.heuristicController.stop();
  }

  private inject(source: string = "emcom-auto"): void {
    if (this.hookController.getInputBoxDirty()) {
      clog(`[${this.name}] inject skipped — input box dirty (source: ${source})`);
      return;
    }
    this.pendingMessages = false;
    this.unreadCount = 0;
    const identity = this.config.emcomIdentity;
    const label = identity ? `${this.name} (@${identity})` : this.name;
    const prompt = INJECTION_PROMPT();
    clog(`emcom check → ${label}`);
    this.runInjection({
      prompt,
      recordType: "emcom",
      source,
    });
  }

  // --- Layer 2: Periodic checkpoint injection ---

  private injectCheckpoint(type: CheckpointType, prompt: string): void {
    const source = `checkpoint-${type}`;
    this.runInjection({
      prompt,
      recordType: source,
      source,
    });
  }

  private runInjection({
    prompt,
    recordType,
    source,
  }: {
    prompt: string;
    recordType: string;
    source: string;
  }): void {
    this.recordInjection(recordType, prompt);
    const screenAtInject = this.getRawTail(8 * 1024);
    this.relayWrite(prompt, source);
    this.setStatus("busy");
    this.verifyInjectAfter({ screen: screenAtInject, why: source, injectText: prompt }, source);

    // Cooldown: pause heuristic to avoid back-to-back auto-injects while
    // Claude is still rendering the current injected prompt.
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
