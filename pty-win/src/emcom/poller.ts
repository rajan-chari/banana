import { EmcomClient, EmcomHttpError, type EmcomEmail } from "./client.js";
import { log } from "../log.js";

export type NewMessagesCallback = (emails: EmcomEmail[]) => void;
export type UnreadCountCallback = (count: number) => void;
export type AuthErrorCallback = () => void;

export interface EmcomPollEvent {
  time: number;
  ok: boolean;
  unreadCount?: number;
  newCount?: number;
  status?: number;
  code?: string;
  message?: string;
}

export class EmcomPoller {
  private seenIds = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private callback: NewMessagesCallback | null = null;
  private unreadCallback: UnreadCountCallback | null = null;
  private authErrorCallback: AuthErrorCallback | null = null;
  private lastErrorCode: string | null = null;
  private history: EmcomPollEvent[] = [];

  constructor(
    private client: EmcomClient,
    private intervalMs: number,
    private sessionName: string,
  ) {}

  onNewMessages(cb: NewMessagesCallback): void {
    this.callback = cb;
  }

  onUnreadCount(cb: UnreadCountCallback): void {
    this.unreadCallback = cb;
  }

  onAuthError(cb: AuthErrorCallback): void {
    this.authErrorCallback = cb;
  }

  start(): void {
    if (this.timer) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getDebugState(): Record<string, unknown> {
    return {
      active: this.timer !== null,
      lastErrorCode: this.lastErrorCode,
      recent: this.history.slice(-20),
    };
  }

  private record(event: EmcomPollEvent): void {
    this.history.push(event);
    if (this.history.length > 50) this.history.splice(0, this.history.length - 50);
  }

  private handlePollSuccess(unread: EmcomEmail[]): void {
    if (this.lastErrorCode === "ECONNREFUSED") {
      log(`[${this.sessionName}] emcom reconnected`);
    }
    this.lastErrorCode = null;

    this.unreadCallback?.(unread.length);

    const newEmails = unread.filter((e) => !this.seenIds.has(e.id));
    this.record({ time: Date.now(), ok: true, unreadCount: unread.length, newCount: newEmails.length });

    if (newEmails.length > 0) {
      for (const e of newEmails) this.seenIds.add(e.id);
      this.callback?.(newEmails);
    }

    const currentIds = new Set(unread.map((e) => e.id));
    for (const id of this.seenIds) {
      if (!currentIds.has(id)) this.seenIds.delete(id);
    }
  }

  private handlePollError(err: unknown): void {
    const status = err instanceof EmcomHttpError ? err.status : undefined;
    const code = status ? String(status) : (err as any).cause?.code ?? (err as any).code ?? "UNKNOWN";
    this.record({
      time: Date.now(),
      ok: false,
      status,
      code,
      message: err instanceof Error ? err.message : String(err),
    });
    if (status === 401) {
      this.authErrorCallback?.();
      if (!this.authErrorCallback) this.unreadCallback?.(0);
      this.seenIds.clear();
    }
    if (code === "ECONNREFUSED") {
      if (this.lastErrorCode !== "ECONNREFUSED") {
        log(`[${this.sessionName}] emcom unreachable (ECONNREFUSED)`);
      }
    } else {
      log(`[${this.sessionName}] poll error: ${code} — ${err}`);
    }
    this.lastErrorCode = code;
  }

  private async poll(): Promise<void> {
    try {
      const unread = await this.client.getUnread();
      this.handlePollSuccess(unread);
    } catch (err) {
      this.handlePollError(err);
    }
  }
}
