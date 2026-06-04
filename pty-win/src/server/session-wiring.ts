import type { PtySession } from "../session.js";
import type { WsRuntime } from "./ws-runtime.js";

/**
 * Build the `addSession` handler used by REST routes to register a newly
 * spawned PtySession with the server's session map and wire its lifecycle
 * events through the WebSocket runtime.
 *
 * Pure: returns a closure; no I/O at call time of the factory itself.
 */
export function createAddSession(
  sessions: Map<string, PtySession>,
  wsRuntime: Pick<WsRuntime, "attachSession" | "broadcastSessionList" | "broadcastStatus" | "broadcastNotification">,
): (session: PtySession) => void {
  return function addSession(session: PtySession): void {
    sessions.set(session.name, session);

    session.on("exit", () => {
      wsRuntime.broadcastSessionList();
    });

    session.on("status-change", () => {
      wsRuntime.broadcastStatus(session);
    });

    session.on("notification", (count: number, from: string[]) => {
      wsRuntime.broadcastNotification(session.name, count, from);
    });

    wsRuntime.attachSession(session);
    wsRuntime.broadcastSessionList();
  };
}
