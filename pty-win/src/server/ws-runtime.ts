import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { PtySession } from "../session.js";
import {
  broadcastToClients,
  createBatchedSender,
  dispatchClientMessage,
  type BatchedSenderHandle,
} from "./ws-helpers.js";

export interface WsRuntime {
  attachSession(session: PtySession): void;
  broadcastSessionList(): void;
  broadcastStatus(session: PtySession): void;
  broadcastNotification(name: string, count: number, from: string[]): void;
  broadcastName(name: string): void;
  getClientCount(): number;
  shutdown(): void;
}

const BATCH_MS = 16;
const HEARTBEAT_MS = 30_000;

export function createWsRuntime(httpServer: HttpServer, sessions: Map<string, PtySession>): WsRuntime {
  const wss = new WebSocketServer({ server: httpServer });
  const wsClients = new Set<WebSocket>();
  const wsAlive = new Map<WebSocket, boolean>();
  const wsSessionCleanups = new Map<WebSocket, BatchedSenderHandle[]>();

  function attachSessionToWs(session: PtySession, ws: WebSocket): void {
    const handle = createBatchedSender(session, ws, BATCH_MS);
    if (!wsSessionCleanups.has(ws)) {
      wsSessionCleanups.set(ws, []);
      ws.on("close", () => {
        for (const h of wsSessionCleanups.get(ws) || []) h.cleanup();
        wsSessionCleanups.delete(ws);
      });
    }
    wsSessionCleanups.get(ws)!.push(handle);
  }

  function broadcastSessionList(): void {
    broadcastToClients(wsClients, {
      type: "sessions",
      payload: [...sessions.values()].map((s) => s.getInfo()),
    });
  }

  function broadcastStatus(session: PtySession): void {
    const info = session.getInfo();
    broadcastToClients(wsClients, {
      type: "status",
      session: session.name,
      payload: {
        status: info.status,
        unreadCount: info.unreadCount,
        dirtyOnExit: info.dirtyOnExit,
        workingDir: info.workingDir,
        pendingPermission: info.pendingPermission,
      },
    });
  }

  function broadcastNotification(name: string, count: number, from: string[]): void {
    broadcastToClients(wsClients, { type: "notification", session: name, payload: { count, from } });
  }

  function broadcastName(name: string): void {
    broadcastToClients(wsClients, { type: "config", name });
  }

  function attachSession(session: PtySession): void {
    for (const ws of wsClients) attachSessionToWs(session, ws);
  }

  function handleConnection(ws: WebSocket): void {
    wsClients.add(ws);
    wsAlive.set(ws, true);
    ws.on("pong", () => wsAlive.set(ws, true));

    ws.send(JSON.stringify({
      type: "sessions",
      payload: [...sessions.values()].map((s) => s.getInfo()),
    }));

    ws.on("message", (raw) => {
      try {
        dispatchClientMessage(JSON.parse(raw.toString()), sessions);
      } catch {
        // Ignore malformed messages.
      }
    });

    ws.on("close", () => {
      wsClients.delete(ws);
      wsAlive.delete(ws);
    });

    for (const [, session] of sessions) attachSessionToWs(session, ws);
  }

  wss.on("connection", handleConnection);

  const heartbeatInterval = setInterval(() => {
    for (const ws of wsClients) {
      if (wsAlive.get(ws) === false) {
        ws.terminate();
        wsClients.delete(ws);
        wsAlive.delete(ws);
        continue;
      }
      wsAlive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeatInterval.unref();

  function shutdown(): void {
    clearInterval(heartbeatInterval);
    for (const ws of wsClients) {
      try {
        ws.terminate();
      } catch {
        // Ignore teardown race conditions.
      }
    }
    wsClients.clear();
    wsAlive.clear();
    wsSessionCleanups.clear();
    wss.close();
  }

  return {
    attachSession,
    broadcastSessionList,
    broadcastStatus,
    broadcastNotification,
    broadcastName,
    getClientCount: () => wsClients.size,
    shutdown,
  };
}
