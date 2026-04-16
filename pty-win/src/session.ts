import * as pty from "@homebridge/node-pty-prebuilt-multiarch";
import { execFile } from "child_process";
import { EventEmitter } from "events";
import { EmcomClient } from "./emcom/client.js";
import { EmcomPoller } from "./emcom/poller.js";
import { ScreenDetector } from "./screen-detector.js";
import { readIdentity } from "./folders.js";
import type { SessionConfig } from "./config.js";
import { DEFAULTS } from "./config.js";
import { log, clog } from "./log.js";
import { saveMlSample } from "./ml-dataset.js";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mlWorker: Worker | null = null;
let mlWorkerReady = false;
let mlReqId = 0;
const mlPending = new Map<number, (r: { label: string; confidence: number } | null) => void>();

function getMLWorker(): Worker | null {
  if (mlWorker) return mlWorker;
  try {
    mlWorker = new Worker(join(__dirname, "ml-worker.js"));
    mlWorker.on("message", ({ id, label, confidence, error }) => {
      const resolve = mlPending.get(id);
      mlPending.delete(id);
      if (resolve) resolve(error || !label ? null : { label, confidence });
    });
    mlWorker.on("error", () => { mlWorker = null; mlWorkerReady = false; });
    mlWorker.on("exit", () => { mlWorker = null; mlWorkerReady = false; });
    mlWorkerReady = true;
    return mlWorker;
  } catch {
    return null;
  }
}

