export type HookSessionStatus = "starting" | "busy" | "idle" | "dead";

interface SessionHookControllerOptions {
  sessionName: string;
  getStatus: () => HookSessionStatus;
  setStatus: (status: HookSessionStatus) => void;
  maybeFireOnIdle: (reason: string) => void;
  emitStatusChange: () => void;
  log: (message: string) => void;
}

export class SessionHookController {
  private readonly sessionName: string;
  private readonly getStatus: () => HookSessionStatus;
  private readonly setStatus: (status: HookSessionStatus) => void;
  private readonly maybeFireOnIdle: (reason: string) => void;
  private readonly emitStatusChange: () => void;
  private readonly log: (message: string) => void;

  private lastHookStopTime = 0;
  private lastHookNotifyType = "";
  private lastHookPromptSubmitTime = 0;
  private inputBoxDirty = false;
  private pendingPermission = false;
  private graceEnded = false;
  private needsStartupKick = false;
  private isResumedSession = false;

  constructor(options: SessionHookControllerOptions) {
    this.sessionName = options.sessionName;
    this.getStatus = options.getStatus;
    this.setStatus = options.setStatus;
    this.maybeFireOnIdle = options.maybeFireOnIdle;
    this.emitStatusChange = options.emitStatusChange;
    this.log = options.log;
  }

  getLastHookStopTime(): number {
    return this.lastHookStopTime;
  }

  getLastHookNotifyType(): string {
    return this.lastHookNotifyType;
  }

  getLastHookPromptSubmitTime(): number {
    return this.lastHookPromptSubmitTime;
  }

  getInputBoxDirty(): boolean {
    return this.inputBoxDirty;
  }

  getPendingPermission(): boolean {
    return this.pendingPermission;
  }

  getNeedsStartupKick(): boolean {
    return this.needsStartupKick;
  }

  getIsResumedSession(): boolean {
    return this.isResumedSession;
  }

  consumeStartupKick(): { needed: boolean; isResumed: boolean } {
    if (!this.needsStartupKick) return { needed: false, isResumed: false };
    this.needsStartupKick = false;
    return { needed: true, isResumed: this.isResumedSession };
  }

  onStartupGraceTimeout(isClaude: boolean, isResume: boolean): void {
    if (this.graceEnded || this.getStatus() === "dead") return;

    this.graceEnded = true;
    if (isClaude) {
      this.needsStartupKick = true;
      this.isResumedSession = isResume;
      this.log(
        `[${this.sessionName}] Startup grace ended (timer fallback) — will kick when prompt detected (${isResume ? "resume" : "fresh"})`,
      );
    }
    if (this.getStatus() === "starting") this.setStatus("busy");
  }

  hookSessionStart(source: string): void {
    if (this.getStatus() === "dead") return;
    if (this.graceEnded) {
      this.log(`hook:session-start → ${this.sessionName} (source=${source}) — grace already ended, ignoring`);
      return;
    }

    this.graceEnded = true;
    if (source === "clear" || source === "compact") {
      this.log(`hook:session-start → ${this.sessionName} (source=${source}) — no kick needed`);
      return;
    }

    this.log(`hook:session-start → ${this.sessionName} (source=${source}) — ending grace early`);
    this.needsStartupKick = true;
    this.isResumedSession = source === "resume";
    if (this.getStatus() === "starting") this.setStatus("busy");
  }

  hookStop(): void {
    if (this.getStatus() === "dead") return;
    this.log(`hook:stop → ${this.sessionName} (was ${this.getStatus()})`);
    this.lastHookStopTime = Date.now();
    this.clearPendingPermission("hook:stop");
    this.setStatus("idle");
    this.maybeFireOnIdle("hook:stop");
  }

  hookPromptSubmit(): void {
    if (this.getStatus() === "dead") return;
    this.lastHookPromptSubmitTime = Date.now();
    this.inputBoxDirty = false;
    this.clearPendingPermission("hook:prompt-submit");
    if (this.needsStartupKick) {
      this.needsStartupKick = false;
      this.log(`hook:prompt-submit → ${this.sessionName} — startup kick cancelled (user already active)`);
    }
    this.log(`hook:prompt-submit → ${this.sessionName} (was ${this.getStatus()})`);
    this.setStatus("busy");
  }

  markUserInput(data: string): void {
    const isFocusEvent = data === "\x1b[I" || data === "\x1b[O";
    if (!isFocusEvent) {
      this.clearPendingPermission("user-input");
    }

    if (!data.startsWith("\x1b") && /[\x20-\x7e]/.test(data)) {
      this.inputBoxDirty = true;
      return;
    }

    if (data.startsWith("\x1b")) {
      const known: Record<string, string> = {
        "\x1b[I": "focus-in", "\x1b[O": "focus-out",
        "\x1b[A": "arrow-up", "\x1b[B": "arrow-down",
        "\x1b[C": "arrow-right", "\x1b[D": "arrow-left",
      };
      const hex = Buffer.from(data).toString("hex");
      const label = known[data] ?? hex;
      this.log(`[${this.sessionName}] input: ignored escape (${label} ${hex})`);
    }
  }

  clearInputDirty(): void {
    if (!this.inputBoxDirty) return;
    this.inputBoxDirty = false;
    this.log(`[${this.sessionName}] input box cleared by user`);
    this.maybeFireOnIdle("user-cleared-input");
  }

  hookNotify(type: string): void {
    if (this.getStatus() === "dead") return;
    this.lastHookNotifyType = type;

    if (type === "permission_prompt") {
      this.log(`hook:notify(permission) → ${this.sessionName} — pending permission`);
      if (!this.pendingPermission) {
        this.pendingPermission = true;
        this.emitStatusChange();
      }
      return;
    }

    if (type === "idle_prompt") {
      this.log(`hook:notify(idle) → ${this.sessionName} — confirmed idle`);
      this.clearPendingPermission("hook:notify(idle)");
      if (this.getStatus() !== "idle") this.setStatus("idle");
      this.maybeFireOnIdle("hook:notify(idle)");
      return;
    }

    this.log(`hook:notify(${type}) → ${this.sessionName} — unhandled type, ignoring`);
  }

  clearPendingPermission(reason: string): void {
    if (!this.pendingPermission) return;
    this.pendingPermission = false;
    this.log(`[${this.sessionName}] pending permission cleared (${reason})`);
    this.emitStatusChange();
  }
}
