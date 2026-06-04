import { WebSocket } from "ws";

/**
 * Minimal subset of PtySession that ws-runtime helpers depend on. Defining it
 * here keeps the helpers decoupled from PtySession's full surface so tests can
 * pass small fakes.
 */
export interface WsSessionLike {
  markUserInput(data: string): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  clearInputDirty(): void;
}

/** Serialize `payload` once and send to every OPEN client. */
export function broadcastToClients(
  clients: Iterable<WebSocket>,
  payload: unknown,
): void {
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

/**
 * Apply a parsed client message to the addressed session. Unknown message
 * types and missing sessions are silently ignored — matching the original
 * inline switch's behavior (errors should not crash the WS pump).
 */
export function dispatchClientMessage<S extends WsSessionLike>(
  parsed: { type?: unknown; session?: unknown; payload?: unknown },
  sessions: Map<string, S>,
): void {
  if (typeof parsed.type !== "string") return;
  const sessionName = typeof parsed.session === "string" ? parsed.session : null;
  const session = sessionName ? sessions.get(sessionName) ?? null : null;

  switch (parsed.type) {
    case "input":
      if (session && typeof parsed.payload === "string") {
        session.markUserInput(parsed.payload);
        session.write(parsed.payload);
      }
      break;
    case "clear-input-dirty":
      session?.clearInputDirty();
      break;
    case "resize": {
      const p = parsed.payload as { cols?: unknown; rows?: unknown } | null | undefined;
      if (session && p && typeof p.cols === "number" && typeof p.rows === "number") {
        session.resize(p.cols, p.rows);
      }
      break;
    }
  }
}

/** Subset of PtySession that the batched sender requires. */
export interface BatchedSenderSession {
  name: string;
  getModeReplay(): string;
  getRawTail(): string;
  on(event: "data", listener: (data: string) => void): unknown;
  off(event: "data", listener: (data: string) => void): unknown;
}

export interface BatchedSenderHandle {
  /** Detach listener and cancel any pending flush. Idempotent. */
  cleanup(): void;
}

/**
 * Wire `session`'s "data" events to `ws`, batching writes on a `batchMs`
 * timer. Pre-seeds the first batch with `getModeReplay() + getRawTail()` so a
 * fresh browser reconstructs the alt-screen/mouse-tracking state.
 *
 * Caller is responsible for invoking `handle.cleanup()` when the ws closes.
 */
export function createBatchedSender(
  session: BatchedSenderSession,
  ws: WebSocket,
  batchMs: number,
): BatchedSenderHandle {
  let buf = session.getModeReplay() + session.getRawTail();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function flush(): void {
    flushTimer = null;
    if (buf && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "data", session: session.name, payload: buf }));
      buf = "";
    }
  }

  const onData = (data: string): void => {
    buf += data;
    if (!flushTimer) flushTimer = setTimeout(flush, batchMs);
  };

  if (buf) flushTimer = setTimeout(flush, batchMs);
  session.on("data", onData);

  return {
    cleanup(): void {
      session.off("data", onData);
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    },
  };
}
