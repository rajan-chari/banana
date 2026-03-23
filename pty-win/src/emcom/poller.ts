import { EmcomClient, type EmcomEmail } from "./client.js";
import { log } from "../log.js";

export type NewMessagesCallback = (emails: EmcomEmail[]) => void;
export type UnreadCountCallback = (count: number) => void;

export class EmcomPoller {
  private seenIds = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private callback: NewMessagesCallback | null = null;
  private unreadCallback: UnreadCountCallback | null = null;
  private lastErrorCode: string | null = null;

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

  private async poll(): Promise<void> {
    try {
      const unread = await this.client.getUnread();

      if (this.lastErrorCode === "ECONNREFUSED") {
        log(`[${this.sessionName}] emcom reconnected`);
      }
      this.lastErrorCode = null;

      this.unreadCallback?.(unread.length);

      const newEmails = unread.filter((e) => !this.seenIds.has(e.id));

      if (newEmails.length > 0) {
        for (const e of newEmails) this.seenIds.add(e.id);
        this.callback?.(newEmails);
      }

      const currentIds = new Set(unread.map((e) => e.id));
      for (const id of this.seenIds) {
        if (!currentIds.has(id)) this.seenIds.delete(id);
      }
    } catch (err) {
      const code = (err as any).cause?.code ?? (err as any).code ?? "UNKNOWN";
      if (code === "ECONNREFUSED") {
        if (this.lastErrorCode !== "ECONNREFUSED") {
          log(`[${this.sessionName}] emcom unreachable (ECONNREFUSED)`);
        }
      } else {
        log(`[${this.sessionName}] poll error: ${code} — ${err}`);
      }
      this.lastErrorCode = code;
    }
  }
}
