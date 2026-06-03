import type { SessionStatus } from "./session-state.js";

const QUIET_CHECK_INTERVAL_MS = 1000;
const AI_CMDS = ["claude", "agency cc", "agency cp", "copilot", "pi"];
const HOOKS_WORKING_COMMANDS = ["claude", "agency cc"];
const STARTUP_PROMPT_QUIET_MS = 1_000;
const STARTUP_FALLBACK_QUIET_MS = 30_000;
const AI_NO_HOOKS_IDLE_QUIET_MS = 5_000;
const GENERIC_IDLE_QUIET_MS = 3_000;
const PROMPT_GLYPH = "❯";

interface SessionHeuristicControllerOptions {
  command: string;
  sessionName: string;
  getStatus: () => SessionStatus;
  getLastOutputTime: () => number;
  getNeedsStartupKick: () => boolean;
  getInputBoxDirty: () => boolean;
  getRawBuffer: () => string;
  setIdle: () => void;
  maybeFireOnIdle: (reason: string) => void;
  log: (message: string) => void;
}

export class SessionHeuristicController {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private options: SessionHeuristicControllerOptions) {}

  start(): void {
    if (this.timer) return;

    const isAI = AI_CMDS.includes(this.options.command);
    const hasWorkingHooks = HOOKS_WORKING_COMMANDS.includes(this.options.command);

    this.timer = setInterval(() => {
      if (this.options.getStatus() === "dead") return;

      const quietMs = Date.now() - this.options.getLastOutputTime();

      if (isAI) {
        if (!this.options.getNeedsStartupKick()) {
          if (hasWorkingHooks) return;
          if (this.options.getInputBoxDirty()) return;
          if (this.options.getStatus() === "busy" && quietMs >= AI_NO_HOOKS_IDLE_QUIET_MS) {
            this.options.setIdle();
            this.options.maybeFireOnIdle(`no-hooks-quiet (${quietMs}ms)`);
          }
          return;
        }

        if (this.options.getInputBoxDirty()) return;

        const rawBuffer = this.options.getRawBuffer();
        const promptVisible = rawBuffer.includes(PROMPT_GLYPH);

        if (promptVisible && quietMs >= STARTUP_PROMPT_QUIET_MS) {
          if (this.options.getStatus() === "busy") this.options.setIdle();
          this.options.maybeFireOnIdle(`startup-kick(prompt-visible, quiet ${quietMs}ms)`);
          return;
        }

        if (quietMs > 0 && Math.floor(quietMs / 60_000) > Math.floor((quietMs - 1000) / 60_000)) {
          this.options.log(
            `[${this.options.sessionName}] waiting for startup kick: glyph=${promptVisible}, quiet=${quietMs}ms, bufLen=${rawBuffer.length}`,
          );
        }

        if (quietMs >= STARTUP_FALLBACK_QUIET_MS) {
          if (this.options.getStatus() === "busy") this.options.setIdle();
          this.options.maybeFireOnIdle(`startup-kick(fallback, quiet ${quietMs}ms, no glyph seen)`);
        }

        return;
      }

      if (this.options.getStatus() === "busy" && quietMs >= GENERIC_IDLE_QUIET_MS) {
        this.options.setIdle();
      }
    }, QUIET_CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  isActive(): boolean {
    return this.timer !== null;
  }
}
