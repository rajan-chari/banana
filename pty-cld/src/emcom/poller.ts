import { EmcomClient, type EmcomEmail } from "./client.js";

export type NewMessagesCallback = (emails: EmcomEmail[]) => void;

export class EmcomPoller {
  private seenIds = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private callback: NewMessagesCallback | null = null;

  constructor(
    private client: EmcomClient,
    private intervalMs: number,
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
      // Silently ignore poll errors (server might be down briefly)
    }
  }
}
