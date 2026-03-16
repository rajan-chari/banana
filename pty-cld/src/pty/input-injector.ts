import type * as pty from "node-pty";
import { log } from "../log.js";

type State = "startup" | "idle" | "busy" | "injecting" | "cooldown";

const INJECTION_PROMPT = "Check emcom inbox for new messages\r";
const STARTUP_GRACE_MS = 10_000;

export class InputInjector {
  private state: State = "startup";
  private lastOutputTime = Date.now();
  private pendingMessages = false;
  private heuristicTimer: ReturnType<typeof setInterval> | null = null;

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
        this.state = "busy";
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
    this.setIdle("hook");
  }

  private setIdle(source: "hook" | "heuristic"): void {
    if (this.state === "busy") {
      this.state = "idle";
      log(`[${this.sessionName}] Idle (${source})`);
      if (this.pendingMessages) {
        this.inject();
      }
    }
  }

  /** Start the output-quiet heuristic timer (disabled by default — hook is preferred) */
  startHeuristic(enabled = false): void {
    if (!enabled || this.heuristicTimer) return;
    log(`[${this.sessionName}] Heuristic idle detection enabled`);
    this.heuristicTimer = setInterval(() => {
      if (this.state === "busy" && Date.now() - this.lastOutputTime > this.quietThresholdMs) {
        this.setIdle("heuristic");
      }
    }, 1000);
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

    // Transition to cooldown
    this.state = "cooldown";
    setTimeout(() => {
      this.state = "busy"; // will transition to idle via heuristic/hook
    }, this.cooldownMs);
  }

  getState(): State {
    return this.state;
  }
}
