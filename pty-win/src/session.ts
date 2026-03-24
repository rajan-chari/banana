import * as pty from "node-pty";
import { EventEmitter } from "events";
import { EmcomClient } from "./emcom/client.js";
import { EmcomPoller } from "./emcom/poller.js";
import { ScreenDetector } from "./screen-detector.js";
import { readIdentity } from "./folders.js";
import type { SessionConfig } from "./config.js";
import { DEFAULTS } from "./config.js";
import { log } from "./log.js";

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
}

const INJECTION_PROMPT = "Check emcom inbox, read and handle new messages, and collaborate with others as needed. Use bare `emcom` command (it's in PATH).\r";
const STARTUP_KICK = "hi\r";
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

export class PtySession extends EventEmitter {
  private ptyProcess: pty.IPty;
  private poller: EmcomPoller | null = null;
  private identityWatcher: ReturnType<typeof setInterval> | null = null;
  private screenDetector: ScreenDetector;
  private heuristicTimer: ReturnType<typeof setInterval> | null = null;
  private status: SessionStatus = "starting";
  private pendingMessages = false;
  private unreadCount = 0;
  private lastOutputTime = Date.now();
  private needsStartupKick = false;
  readonly name: string;
  readonly command: string;
  readonly workingDir: string;

  constructor(private config: SessionConfig) {
    super();
    this.name = config.name;
    this.command = config.command;
    this.workingDir = config.workingDir;

    // Spawn process in PTY
    const AI_COMMANDS = ["claude", "agency cc", "agency gh", "copilot"];
    const isClaude = AI_COMMANDS.includes(config.command);
    const hasEmcom = !!(config.emcomIdentity && config.emcomServer);
    const preambleArgs = isClaude && hasEmcom
      ? ["--append-system-prompt", EMCOM_PREAMBLE]
      : [];
    const allArgs = [...preambleArgs, ...config.args];

    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const shellArgs = isWin
      ? ["/c", config.command, ...allArgs]
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
      this.stop();
      this.setStatus("dead");
      this.emit("exit", exitCode);
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
  }

  stop(): void {
    this.poller?.stop();
    this.stopIdentityWatcher();
    this.stopHeuristic();
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
    };
  }

  getSnapshot(n: number = 8): string[] {
    return this.screenDetector.snapshot(n);
  }

  clearUnread(): void {
    this.unreadCount = 0;
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
    this.emit("status-change", s);
  }

  private startHeuristic(): void {
    if (this.heuristicTimer) return;
    this.heuristicTimer = setInterval(() => {
      if (this.status !== "busy") return;

      const quietMs = Date.now() - this.lastOutputTime;
      if (quietMs < this.config.quietThresholdMs) return;

      // For Claude sessions, use screen-aware detection
      const isClaude = this.config.command === "claude";
      if (isClaude) {
        const promptType = this.screenDetector.detectPromptType();
        if (promptType === "input") {
          if (this.needsStartupKick) {
            this.needsStartupKick = false;
            log(`[${this.name}] Injecting startup kick (quiet ${quietMs}ms)`);
            this.ptyProcess.write(STARTUP_KICK);
            this.setStatus("busy");
            return;
          }
          this.setStatus("idle");
          if (this.pendingMessages) this.inject();
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
    log(`[${this.name}] Injecting emcom inbox check`);
    this.ptyProcess.write(INJECTION_PROMPT);
    this.setStatus("busy");

    // Cooldown: don't go idle again for a while
    const prevHeuristic = this.heuristicTimer;
    this.stopHeuristic();
    setTimeout(() => {
      if (this.status !== "dead") this.startHeuristic();
    }, this.config.injectionCooldownMs);
  }
}
