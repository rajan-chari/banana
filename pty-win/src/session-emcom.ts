import { EmcomClient, type EmcomEmail } from "./emcom/client.js";
import { EmcomPoller } from "./emcom/poller.js";
import { log } from "./log.js";

export interface EmcomPollerOptions {
  server: string;
  identity: string;
  intervalMs: number;
  sessionName: string;
  onNewMessages: (emails: EmcomEmail[]) => void;
  onUnreadCount: (count: number) => void;
  onAuthError: () => void;
}

export interface EmcomSessionMessageState {
  pendingMessages: boolean;
  unreadCount: number;
}

export function applyUnreadCount(
  state: EmcomSessionMessageState,
  count: number,
): { state: EmcomSessionMessageState; changed: boolean } {
  if (count === state.unreadCount) {
    return { state, changed: false };
  }

  return {
    state: {
      unreadCount: count,
      pendingMessages: count === 0 ? false : state.pendingMessages,
    },
    changed: true,
  };
}

export function markEmcomInjectionSent(state: EmcomSessionMessageState): EmcomSessionMessageState {
  return {
    ...state,
    pendingMessages: false,
  };
}

export function createEmcomPoller({
  server,
  identity,
  intervalMs,
  sessionName,
  onNewMessages,
  onUnreadCount,
  onAuthError,
}: EmcomPollerOptions): EmcomPoller {
  const client = new EmcomClient(server, identity);
  const poller = new EmcomPoller(client, intervalMs, sessionName);

  poller.onNewMessages((emails) => {
    const from = [...new Set(emails.map((e) => e.sender))];
    log(`[${sessionName}] ${emails.length} new message(s) from: ${from.join(", ")}`);
    onNewMessages(emails);
  });

  poller.onUnreadCount((count) => {
    onUnreadCount(count);
  });
  poller.onAuthError(onAuthError);

  return poller;
}
