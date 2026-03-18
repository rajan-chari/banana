import { EmcomClient, type EmcomEmail } from "./client.js";
import { log } from "../log.js";

export type NewMessagesCallback = (emails: EmcomEmail[]) => void;

export class EmcomPoller {
  private seenIds = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private callback: NewMessagesCallback | null = null;
  private lastErrorCode: string | null = null;

  constructor(
    private client: EmcomClient,
    private intervalMs: number,
    private sessionName: string,
  ) {}

  onNewMessages(cb: NewMessagesCallback): void {
    this.callback = cb;
  }

  start(): void {
    if (this.timer) return;
    // Poll immediately on start, then at interval
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

      // Log reconnection if we were previously disconnected
      if (this.lastErrorCode === "ECONNREFUSED") {
        log(`[${this.sessionName}] emcom reconnected`);
      }
      this.lastErrorCode = null;

      const newEmails = unread.filter((e) => !this.seenIds.has(e.id));

      if (newEmails.length > 0) {
        for (const e of newEmails) this.seenIds.add(e.id);
        this.callback?.(newEmails);
      }

      // Prune: remove IDs no longer in unread (they got handled)
      const currentIds = new Set(unread.map((e) => e.id));
      for (const id of this.seenIds) {
        if (!currentIds.has(id)) this.seenIds.delete(id);
      }
    } catch (err) {
      const code = (err as any).cause?.code ?? (err as any).code ?? "UNKNOWN";
      if (code === "ECONNREFUSED") {
        // Log once, suppress repeats
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
