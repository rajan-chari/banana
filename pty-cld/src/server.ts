import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { ClaudeSession } from "./pty/claude-session.js";
import { EmcomClient } from "./emcom/client.js";
import { log } from "./log.js";
import type { SessionConfig } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULTS = {
  webPort: 3500,
  controlPort: 3501,
  emcomServer: "http://127.0.0.1:8800",
  pollIntervalMs: 5000,
  quietThresholdMs: 3000,
  injectionCooldownMs: 30000,
};

const sessions = new Map<string, ClaudeSession>();

export async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Serve static files
  const publicDir = join(__dirname, "..", "public");
  app.use(express.static(publicDir));

  // Control API: idle signal from hooks
  app.post("/idle/:session", (req, res) => {
    const session = sessions.get(req.params.session);
    if (session) {
      session.signalIdle();
      res.json({ ok: true });
    } else {
      res.status(404).json({ error: "session not found" });
    }
  });

  // API: list sessions
  app.get("/api/sessions", (_req, res) => {
    const list = [...sessions.entries()].map(([name, s]) => ({
      name,
      pid: s.getPid(),
    }));
    res.json(list);
  });

  // API: list available identities from emcom
  app.get("/api/identities", async (_req, res) => {
    try {
      const client = new EmcomClient(DEFAULTS.emcomServer, "");
      const identities = await client.getWho();
      res.json(identities.filter((i) => i.active && i.location));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch identities" });
    }
  });

  // API: launch a session
  app.post("/api/sessions", (req, res) => {
    const { name, workingDir, claudeArgs = [] } = req.body;
    if (sessions.has(name)) {
      return res.status(409).json({ error: "Session already exists" });
    }

    const config: SessionConfig = {
      name,
      emcomIdentity: name,
      emcomServer: DEFAULTS.emcomServer,
      workingDir: resolve(workingDir),
      claudeArgs,
      pollIntervalMs: DEFAULTS.pollIntervalMs,
      quietThresholdMs: DEFAULTS.quietThresholdMs,
      injectionCooldownMs: DEFAULTS.injectionCooldownMs,
    };

    const session = new ClaudeSession(config, DEFAULTS.controlPort);
    sessions.set(name, session);
    session.start();

    session.on("exit", () => {
      sessions.delete(name);
      broadcastSessionList();
    });

    broadcastSessionList();
    res.json({ ok: true, name, pid: session.getPid() });
  });

  // API: kill a session
  app.delete("/api/sessions/:name", (req, res) => {
    const session = sessions.get(req.params.name);
    if (!session) return res.status(404).json({ error: "not found" });
    session.kill();
    sessions.delete(req.params.name);
    broadcastSessionList();
    res.json({ ok: true });
  });

  const httpServer = createServer(app);

  // WebSocket for terminal I/O
  const wss = new WebSocketServer({ server: httpServer });
  const wsClients = new Set<WebSocket>();
  const wsAlive = new Map<WebSocket, boolean>();

  wss.on("connection", (ws) => {
    wsClients.add(ws);
    wsAlive.set(ws, true);

    ws.on("pong", () => {
      wsAlive.set(ws, true);
    });

    // Send current session list
    const list = [...sessions.entries()].map(([name, s]) => ({
      name,
      pid: s.getPid(),
    }));
    ws.send(JSON.stringify({ type: "sessions", payload: list }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const session = msg.session ? sessions.get(msg.session) : null;

        switch (msg.type) {
          case "input":
            session?.write(msg.payload);
            break;
          case "resize":
            session?.resize(msg.payload.cols, msg.payload.rows);
            break;
        }
      } catch {}
    });

    ws.on("close", () => {
      wsClients.delete(ws);
      wsAlive.delete(ws);
    });

    // Subscribe to all session output
    for (const [name, session] of sessions) {
      attachSessionToWs(name, session, ws);
    }
  });

  // WebSocket heartbeat: detect dead connections every 30s
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

  function attachSessionToWs(name: string, session: ClaudeSession, ws: WebSocket): void {
    const onData = (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "data", session: name, payload: data }));
      }
    };
    const onNotify = (count: number, from: string[]) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "notification", session: name, payload: { count, from } }));
      }
    };
    session.on("data", onData);
    session.on("notification", onNotify);
    ws.on("close", () => {
      session.off("data", onData);
      session.off("notification", onNotify);
    });
  }

  function broadcastSessionList(): void {
    const list = [...sessions.entries()].map(([name, s]) => ({
      name,
      pid: s.getPid(),
    }));
    const msg = JSON.stringify({ type: "sessions", payload: list });
    for (const ws of wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  // Watch for new sessions to attach to existing WS clients
  const origSet = sessions.set.bind(sessions);
  sessions.set = function (key, value) {
    const result = origSet(key, value);
    for (const ws of wsClients) {
      attachSessionToWs(key, value, ws);
    }
    return result;
  };

  httpServer.listen(DEFAULTS.webPort, () => {
    log(`[pty-cld] Web UI: http://127.0.0.1:${DEFAULTS.webPort}`);
    log(`[pty-cld] Control API: http://127.0.0.1:${DEFAULTS.webPort}/idle/:session`);
  });

  // Graceful shutdown
  const shutdown = () => {
    log("[pty-cld] Shutting down server...");

    // Kill all sessions
    for (const [name, session] of sessions) {
      log(`[pty-cld] Killing session: ${name}`);
      session.kill();
    }
    sessions.clear();

    // Close all WebSocket clients
    clearInterval(heartbeatInterval);
    for (const ws of wsClients) {
      ws.close(1001, "Server shutting down");
    }
    wsClients.clear();
    wsAlive.clear();
    wss.close();

    // Close HTTP server
    httpServer.close(() => {
      log("[pty-cld] Server stopped");
      process.exit(0);
    });

    // Force exit after 5s if graceful close hangs
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
