import type { SessionStatus } from "./session-state.js";

export type CheckpointType = "light" | "full";

const CHECKPOINT_LIGHT_INTERVAL_MS = 2 * 60 * 60 * 1000;
const CHECKPOINT_FULL_INTERVAL_MS = 4 * 60 * 60 * 1000;

function fmtNow(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const da = d.getDate().toString().padStart(2, "0");
  const h = d.getHours().toString().padStart(2, "0");
  const mi = d.getMinutes().toString().padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${mi}`;
}

function fmtNextTime(intervalMs: number): string {
  const d = new Date(Date.now() + intervalMs);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function makeCheckpointLightPrompt(nextTime: string): string {
  return `[${fmtNow()} pty-win:checkpoint-light:routine:brief:skip-if-busy] Checkpoint (light, next ~${nextTime}): update tracker.md and briefing.md in-place if there are changes. Write entries assuming a fresh session reads them — include what and why, not just that.`;
}

export function makeCheckpointFullPrompt(nextTime: string): string {
  return `[${fmtNow()} pty-win:checkpoint-full:normal:normal] Full checkpoint (next ~${nextTime}): update briefing.md, then run /rc-save, /rc-session-save, /rc-greet-save. Write entries assuming a fresh session reads them — include what and why, not just that.`;
}

interface SessionCheckpointControllerOptions {
  sessionName: string;
  command: string;
  checkpointOffsetMs: number;
  getStatus: () => SessionStatus;
  getLastOutputTime: () => number;
  getCostUsd: () => number;
  onInject: (type: CheckpointType, prompt: string) => void;
  log: (message: string) => void;
}

interface CheckpointState {
  pendingCheckpoint: CheckpointType | null;
  checkpointInFlight: boolean;
  lastCheckpointTime: number;
  checkpointStartDelayActive: boolean;
  checkpointLightTimerActive: boolean;
  checkpointFullTimerActive: boolean;
}

const AI_COMMANDS = ["claude", "agency cc", "agency cp", "copilot", "pi"];

export class SessionCheckpointController {
  private checkpointStartDelay: ReturnType<typeof setTimeout> | null = null;
  private checkpointLightTimer: ReturnType<typeof setInterval> | null = null;
  private checkpointFullTimer: ReturnType<typeof setInterval> | null = null;
  private pendingCheckpoint: CheckpointType | null = null;
  private checkpointInFlight = false;
  private lastCheckpointTime = 0;

  constructor(private options: SessionCheckpointControllerOptions) {}

  start(): void {
    if (!AI_COMMANDS.includes(this.options.command)) return;

    const offset = this.options.checkpointOffsetMs;
    if (offset > 0) {
      this.options.log(`checkpoint stagger for ${this.options.sessionName}: ${offset / 1000}s offset per round`);
    }

    this.checkpointLightTimer = setInterval(() => {
      if (this.options.getStatus() === "dead") return;
      if (this.pendingCheckpoint === "full") {
        this.options.log(`checkpoint (light) skipped -> ${this.options.sessionName} (full pending)`);
        return;
      }
      if (this.options.getLastOutputTime() <= this.lastCheckpointTime) {
        this.options.log(`checkpoint (light) skipped -> ${this.options.sessionName} (no activity)`);
        return;
      }
      this.pendingCheckpoint = "light";
      this.scheduleCheckpointInjection("light");
    }, CHECKPOINT_LIGHT_INTERVAL_MS);

    this.checkpointFullTimer = setInterval(() => {
      if (this.options.getStatus() === "dead") return;
      if (this.options.getLastOutputTime() <= this.lastCheckpointTime) {
        this.options.log(`checkpoint (full) skipped -> ${this.options.sessionName} (no activity)`);
        return;
      }
      this.pendingCheckpoint = "full";
      this.scheduleCheckpointInjection("full");
    }, CHECKPOINT_FULL_INTERVAL_MS);
  }

  stop(): void {
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

  onSessionIdle(): void {
    if (this.checkpointInFlight) {
      this.checkpointInFlight = false;
      this.lastCheckpointTime = Date.now();
    }

    if (this.pendingCheckpoint && !this.checkpointStartDelay) {
      this.scheduleCheckpointInjection(this.pendingCheckpoint);
    }
  }

  trigger(kind: CheckpointType): { injected: boolean; reason?: string } {
    this.pendingCheckpoint = kind;
    if (this.options.getStatus() === "idle") {
      this.injectCheckpoint();
      return { injected: true };
    }
    return { injected: false, reason: `session is ${this.options.getStatus()}, queued as pending` };
  }

  getState(): CheckpointState {
    return {
      pendingCheckpoint: this.pendingCheckpoint,
      checkpointInFlight: this.checkpointInFlight,
      lastCheckpointTime: this.lastCheckpointTime,
      checkpointStartDelayActive: this.checkpointStartDelay !== null,
      checkpointLightTimerActive: this.checkpointLightTimer !== null,
      checkpointFullTimerActive: this.checkpointFullTimer !== null,
    };
  }

  private scheduleCheckpointInjection(type: CheckpointType): void {
    const offset = this.options.checkpointOffsetMs;
    if (offset > 0) {
      this.options.log(`checkpoint (${type}) scheduled -> ${this.options.sessionName} (in ${offset / 1000}s)`);
      this.checkpointStartDelay = setTimeout(() => {
        this.checkpointStartDelay = null;
        if (this.options.getStatus() === "idle") {
          this.injectCheckpoint();
        } else {
          this.options.log(`checkpoint (${type}) queued -> ${this.options.sessionName} (status: ${this.options.getStatus()})`);
        }
      }, offset);
    } else if (this.options.getStatus() === "idle") {
      this.injectCheckpoint();
    } else {
      this.options.log(`checkpoint (${type}) queued -> ${this.options.sessionName} (status: ${this.options.getStatus()})`);
    }
  }

  private injectCheckpoint(): void {
    if (!this.pendingCheckpoint) return;

    const type = this.pendingCheckpoint;
    const intervalMs = type === "full" ? CHECKPOINT_FULL_INTERVAL_MS : CHECKPOINT_LIGHT_INTERVAL_MS;
    const nextTime = fmtNextTime(intervalMs);
    let prompt = type === "full" ? makeCheckpointFullPrompt(nextTime) : makeCheckpointLightPrompt(nextTime);
    const costUsd = this.options.getCostUsd();
    if (costUsd > 0) {
      prompt += ` Session cost: $${costUsd.toFixed(2)}.`;
    }

    this.pendingCheckpoint = null;
    this.checkpointInFlight = true;
    this.options.log(`injecting ${type} checkpoint -> ${this.options.sessionName}`);
    this.options.onInject(type, prompt);
  }
}
