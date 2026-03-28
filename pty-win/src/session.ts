import * as pty from "node-pty";
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

export type SessionStatus = "starting" | "busy" | "idle" | "dead";

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
}

const INJECTION_PROMPT = "[pty-win:emcom:normal:normal]\nCheck emcom inbox, read and handle new messages, and collaborate with others as needed. Use bare `emcom` command (it's in PATH).\r";
const STARTUP_KICK = "[pty-win:startup-kick:routine:brief]\nhi\r";
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
const QUIET_CHECK_INTERVAL_MS = 250;

// Periodic checkpoint injection (Layer 2)
const CHECKPOINT_LIGHT_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const CHECKPOINT_FULL_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hrs
const CHECKPOINT_LIGHT_PROMPT =
  "[pty-win:checkpoint-light:routine:brief:skip-if-busy]\nCheckpoint: update tracker.md and briefing.md if there are changes, commit and push.\r";
const CHECKPOINT_FULL_PROMPT =
  "[pty-win:checkpoint-full:normal:normal]\nFull checkpoint: update briefing.md, then run /rc-save, /rc-session-save, /rc-greet-save.\r";

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
  private dirtyOnExit = false;
  private busyStartTime = 0;
  private busyTimeoutSaved = false;
  private lastSavedLabel: string | null = null;
  private lastSavedAt = 0;
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
    this.ptyProcess.onData((data) => {
      this.lastOutputTime = Date.now();
      this.screenDetector.write(data);
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
      if (isClaude && this.status !== "dead" && !isResume) {
        this.needsStartupKick = true;
        log(`[${this.name}] Startup grace ended — will kick when prompt detected`);
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
    this.ptyProcess.write(data);
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
    };
  }

  getSnapshot(n: number = 8): string[] {
    return this.screenDetector.snapshot(n);
  }

  clearUnread(): void {
    this.unreadCount = 0;
  }

  /** Force session to idle — triggers emcom injection if messages are pending. */
  forceIdle(): void {
    log(`[${this.name}] Force-idle requested (was ${this.status})`);
    this.setStatus("idle");
    if (this.pendingMessages) this.inject();
  }

  getContentLines(n: number): string[] {
    return this.screenDetector.getContentLines(n);
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
            log(`[${this.name}] Injecting startup kick (quiet ${quietMs}ms)`);
            this.ptyProcess.write(STARTUP_KICK);
            this.setStatus("busy");
            return;
          }
          this.setStatus("idle");
          // Priority: emcom messages first, then checkpoint
          if (this.pendingMessages) this.inject();
          else if (this.pendingCheckpoint && !this.checkpointStartDelay) {
            this.scheduleCheckpointInjection(this.pendingCheckpoint);
          }
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
    clog(`emcom check → ${label}`);
    this.ptyProcess.write(INJECTION_PROMPT);
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
    const prompt = type === "full" ? CHECKPOINT_FULL_PROMPT : CHECKPOINT_LIGHT_PROMPT;
    this.pendingCheckpoint = null;
    this.checkpointInFlight = true;
    clog(`injecting ${type} checkpoint → ${this.name}`);
    this.ptyProcess.write(prompt);
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