async function runLocalMLInference(
  modelPath: string,
  lines: string[]
): Promise<{ label: string; confidence: number } | null> {
  const worker = getMLWorker();
  if (!worker) return null;
  return new Promise((resolve) => {
    const id = ++mlReqId;
    mlPending.set(id, resolve);
    worker.postMessage({ id, modelPath, lines });
  });
}

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
  private screenDetector: ScreenDetector;
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
  private lastSavedLabel: string | null = null;
  private lastSavedAt = 0;
  private mlQueryInFlight = false;
  private dataEvents: DataEvent[] = [];
  private injectionHistory: Array<{ time: number; type: string; prompt: string; statusBefore: string }> = [];
  private detectionHistory: Array<{ time: number; quietMs: number; promptType: string; mlResult: string | null; statusBefore: string; statusAfter: string; action: string; reason: string }> = [];
  private lastHookStopTime = 0;
  private lastHookNotifyType = "";
  private lastHookPromptSubmitTime = 0;
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
    const AI_COMMANDS = ["claude", "agency cc", "agency cp", "copilot"];
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

    // Screen detector
    this.screenDetector = new ScreenDetector(cols, rows, config.name);

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

    this.ptyProcess.onData((data) => {
      const now = Date.now();
      this.lastOutputTime = now;
      this.dataEvents.push({ t: now, bytes: data.length, isBusy: this.status === "busy" });
      this.screenDetector.write(data);
      const costMatch = costRegexExit.exec(data) || costRegexLive.exec(data);
      if (costMatch) this.costUsd = parseFloat(costMatch[1]);
      this.emit("data", data);
      if (this.status === "idle" || this.status === "starting") {
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

    // Startup grace period
    setTimeout(() => {
      const isResume = config.args.includes("--continue") || config.args.includes("-c");
      if (isClaude && this.status !== "dead") {
        this.needsStartupKick = true;
        this.isResumedSession = isResume;
        log(`[${this.name}] Startup grace ended — will kick when prompt detected (${isResume ? "resume" : "fresh"})`);
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
    this.screenDetector.dispose();
  }

  write(data: string | Buffer): void {
    this.ptyProcess.write(typeof data === "string" ? data : data.toString());
  }

  /** Relay a prompt injection via MessageChannel.
   *  PTY writes from setInterval callbacks (heuristic tick) are unreliable —
   *  Claude Code swallows \r for long text. MessagePort.on('message') runs in
   *  the I/O phase of the event loop (same as HTTP handlers), making writes
   *  reliable. The actual write (text + delayed SUBMIT) is handled by the
   *  injectWrite() function in server.ts, triggered by the port message. */
  relayWrite(text: string): void {
    this.config.injectionPort.postMessage({ name: this.name, text });
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
    this.screenDetector.resize(cols, rows);
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
    };
  }

  getSnapshot(n: number = 8): string[] {
    return this.screenDetector.snapshot(n);
  }

  clearUnread(): void {
    this.unreadCount = 0;
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
    this.setStatus("idle");
  }

  /** Hook: user/injection sent input → busy */
  hookPromptSubmit(): void {
    if (this.status === "dead") return;
    this.lastHookPromptSubmitTime = Date.now();
    clog(`hook:prompt-submit → ${this.name} (was ${this.status})`);
    this.setStatus("busy");
  }

  /** Hook: notification (idle_prompt or permission_prompt) */
  hookNotify(type: string): void {
    if (this.status === "dead") return;
    this.lastHookNotifyType = type;
    if (type === "permission_prompt") {
      clog(`hook:notify(permission) → ${this.name}`);
      // Don't change status — permission prompts are transient
      return;
    }
    if (type === "idle_prompt") {
      clog(`hook:notify(idle) → ${this.name} — confirmed idle`);
      // Redundant with hookStop but confirms idle state
      if (this.status !== "idle") this.setStatus("idle");
      // Don't inject here — let the heuristic/screen detection handle it
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

  getContentLines(n: number): string[] {
    return this.screenDetector.getContentLines(n);
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
      mlQueryInFlight: this.mlQueryInFlight,
      lastSavedLabel: this.lastSavedLabel,
      lastSavedAt: this.lastSavedAt,
      costUsd: this.costUsd,
      injectionHistory: this.injectionHistory,
      detectionHistory: this.detectionHistory,
    };
  }

  getDetectionState(): Record<string, unknown> {
    const now = Date.now();
    const quietMs = now - this.lastOutputTime;
    const promptType = this.screenDetector.detectPromptType();
    const contentLines = this.screenDetector.getContentLines(8);
    return {
      session: this.name, status: this.status,
      quiet: { lastOutputTime: this.lastOutputTime, quietMs, thresholdMs: this.config.quietThresholdMs, isQuiet: quietMs >= this.config.quietThresholdMs },
      screen: { promptType, cursorY: this.screenDetector.getCursorY(), contentLines },
      heuristic: { timerActive: this.heuristicTimer !== null, tickIntervalMs: 1000 },
      ml: { queryInFlight: this.mlQueryInFlight, modelPath: this.config.mlModelPath || null, lastSavedLabel: this.lastSavedLabel, lastSavedAt: this.lastSavedAt },
      busyTimeout: { startTime: this.busyStartTime, elapsedMs: this.busyStartTime > 0 ? now - this.busyStartTime : 0, thresholdMs: this.config.busyTimeoutMs, timeoutSampleSaved: this.busyTimeoutSaved },
      hooks: { lastStopTime: this.lastHookStopTime || null, lastNotifyType: this.lastHookNotifyType || null, lastPromptSubmitTime: this.lastHookPromptSubmitTime || null },
    };
  }

  getDetectionHistory() { return this.detectionHistory; }
  getInjectionHistory() { return this.injectionHistory; }

  debugForceInject(): void {
    const prompt = INJECTION_PROMPT();
    this.recordInjection("emcom", prompt);
    this.relayWrite(prompt);
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

  applyMLInference(label: string, confidence: number): void {
    if (this.status !== "busy") return;
    if (label === "not_busy" && confidence > 0.75) {
      const crossCheck = this.screenDetector.detectPromptType();
      if (crossCheck === "input" || crossCheck === "unknown") {
        log(`[${this.name}] ML inference: not_busy (conf=${confidence.toFixed(2)}) confirmed by screen → going idle`);
        this.setStatus("idle");
      }
    }
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
    this.heuristicTimer = setInterval(() => {
      if (this.status !== "busy") return;

      const quietMs = Date.now() - this.lastOutputTime;
      if (quietMs < this.config.quietThresholdMs) return;

      // For AI sessions, use screen-aware detection
      const AI_CMDS = ["claude", "agency cc", "agency cp", "copilot"];
      const isAI = AI_CMDS.includes(this.config.command);
      if (isAI) {
        // Busy timeout: save a sample once if busy too long
        const busyTimeoutMs = this.config.busyTimeoutMs;
        if (!this.busyTimeoutSaved && this.busyStartTime > 0 && Date.now() - this.busyStartTime > busyTimeoutMs) {
          this.busyTimeoutSaved = true;
          saveMlSample(
            this.config.mlDataDir,
            this.screenDetector.getContentLines(20),
            "busy",
            "uncertain",
            "timeout_flag",
            this.name
          );
        }

        const promptType = this.screenDetector.detectPromptType();
        if (promptType === "input" || promptType === "busy") {
          const label = promptType === "input" ? "not_busy" : "busy";
          const now = Date.now();
          const isTransition = label !== this.lastSavedLabel;
          const isPeriodicDue = now - this.lastSavedAt >= 60_000;
          if (isTransition || isPeriodicDue) {
            this.lastSavedLabel = label;
            this.lastSavedAt = now;
            saveMlSample(
              this.config.mlDataDir,
              this.screenDetector.getContentLines(20),
              label,
              "auto",
              "auto_detect",
              this.name,
              this.config.mlCollectionMaxSamples
            );
          }
        }
        if (promptType === "input") {
          if (this.needsStartupKick) {
            this.needsStartupKick = false;
            const kick = this.isResumedSession ? RESUME_KICK() : STARTUP_KICK();
            const kickType = this.isResumedSession ? "resume-kick" : "startup-kick";
            log(`[${this.name}] Injecting ${this.isResumedSession ? "resume" : "startup"} kick (quiet ${quietMs}ms)`);
            this.recordInjection(kickType, kick);
            this.recordDetectionTick(quietMs, promptType, null, kickType, "input prompt detected, startup kick pending");
            this.relayWrite(kick);
            this.setStatus("busy");
            return;
          }
          this.recordDetectionTick(quietMs, promptType, null, "idle", "input prompt detected");
          this.setStatus("idle");
          // Priority: emcom messages first, then checkpoint
          if (this.pendingMessages) this.inject();
          else if (this.pendingCheckpoint && !this.checkpointStartDelay) {
            this.scheduleCheckpointInjection(this.pendingCheckpoint);
          }
        } else if (promptType === "unknown" && !this.mlQueryInFlight && this.config.mlModelPath) {
          // Regex inconclusive — ask local ONNX model
          this.mlQueryInFlight = true;
          this.recordDetectionTick(quietMs, promptType, null, "ml-query", "regex inconclusive, dispatched ML");
          const lines = this.screenDetector.getContentLines(20);
          runLocalMLInference(this.config.mlModelPath, lines).then((result) => {
            this.mlQueryInFlight = false;
            if (result && result.label === "not_busy" && result.confidence > 0.75 && this.status === "busy") {
              log(`[${this.name}] ML inference: not_busy (conf=${result.confidence.toFixed(2)}) → idle`);
              this.recordDetectionTick(quietMs, "ml-result", result.label, "idle", `ML: not_busy conf=${result.confidence.toFixed(2)}`);
              this.setStatus("idle");
              if (this.pendingMessages) this.inject();
              else if (this.pendingCheckpoint && !this.checkpointStartDelay) {
                this.scheduleCheckpointInjection(this.pendingCheckpoint);
              }
            }
          });
        } else if (promptType === "busy") {
          this.recordDetectionTick(quietMs, promptType, null, "none", "busy animation detected");
        } else {
          this.recordDetectionTick(quietMs, promptType, null, "none", `promptType=${promptType}, waiting`);
        }
      } else {
        // For generic sessions, just check quiet threshold (longer: 3s)
        if (quietMs >= 3000) {
          this.setStatus("idle");
        }
      }
    }, QUIET_CHECK_INTERVAL_MS);
  }

  private stopHeuristic(): void {
    if (this.heuristicTimer) {
      clearInterval(this.heuristicTimer);
      this.heuristicTimer = null;
    }
  }

  private inject(): void {
    this.pendingMessages = false;
    this.unreadCount = 0;
    const identity = this.config.emcomIdentity;
    const label = identity ? `${this.name} (@${identity})` : this.name;
    const prompt = INJECTION_PROMPT();
    clog(`emcom check → ${label}`);
    this.recordInjection("emcom", prompt);
    this.relayWrite(prompt);
    this.setStatus("busy");

    // Cooldown: don't go idle again for a while
    this.stopHeuristic();
    setTimeout(() => {
      if (this.status !== "dead") this.startHeuristic();
    }, this.config.injectionCooldownMs);
  }

  // --- Layer 2: Periodic checkpoint injection ---

  private startCheckpointTimers(): void {
    const AI_COMMANDS = ["claude", "agency cc", "agency cp", "copilot"];
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
    this.relayWrite(prompt);
    this.setStatus("busy");

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
