import * as pty from "node-pty";
import { EventEmitter } from "events";
import { EmcomClient } from "./emcom/client.js";
import { EmcomPoller } from "./emcom/poller.js";
import { ScreenDetector } from "./screen-detector.js";
import type { SessionConfig } from "./config.js";
import { log } from "./log.js";

export type SessionStatus = "starting" | "busy" | "idle" | "dead";

export interface SessionInfo {
  name: string;
  command: string;
  workingDir: string;
  pid: number;
  status: SessionStatus;
  emcomIdentity?: string;
  unreadCount: number;
}

const INJECTION_PROMPT = "Check emcom inbox, read and handle new messages, and collaborate with others as needed\r";
const QUIET_CHECK_INTERVAL_MS = 250;

export class PtySession extends EventEmitter {
  private ptyProcess: pty.IPty;
  private poller: EmcomPoller | null = null;
  private screenDetector: ScreenDetector;
  private heuristicTimer: ReturnType<typeof setInterval> | null = null;
  private status: SessionStatus = "starting";
  private pendingMessages = false;
  private unreadCount = 0;
  private lastOutputTime = Date.now();
  readonly name: string;
  readonly command: string;
  readonly workingDir: string;

  constructor(private config: SessionConfig) {
    super();
    this.name = config.name;
    this.command = config.command;
    this.workingDir = config.workingDir;

    // Spawn process in PTY
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const shellArgs = isWin
      ? ["/c", config.command, ...config.args]
      : ["-c", `${config.command} ${config.args.map((a) => `'${a}'`).join(" ")}`];

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
        this.unreadCount += emails.length;
        log(`[${this.name}] ${emails.length} new message(s) from: ${from.join(", ")}`);
        this.emit("notification", emails.length, from);
        this.pendingMessages = true;
        if (this.status === "idle") this.inject();
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

    // Transition from starting to busy after 5s
    setTimeout(() => {
      if (this.status === "starting") this.setStatus("busy");
    }, 5000);
  }

  start(): void {
    this.poller?.start();
    this.startHeuristic();
  }

  stop(): void {
    this.poller?.stop();
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
