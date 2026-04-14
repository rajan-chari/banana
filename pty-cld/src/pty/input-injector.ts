import type * as pty from "@homebridge/node-pty-prebuilt-multiarch";
import type { ScreenDetector } from "./screen-detector.js";
import { log } from "../log.js";

type State = "startup" | "idle" | "busy" | "injecting" | "cooldown";

const INJECTION_PROMPT = "[pty-cld:emcom:normal:normal]\nCheck emcom inbox, read and handle new messages, and collaborate with others as needed. Use bare `emcom` command (it's in PATH).\r";
const STARTUP_KICK = "[pty-cld:startup-kick:routine:brief]\nhi\r";
const RESUME_KICK = "[pty-cld:session-resumed:normal:brief]\nSession resumed. Restart any loops or crons that were running before shutdown.\r";
const STARTUP_GRACE_MS = 10_000;

// With screen detection confirming the ❯ prompt, a short quiet threshold is safe.
// The animation updates every ~100ms, so 1s of silence = output is done.
const SCREEN_AWARE_QUIET_MS = 1000;

// Periodic checkpoint injection (Layer 2)
const CHECKPOINT_LIGHT_INTERVAL_MS = 2 * 60 * 60 * 1000;  // 2 hrs
const CHECKPOINT_FULL_INTERVAL_MS  = 4 * 60 * 60 * 1000;  // 4 hrs

function fmtNextTime(intervalMs: number): string {
  const d = new Date(Date.now() + intervalMs);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function makeCheckpointLightPrompt(nextTime: string): string {
  return `[pty-cld:checkpoint-light:routine:brief:skip-if-busy]\nCheckpoint (light, next ~${nextTime}): update tracker.md and briefing.md in-place if there are changes.\r`;
}

function makeCheckpointFullPrompt(nextTime: string): string {
  return `[pty-cld:checkpoint-full:normal:normal]\nFull checkpoint (next ~${nextTime}): update briefing.md, then run /rc-save, /rc-session-save, /rc-greet-save.\r`;
}

export class InputInjector {
  private state: State = "startup";
  private lastOutputTime = Date.now();
  private pendingMessages = false;
  private idleDuringStartup = false;
  private needsStartupKick = false;
  private isResumedSession = false;
  private heuristicTimer: ReturnType<typeof setInterval> | null = null;
  private screenDetector: ScreenDetector | null = null;
  private checkpointLightTimer: ReturnType<typeof setInterval> | null = null;
  private checkpointFullTimer: ReturnType<typeof setInterval> | null = null;
  private pendingCheckpoint: "light" | "full" | null = null;
  private checkpointInFlight = false;
  private lastCheckpointTime = 0;

  constructor(
    private ptyProcess: pty.IPty,
    private quietThresholdMs: number,
    private cooldownMs: number,
    private sessionName: string,
    isResumed: boolean = false,
  ) {
    this.isResumedSession = isResumed;
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
      if (this.checkpointInFlight) {
        this.checkpointInFlight = false;
        this.lastCheckpointTime = Date.now();
      }
      log(`[${this.sessionName}] Idle (${source}, quiet ${quietMs}ms)`);
      // Priority: emcom messages first, then checkpoint
      if (this.pendingMessages) {
        this.inject();
      } else if (this.pendingCheckpoint) {
        this.injectCheckpoint();
      }
    }
  }

  /** Attach a screen detector for screen-aware idle detection */
  setScreenDetector(detector: ScreenDetector): void {
    this.screenDetector = detector;
  }

  // --- Checkpoint injection (Layer 2) ---

  startCheckpointTimers(): void {
    this.checkpointLightTimer = setInterval(() => {
      if (this.pendingCheckpoint === "full") return;
      if (this.lastOutputTime <= this.lastCheckpointTime) {
        log(`[${this.sessionName}] Checkpoint (light) skipped — no activity`);
        return;
      }
      this.pendingCheckpoint = "light";
      if (this.state === "idle") this.injectCheckpoint();
    }, CHECKPOINT_LIGHT_INTERVAL_MS);

    this.checkpointFullTimer = setInterval(() => {
      if (this.lastOutputTime <= this.lastCheckpointTime) {
        log(`[${this.sessionName}] Checkpoint (full) skipped — no activity`);
        return;
      }
      this.pendingCheckpoint = "full";
      if (this.state === "idle") this.injectCheckpoint();
    }, CHECKPOINT_FULL_INTERVAL_MS);

    log(`[${this.sessionName}] Checkpoint timers started (light: 2hr, full: 4hr)`);
  }

  stopCheckpointTimers(): void {
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
    const prompt = type === "full" ? makeCheckpointFullPrompt(nextTime) : makeCheckpointLightPrompt(nextTime);
    this.pendingCheckpoint = null;
    this.checkpointInFlight = true;
    log(`[${this.sessionName}] Injecting ${type} checkpoint`);
    this.ptyProcess.write(prompt);

    this.state = "cooldown";
    setTimeout(() => {
      this.state = "busy";
    }, this.cooldownMs);
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
            const kick = this.isResumedSession ? RESUME_KICK : STARTUP_KICK;
            log(`[${this.sessionName}] Injecting ${this.isResumedSession ? "resume" : "startup"} kick (quiet ${quietMs}ms)`);
            this.ptyProcess.write(kick);
            this.state = "cooldown";
            setTimeout(() => { this.state = "busy"; }, this.cooldownMs);
            return;
          }

          log(`[${this.sessionName}] Idle (heuristic, quiet ${quietMs}ms)`);
          this.state = "idle";
          if (this.checkpointInFlight) {
            this.checkpointInFlight = false;
            this.lastCheckpointTime = Date.now();
          }
          // Priority: emcom messages first, then checkpoint
          if (this.pendingMessages) {
            this.inject();
          } else if (this.pendingCheckpoint) {
            this.injectCheckpoint();
          }
        }
        // permission, busy, or unknown → stay busy
      } else {
        if (this.needsStartupKick) {
          this.needsStartupKick = false;
          const kick = this.isResumedSession ? RESUME_KICK : STARTUP_KICK;
          log(`[${this.sessionName}] Injecting ${this.isResumedSession ? "resume" : "startup"} kick (quiet ${quietMs}ms, no screen)`);
          this.ptyProcess.write(kick);
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
