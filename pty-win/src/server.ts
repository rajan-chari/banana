import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import { execFile, spawn } from "child_process";
import { PtySession } from "./session.js";
import { EmcomClient } from "./emcom/client.js";
import { listDir, readIdentity, createDir } from "./folders.js";
import { DEFAULTS } from "./config.js";
import type { SessionConfig, ServerConfig } from "./config.js";
import { log, clog } from "./log.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const sessions = new Map<string, PtySession>();

export async function startServer(config: ServerConfig): Promise<void> {
  const app = express();
  app.use(express.json());

  const publicDir = join(__dirname, "..", "public");
  app.use(express.static(publicDir));

  // --- REST API ---

  // Folder browser: list children of a directory
  app.get("/api/folders", (req, res) => {
    const dirPath = req.query.path as string;
    if (!dirPath) {
      return res.status(400).json({ error: "path query parameter required" });
    }
    res.json(listDir(resolve(dirPath)));
  });

  // Folder info: metadata for a single directory
  app.get("/api/folder-info", (req, res) => {
    const dirPath = req.query.path as string;
    if (!dirPath) return res.status(400).json({ error: "path query parameter required" });
    const resolved = resolve(dirPath);
    const name = basename(resolved);
    try {
      const isClaudeReady = existsSync(join(resolved, "CLAUDE.md"));
      const hasClaudeDir = existsSync(join(resolved, ".claude"));
      let hasIdentity = false;
      let identityName: string | undefined;
      const identityPath = join(resolved, "identity.json");
      if (existsSync(identityPath)) {
        hasIdentity = true;
        try {
          const raw = JSON.parse(readFileSync(identityPath, "utf-8"));
          if (typeof raw.name === "string" && raw.name.trim()) identityName = raw.name;
        } catch {}
      }
      res.json({ name, path: resolved, isDir: true, isClaudeReady, hasIdentity, identityName, hasClaudeDir });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Folder browser: create a subdirectory
  app.post("/api/folders", (req, res) => {
    const { parentPath, name } = req.body;
    if (!parentPath || !name) return res.status(400).json({ error: "parentPath and name required" });
    if (/[/\\:*?"<>|]/.test(name)) return res.status(400).json({ error: "Invalid folder name" });
    try {
      res.json({ ok: true, path: createDir(resolve(parentPath), name) });
    } catch (err) {
      res.status(409).json({ error: String(err) });
    }
  });

  // Config: return root dirs for initial favorites
  app.get("/api/config", (_req, res) => {
    res.json({ rootDirs: config.rootDirs });
  });

  app.get("/api/sessions", (_req, res) => {
    const list = [...sessions.values()].map((s) => s.getInfo());
    res.json(list);
  });

  app.post("/api/sessions", (req, res) => {
    const { workingDir, command, args = [], cols, rows } = req.body;
    if (!workingDir) {
      return res.status(400).json({ error: "workingDir is required" });
    }

    const resolvedDir = resolve(workingDir);
    const suffix = command === "pwsh" ? "~pwsh" : "";
    const name = basename(resolvedDir) + suffix;

    if (sessions.has(name)) {
      return res.status(409).json({ error: "Session already exists" });
    }

    // Auto-detect identity from folder (only for AI sessions, not shells)
    const isShell = command === "pwsh";
    const identity = isShell ? null : readIdentity(resolvedDir);

    const sessionConfig: SessionConfig = {
      name,
      command: command || "claude",
      args,
      workingDir: resolvedDir,
      cols: cols || 120,
      rows: rows || 40,
      emcomIdentity: identity?.name,
      emcomServer: identity ? identity.server : undefined,
      pollIntervalMs: DEFAULTS.pollIntervalMs,
      quietThresholdMs: DEFAULTS.quietThresholdMs,
      injectionCooldownMs: DEFAULTS.injectionCooldownMs,
    };

    const session = new PtySession(sessionConfig);
    addSession(session);
    session.start();

    log(`[server] Created session: ${name} (${sessionConfig.command})${identity ? ` identity=${identity.name}` : ""}`);
    res.json({ ok: true, name, pid: session.getPid(), identity: identity?.name });
  });

  app.delete("/api/sessions/:name", (req, res) => {
    const session = sessions.get(req.params.name);
    if (!session) return res.status(404).json({ error: "not found" });
    session.kill();
    sessions.delete(req.params.name);
    broadcastSessionList();
    log(`[server] Killed session: ${req.params.name}`);
    res.json({ ok: true });
  });

  app.post("/api/open-editor", (req, res) => {
    const { path } = req.body;
    if (!path) return res.status(400).json({ error: "path is required" });
    const resolved = resolve(path);
    const child = spawn("code", [resolved], {
      shell: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    log(`[server] Opened VS Code: ${resolved}`);
    res.json({ ok: true });
  });

  app.post("/api/sessions/:name/force-idle", (req, res) => {
    const session = sessions.get(req.params.name);
    if (!session) return res.status(404).json({ error: "not found" });
    session.forceIdle();
    broadcastSessionList();
    res.json({ ok: true });
  });

  app.post("/api/sessions/:name/write", (req, res) => {
    const session = sessions.get(req.params.name);
    if (!session) return res.status(404).json({ error: "not found" });
    const { text } = req.body;
    if (typeof text !== "string") return res.status(400).json({ error: "text required" });
    session.write(text);
    res.json({ ok: true });
  });

  app.get("/api/sessions/:name/snapshot", (req, res) => {
    const session = sessions.get(req.params.name);
    if (!session) return res.status(404).json({ error: "not found" });
    const n = parseInt(req.query.lines as string) || 8;
    res.json({ lines: session.getSnapshot(n) });
  });

  // emcom/who kept for dashboard reference
  app.get("/api/emcom/who", async (_req, res) => {
    try {
      const client = new EmcomClient(config.emcomServer, "");
      const identities = await client.getWho();
      res.json(identities);
    } catch {
      res.json([]);
    }
  });

  // --- WebSocket ---

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });
  const wsClients = new Set<WebSocket>();
  const wsAlive = new Map<WebSocket, boolean>();

  wss.on("connection", (ws) => {
    wsClients.add(ws);
    wsAlive.set(ws, true);

    ws.on("pong", () => wsAlive.set(ws, true));

    // Send current state
    const list = [...sessions.values()].map((s) => s.getInfo());
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
    for (const [, session] of sessions) {
      attachSessionToWs(session, ws);
    }
  });

  // Heartbeat: detect dead connections every 30s
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

  // --- Helpers ---

  function addSession(session: PtySession): void {
    sessions.set(session.name, session);

    session.on("exit", () => {
      broadcastSessionList();
    });

    session.on("status-change", () => {
      broadcastStatus(session);
    });

    session.on("notification", (count: number, from: string[]) => {
      broadcastNotification(session.name, count, from);
    });

    // Attach to all existing WS clients
    for (const ws of wsClients) {
      attachSessionToWs(session, ws);
    }

    broadcastSessionList();
  }

  const wsSessionCleanups = new Map<WebSocket, Array<() => void>>();

  function attachSessionToWs(session: PtySession, ws: WebSocket): void {
    const onData = (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "data", session: session.name, payload: data }));
      }
    };
    session.on("data", onData);

    if (!wsSessionCleanups.has(ws)) {
      wsSessionCleanups.set(ws, []);
      ws.on("close", () => {
        for (const fn of wsSessionCleanups.get(ws) || []) fn();
        wsSessionCleanups.delete(ws);
      });
    }
    wsSessionCleanups.get(ws)!.push(() => session.off("data", onData));
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

  // --- Start ---

  httpServer.listen(config.port, "127.0.0.1", () => {
    log(`[server] pty-win listening on http://127.0.0.1:${config.port}`);
    console.log(`pty-win: http://127.0.0.1:${config.port}`);
  });

  // Graceful shutdown with save injection
  const AI_COMMANDS = ["claude", "agency cc", "agency cp", "copilot"];
  const SHUTDOWN_SAVE_PROMPT = "Server shutting down — update tracker.md, commit and push immediately.\r";
  const SHUTDOWN_TIMEOUT_MS = 120_000;

  const shutdown = async () => {
    clog("Ctrl+C — graceful shutdown starting...");

    // Find active AI sessions to save
    const aiSessions: Array<[string, PtySession]> = [];
    for (const [name, session] of sessions) {
      const info = session.getInfo();
      if (info.status !== "dead" && AI_COMMANDS.includes(info.command)) {
        aiSessions.push([name, session]);
      }
    }

    if (aiSessions.length > 0) {
      clog(`Sending save to ${aiSessions.length} active AI session(s)...`);

      // Inject save prompt into each AI session
      for (const [name, session] of aiSessions) {
        const identity = session.getInfo().emcomIdentity;
        const label = identity ? `${name} (@${identity})` : name;
        clog(`${label}: saving...`);
        session.forceIdle(); // ensure idle so injection works
        session.write(SHUTDOWN_SAVE_PROMPT);
      }

      // Wait for each session to go idle (or timeout)
      const startTime = Date.now();
      const pending = new Set(aiSessions.map(([name]) => name));

      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          for (const name of pending) {
            const session = sessions.get(name);
            if (!session) { pending.delete(name); continue; }
            const info = session.getInfo();
            if (info.status === "idle" || info.status === "dead") {
              const identity = info.emcomIdentity;
              const label = identity ? `${name} (@${identity})` : name;
              clog(`${label}: idle ✓`);
              pending.delete(name);
            }
          }
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          if (pending.size === 0) {
            clearInterval(check);
            clog(`All sessions saved (${elapsed}s). Shutting down.`);
            resolve();
          } else if (Date.now() - startTime > SHUTDOWN_TIMEOUT_MS) {
            clearInterval(check);
            for (const name of pending) {
              clog(`WARNING: ${name} did not finish saving (${elapsed}s timeout)`);
            }
            clog(`Timeout (${elapsed}s). Shutting down anyway.`);
            resolve();
          } else if (elapsed > 0 && elapsed % 10 === 0) {
            const waiting = [...pending].join(", ");
            clog(`${elapsed}s — waiting on: ${waiting}`);
          }
        }, 1000);
      });
    }

    // Kill all sessions and shut down
    for (const [name, session] of sessions) {
      log(`[server] Killing session: ${name}`);
      session.kill();
    }
    sessions.clear();
    clearInterval(heartbeatInterval);
    for (const ws of wsClients) {
      try { ws.terminate(); } catch {}
    }
    wsClients.clear();
    wsAlive.clear();
    wss.close();
    httpServer.close(() => {
      log("[server] Stopped");
      process.exit(0);
    });
    // Force exit after 2s if clean shutdown stalls
    setTimeout(() => {
      log("[server] Force exit");
      process.exit(0);
    }, 2000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
