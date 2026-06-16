import { describe, expect, it, vi } from "vitest";
import { EmcomHttpError, type EmcomEmail } from "../src/emcom/client.js";
import { EmcomPoller } from "../src/emcom/poller.js";

function email(id: string): EmcomEmail {
  return {
    id,
    thread_id: "t",
    sender: "wren",
    to: ["moss"],
    cc: [],
    subject: "s",
    body: "b",
    created_at: "now",
    tags: ["unread"],
  };
}

describe("EmcomPoller", () => {
  it("records successful poll history and unread counts", async () => {
    const client = { getUnread: vi.fn().mockResolvedValue([email("e1")]) };
    const poller = new EmcomPoller(client as any, 1000, "s1");
    const unread = vi.fn();
    const messages = vi.fn();
    poller.onUnreadCount(unread);
    poller.onNewMessages(messages);

    poller.start();
    await Promise.resolve();

    expect(unread).toHaveBeenCalledWith(1);
    expect(messages).toHaveBeenCalledWith([email("e1")]);
    expect(poller.getDebugState()).toMatchObject({
      active: true,
      lastErrorCode: null,
      recent: [expect.objectContaining({ ok: true, unreadCount: 1, newCount: 1 })],
    });
    poller.stop();
  });

  it("records 401 auth errors and clears stale unread state", async () => {
    const client = { getUnread: vi.fn().mockRejectedValue(new EmcomHttpError("/email/tags/unread", 401, "Unauthorized")) };
    const poller = new EmcomPoller(client as any, 1000, "s1");
    const unread = vi.fn();
    const authError = vi.fn();
    poller.onUnreadCount(unread);
    poller.onAuthError(authError);

    poller.start();
    await Promise.resolve();

    expect(authError).toHaveBeenCalledOnce();
    expect(unread).not.toHaveBeenCalled();
    expect(poller.getDebugState()).toMatchObject({
      active: true,
      lastErrorCode: "401",
      recent: [expect.objectContaining({ ok: false, status: 401, code: "401" })],
    });
    poller.stop();
  });
});
