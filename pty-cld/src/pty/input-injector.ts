import type * as pty from "node-pty";
import type { ScreenDetector } from "./screen-detector.js";
import { log } from "../log.js";

type State = "startup" | "idle" | "busy" | "injecting" | "cooldown";

const INJECTION_PROMPT = "Check emcom inbox, read and handle new messages, and collaborate with others as needed\r";
const STARTUP_KICK = "hi\r";
const STARTUP_GRACE_MS = 10_000;

// Strip ANSI escape sequences so regexes match the visible text
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g;
function stripAnsi(s: string): string { return s.replace(ANSI_RE, ""); }

// Stream-based detection patterns (applied to ANSI-stripped data)
const STREAM_BUSY_RE = /\S+…\s+\(/;              // "Zigzagging… (" in data stream
const STREAM_COMPLETION_RE = /\S+\s+for\s+\d+[ms]/; // "Cooked for 1m" in data stream

// When we see a completion signal in the stream, reduce quiet threshold to this
const FAST_QUIET_MS = 500;

export class InputInjector {
  private state: State = "startup";
  private lastOutputTime = Date.now();
  private pendingMessages = false;
  private idleDuringStartup = false;
  private needsStartupKick = false;
  private heuristicTimer: ReturnType<typeof setInterval> | null = null;
  private screenDetector: ScreenDetector | null = null;
  private sawCompletion = false;
  private completionTime = 0;

  constructor(
    private ptyProcess: pty.IPty,
    private quietThresholdMs: number,
    private cooldownMs: number,
    private sessionName: string,
  ) {
    // Grace period: ignore everything for first 10s while Claude boots
    setTimeout(() => {
      if (this.state === "startup") {
        log(`[${this.sessionName}] Startup grace period ended`);
        if (this.idleDuringStartup) {
          this.state = "idle";
          log(`[${this.sessionName}] Idle (deferred from startup)`);
          if (this.pendingMessages) {
            this.inject();
          }
        } else {
          this.state = "busy";
          this.needsStartupKick = true;
          log(`[${this.sessionName}] Needs startup kick — heuristic will handle`);
        }
      }
    }, STARTUP_GRACE_MS);
  }

  /** Call on every PTY output event — also scans for stream signals */
  onOutput(data?: string): void {
    const now = Date.now();
    this.lastOutputTime = now;
    if (this.state === "idle") {
      this.state = "busy";
    }

    // Stream-based detection: strip ANSI codes then match patterns
    if (data) {
      const clean = stripAnsi(data);
      if (STREAM_COMPLETION_RE.test(clean)) {
        if (!this.sawCompletion) {
          log(`[${this.sessionName}] Stream: completion detected ("${clean.trim().slice(0, 60)}")`);
        }
        this.sawCompletion = true;
        this.completionTime = now;
      } else if (STREAM_BUSY_RE.test(clean)) {
        if (this.sawCompletion) {
          log(`[${this.sessionName}] Stream: busy animation resumed — clearing completion`);
          this.sawCompletion = false;
        }
      }
    }
  }

  /** Called when emcom poller detects new messages */
  notifyNewMessages(): void {
    this.pendingMessages = true;
    if (this.state === "idle") {
      this.inject();
    }
  }

  /** Called by idle hook (HTTP POST /idle) */
  signalIdle(): void {
    if (this.state === "startup") {
      this.idleDuringStartup = true;
      log(`[${this.sessionName}] Idle hook during startup — deferring`);
      return;
    }
    this.setIdle("hook");
  }

  private setIdle(source: "hook" | "heuristic"): void {
    if (this.state === "busy") {
      const quietMs = Date.now() - this.lastOutputTime;
      this.state = "idle";
      log(`[${this.sessionName}] Idle (${source}, quiet ${quietMs}ms)`);
      if (this.pendingMessages) {
        this.inject();
      }
    }
  }

  /** Attach a screen detector for screen-aware idle detection */
  setScreenDetector(detector: ScreenDetector): void {
    this.screenDetector = detector;
  }

  /**
   * Start the screen-aware heuristic timer.
   * When a ScreenDetector is attached, this is enabled by default — the detector
   * can distinguish input prompts from permission prompts, making the heuristic safe.
   * Without a detector, the heuristic is disabled by default (pass enabled=true to force).
   */
  startHeuristic(enabled?: boolean): void {
    const shouldEnable = enabled ?? !!this.screenDetector;
    if (!shouldEnable || this.heuristicTimer) return;
    log(`[${this.sessionName}] Heuristic idle detection enabled (screen-aware: ${!!this.screenDetector}, fast quiet: ${FAST_QUIET_MS}ms)`);
    this.heuristicTimer = setInterval(() => {
      if (this.state !== "busy") return;

      const quietMs = Date.now() - this.lastOutputTime;
      const threshold = this.sawCompletion ? FAST_QUIET_MS : this.quietThresholdMs;

      if (quietMs <= threshold) return;

      // Check screen state
      if (this.screenDetector) {
        const promptType = this.screenDetector.detectPromptType();
        if (promptType === "input") {
          // Startup kick: first time we see input prompt after boot
          if (this.needsStartupKick) {
            this.needsStartupKick = false;
            this.sawCompletion = false;
            log(`[${this.sessionName}] Injecting startup kick (quiet ${quietMs}ms)`);
            this.ptyProcess.write(STARTUP_KICK);
            this.state = "cooldown";
            setTimeout(() => { this.state = "busy"; }, this.cooldownMs);
            return;
          }

          const latency = this.sawCompletion ? Date.now() - this.completionTime : null;
          log(`[${this.sessionName}] Idle (heuristic, quiet ${quietMs}ms, threshold ${threshold}ms${latency !== null ? `, completion→idle ${latency}ms` : ""})`);
          this.sawCompletion = false;
          this.state = "idle";
          if (this.pendingMessages) {
            this.inject();
          }
        }
        // permission, busy, or unknown → stay busy (screen-detector already logged why)
      } else {
        // No screen detector — blind heuristic (unsafe, only if forced)
        if (this.needsStartupKick) {
          this.needsStartupKick = false;
          log(`[${this.sessionName}] Injecting startup kick (quiet ${quietMs}ms, no screen)`);
          this.ptyProcess.write(STARTUP_KICK);
          this.state = "cooldown";
          setTimeout(() => { this.state = "busy"; }, this.cooldownMs);
        } else {
          this.setIdle("heuristic");
        }
      }
    }, 250);
  }

  stopHeuristic(): void {
    if (this.heuristicTimer) {
      clearInterval(this.heuristicTimer);
      this.heuristicTimer = null;
    }
  }

  private inject(): void {
    this.state = "injecting";
    this.pendingMessages = false;
    log(`[${this.sessionName}] Injecting emcom inbox check`);
    this.ptyProcess.write(INJECTION_PROMPT);

    this.state = "cooldown";
    setTimeout(() => {
      this.state = "busy";
    }, this.cooldownMs);
  }

  getState(): State {
    return this.state;
  }
}
