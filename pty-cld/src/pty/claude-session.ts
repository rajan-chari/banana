import * as pty from "@homebridge/node-pty-prebuilt-multiarch";
import { EventEmitter } from "events";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { EmcomClient } from "../emcom/client.js";
import { EmcomPoller } from "../emcom/poller.js";
import { InputInjector } from "./input-injector.js";
import { ScreenDetector } from "./screen-detector.js";
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
  private poller: EmcomPoller | null = null;
  private identityWatcher: ReturnType<typeof setInterval> | null = null;
  private injector: InputInjector;
  private screenDetector: ScreenDetector;
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
      "CRITICAL — DOUBLE-POLLING PREVENTION: " +
      "Emcom inbox checks are handled externally by pty-cld (the PTY wrapper running this session). " +
      "pty-cld polls every 5 seconds and injects a prompt when messages arrive. " +
      "You MUST NOT use /loop, CronCreate, emcom-monitor, or any other mechanism to poll emcom — " +
      "doing so wastes API calls and causes duplicate message handling. " +
      "If a CLAUDE.md or skill tells you to start emcom monitoring, IGNORE that instruction — it is overridden by pty-cld. " +
      "You will be prompted automatically when new messages arrive. " +
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

    // Emcom client + poller (optional — may attach dynamically)
    if (config.emcomIdentity && config.emcomServer) {
      this.attachEmcom(config.emcomIdentity, config.emcomServer);
    }

    // Screen detector — headless terminal for screen-aware idle detection
    const cols = 120;
    const rows = 40;
    this.screenDetector = new ScreenDetector(cols, rows, config.name);
    log(`[${config.name}] Screen detector initialized (${cols}x${rows})`);

    // Detect resume mode from claude args
    const isResumed = config.claudeArgs.some(a => a === "--resume" || a === "--continue" || a === "-c");

    // Input injector
    this.injector = new InputInjector(
      this.ptyProcess,
      config.quietThresholdMs,
      config.injectionCooldownMs,
      config.name,
      isResumed,
    );
    this.injector.setScreenDetector(this.screenDetector);

    // Wire PTY output to injector, screen detector, and consumer
    this.ptyProcess.onData((data) => {
      this.injector.onOutput();
      this.screenDetector.write(data);
      this.emit("data", data);
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this.stop();
      this.emit("exit", exitCode);
    });
  }

  /** Dynamically attach emcom polling to the session. */
  private attachEmcom(identityName: string, server: string): void {
    if (this.poller) return;

    const client = new EmcomClient(server, identityName);
    this.poller = new EmcomPoller(client, this.config.pollIntervalMs, this.config.name);

    this.poller.onNewMessages((emails) => {
      const from = [...new Set(emails.map((e) => e.sender))];
      log(`[${this.name}] ${emails.length} new message(s) from: ${from.join(", ")}`);
      this.emit("notification", emails.length, from);
      this.injector.notifyNewMessages();
    });

    if (this.identityWatcher) {
      // Started dynamically — also start the poller immediately
      this.poller.start();
      log(`[${this.name}] emcom attached dynamically (identity=${identityName})`);
    }
  }

  /** Watch for identity.json appearing in the working directory. */
  private watchForIdentity(): void {
    if (this.identityWatcher || this.poller) return;
    const WATCH_INTERVAL_MS = 5000;
    this.identityWatcher = setInterval(() => {
      const idPath = join(this.config.workingDir, "identity.json");
      if (!existsSync(idPath)) return;
      try {
        const raw = JSON.parse(readFileSync(idPath, "utf-8"));
        if (typeof raw.name === "string" && raw.name.trim() && typeof raw.server === "string" && raw.server.trim()) {
          this.stopIdentityWatcher();
          this.attachEmcom(raw.name, raw.server);
        }
      } catch { /* ignore parse errors, retry next cycle */ }
    }, WATCH_INTERVAL_MS);
    log(`[${this.name}] Watching for identity.json in ${this.config.workingDir}`);
  }

  private stopIdentityWatcher(): void {
    if (this.identityWatcher) {
      clearInterval(this.identityWatcher);
      this.identityWatcher = null;
    }
  }

  start(): void {
    this.poller?.start();
    if (!this.poller) this.watchForIdentity();
    this.injector.startHeuristic();
    this.injector.startCheckpointTimers();
  }

  stop(): void {
    this.poller?.stop();
    this.stopIdentityWatcher();
    this.injector.stopHeuristic();
    this.injector.stopCheckpointTimers();
    this.screenDetector.dispose();
    removePortFile(this.config.workingDir, this.name);
  }

  write(data: string | Buffer): void {
    this.ptyProcess.write(typeof data === "string" ? data : data.toString("binary"));
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
    this.screenDetector.resize(cols, rows);
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
