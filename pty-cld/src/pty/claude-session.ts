import * as pty from "node-pty";
import { EventEmitter } from "events";
import { EmcomClient } from "../emcom/client.js";
import { EmcomPoller } from "../emcom/poller.js";
import { InputInjector } from "./input-injector.js";
import { writePortFile, removePortFile } from "../hooks.js";
import type { SessionConfig } from "../config.js";
import { log } from "../log.js";

export interface ClaudeSessionEvents {
  data: (data: string) => void;
  exit: (code: number | undefined) => void;
  notification: (count: number, from: string[]) => void;
}

export class ClaudeSession extends EventEmitter {
  private ptyProcess: pty.IPty;
  private poller: EmcomPoller;
  private injector: InputInjector;
  readonly name: string;

  constructor(
    private config: SessionConfig,
    controlPort: number,
  ) {
    super();
    this.name = config.name;

    // Write port file so the global Notification hook knows where to POST
    writePortFile(config.workingDir, controlPort, config.name);

    // Spawn Claude CLI in PTY
    const appendPrompt =
      "Emcom inbox checks are handled externally by pty-cld. " +
      "Do NOT use /loop, CronCreate, or emcom-monitor to poll for messages. " +
      "You will be prompted to check inbox automatically when new messages arrive. " +
      "When you receive emcom messages, triage before replying — not every message needs a response.";
    const claudeArgs = [
      "--append-system-prompt", appendPrompt,
      ...config.claudeArgs,
    ];
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const shellArgs = isWin
      ? ["/c", "claude", ...claudeArgs]
      : ["-c", `claude ${claudeArgs.map((a) => `'${a}'`).join(" ")}`];

    this.ptyProcess = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: config.workingDir,
      env: process.env as Record<string, string>,
    });

    // Emcom client + poller
    const client = new EmcomClient(config.emcomServer, config.emcomIdentity);
    this.poller = new EmcomPoller(client, config.pollIntervalMs);

    // Input injector
    this.injector = new InputInjector(
      this.ptyProcess,
      config.quietThresholdMs,
      config.injectionCooldownMs,
      config.name,
    );

    // Wire PTY output
    this.ptyProcess.onData((data) => {
      this.injector.onOutput();
      this.emit("data", data);
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this.stop();
      this.emit("exit", exitCode);
    });

    // Wire poller -> injector
    this.poller.onNewMessages((emails) => {
      const from = [...new Set(emails.map((e) => e.sender))];
      log(`[${this.name}] ${emails.length} new message(s) from: ${from.join(", ")}`);
      this.emit("notification", emails.length, from);
      this.injector.notifyNewMessages();
    });
  }

  start(): void {
    this.poller.start();
    this.injector.startHeuristic();
  }

  stop(): void {
    this.poller.stop();
    this.injector.stopHeuristic();
    removePortFile(this.config.workingDir, this.name);
  }

  write(data: string | Buffer): void {
    this.ptyProcess.write(data);
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
  }

  /** Called by control API when idle hook fires */
  signalIdle(): void {
    this.injector.signalIdle();
  }

  kill(): void {
    this.stop();
    this.ptyProcess.kill();
  }

  getPid(): number {
    return this.ptyProcess.pid;
  }
}
