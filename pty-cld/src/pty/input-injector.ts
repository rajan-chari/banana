import type * as pty from "node-pty";
import type { ScreenDetector } from "./screen-detector.js";
import { log } from "../log.js";

type State = "startup" | "idle" | "busy" | "injecting" | "cooldown";

const INJECTION_PROMPT = "Check emcom inbox, read and handle new messages, and collaborate with others as needed\r";
const STARTUP_KICK = "hi\r";
const STARTUP_GRACE_MS = 10_000;

// With screen detection confirming the ❯ prompt, a short quiet threshold is safe.
// The animation updates every ~100ms, so 1s of silence = output is done.
const SCREEN_AWARE_QUIET_MS = 1000;

export class InputInjector {
  private state: State = "startup";
  private lastOutputTime = Date.now();
  private pendingMessages = false;
  private idleDuringStartup = false;
  private needsStartupKick = false;
  private heuristicTimer: ReturnType<typeof setInterval> | null = null;
  private screenDetector: ScreenDetector | null = null;

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

  /** Call on every PTY output event */
  onOutput(): void {
    this.lastOutputTime = Date.now();
    if (this.state === "idle") {
      this.state = "busy";
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
   * With a ScreenDetector, uses a short quiet threshold (1s) since the detector
   * confirms the ❯ prompt before acting. Without one, disabled by default.
   */
  startHeuristic(enabled?: boolean): void {
    const shouldEnable = enabled ?? !!this.screenDetector;
    if (!shouldEnable || this.heuristicTimer) return;
    const threshold = this.screenDetector ? SCREEN_AWARE_QUIET_MS : this.quietThresholdMs;
    log(`[${this.sessionName}] Heuristic idle detection enabled (screen-aware: ${!!this.screenDetector}, quiet threshold: ${threshold}ms)`);
    this.heuristicTimer = setInterval(() => {
      if (this.state !== "busy") return;

      const quietMs = Date.now() - this.lastOutputTime;
      if (quietMs <= threshold) return;

      if (this.screenDetector) {
        const promptType = this.screenDetector.detectPromptType();
        if (promptType === "input") {
          if (this.needsStartupKick) {
            this.needsStartupKick = false;
            log(`[${this.sessionName}] Injecting startup kick (quiet ${quietMs}ms)`);
            this.ptyProcess.write(STARTUP_KICK);
            this.state = "cooldown";
            setTimeout(() => { this.state = "busy"; }, this.cooldownMs);
            return;
          }

          log(`[${this.sessionName}] Idle (heuristic, quiet ${quietMs}ms)`);
          this.state = "idle";
          if (this.pendingMessages) {
            this.inject();
          }
        }
        // permission, busy, or unknown → stay busy
      } else {
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
