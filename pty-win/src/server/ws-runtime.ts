import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { PtySession } from "../session.js";

export interface WsRuntime {
  attachSession(session: PtySession): void;
  broadcastSessionList(): void;
  broadcastStatus(session: PtySession): void;
  broadcastNotification(name: string, count: number, from: string[]): void;
  broadcastName(name: string): void;
  getClientCount(): number;
  shutdown(): void;
}

export function createWsRuntime(httpServer: HttpServer, sessions: Map<string, PtySession>): WsRuntime {
  const wss = new WebSocketServer({ server: httpServer });
  const wsClients = new Set<WebSocket>();
  const wsAlive = new Map<WebSocket, boolean>();
  const wsSessionCleanups = new Map<WebSocket, Array<() => void>>();

  function attachSessionToWs(session: PtySession, ws: WebSocket): void {
    const BATCH_MS = 16;
    let buf = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      flushTimer = null;
      if (buf && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "data", session: session.name, payload: buf }));
        buf = "";
      }
    };

    const onData = (data: string) => {
      buf += data;
      if (!flushTimer) flushTimer = setTimeout(flush, BATCH_MS);
    };
    session.on("data", onData);

    if (!wsSessionCleanups.has(ws)) {
      wsSessionCleanups.set(ws, []);
      ws.on("close", () => {
        for (const fn of wsSessionCleanups.get(ws) || []) fn();
        wsSessionCleanups.delete(ws);
      });
    }

    wsSessionCleanups.get(ws)!.push(() => {
      session.off("data", onData);
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    });
  }

  function broadcastSessionList(): void {
    const list = [...sessions.values()].map((s) => s.getInfo());
    const msg = JSON.stringify({ type: "sessions", payload: list });
    for (const ws of wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  function broadcastStatus(session: PtySession): void {
    const info = session.getInfo();
    const msg = JSON.stringify({
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
    for (const ws of wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  function broadcastNotification(name: string, count: number, from: string[]): void {
    const msg = JSON.stringify({ type: "notification", session: name, payload: { count, from } });
    for (const ws of wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  function broadcastName(name: string): void {
    const msg = JSON.stringify({ type: "config", name });
    for (const ws of wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  function attachSession(session: PtySession): void {
    for (const ws of wsClients) {
      attachSessionToWs(session, ws);
    }
  }

  wss.on("connection", (ws) => {
    wsClients.add(ws);
    wsAlive.set(ws, true);

    ws.on("pong", () => wsAlive.set(ws, true));

    const list = [...sessions.values()].map((s) => s.getInfo());
    ws.send(JSON.stringify({ type: "sessions", payload: list }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const session = msg.session ? sessions.get(msg.session) : null;

        switch (msg.type) {
          case "input":
            session?.markUserInput(msg.payload);
            session?.write(msg.payload);
            break;
          case "clear-input-dirty":
            session?.clearInputDirty();
            break;
          case "resize":
            session?.resize(msg.payload.cols, msg.payload.rows);
            break;
        }
      } catch {
        // Ignore malformed messages.
      }
    });

    ws.on("close", () => {
      wsClients.delete(ws);
      wsAlive.delete(ws);
    });

    for (const [, session] of sessions) {
      attachSessionToWs(session, ws);
    }
  });

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
  }, 30_000);
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
