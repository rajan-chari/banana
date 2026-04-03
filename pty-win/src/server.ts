import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { execFile, spawn } from "child_process";
import { PtySession } from "./session.js";
import { EmcomClient } from "./emcom/client.js";
import { listDir, readIdentity, createDir } from "./folders.js";
import { DEFAULTS } from "./config.js";
import type { SessionConfig, ServerConfig } from "./config.js";
import { log, clog } from "./log.js";
import { saveMlSample } from "./ml-dataset.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const sessions = new Map<string, PtySession>();
const sessionRepoRoots = new Map<string, string>(); // session name → normalized repo root
const savedCosts = new Map<string, number>(); // session name → last known costUsd

const CHECKPOINT_STAGGER_MS = 10_000; // 10s between sessions on same repo

/** Detect git repo root for a directory. Returns normalized path or null. */
function detectRepoRoot(dir: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", ["rev-parse", "--show-toplevel"], { cwd: dir, timeout: 5000 }, (err, stdout) => {
      if (err || !stdout.trim()) return resolve(null);
      resolve(stdout.trim().replace(/\\/g, "/").toLowerCase());
    });
  });
}

/** Count how many existing live sessions share the same repo root. */
function countRepoSiblings(repoRoot: string): number {
  let count = 0;
  for (const [name, root] of sessionRepoRoots) {
    const session = sessions.get(name);
    if (root === repoRoot && session && session.getInfo().status !== "dead") {
      count++;
    }
  }
  return count;
}


export async function startServer(config: ServerConfig): Promise<void> {
  // Load saved costs from previous run
  const costsPath = join(__dirname, "..", "costs.json");
  try {
    if (existsSync(costsPath)) {
      const data = JSON.parse(readFileSync(costsPath, "utf-8"));
      if (data.sessions) {
        for (const [name, cost] of Object.entries(data.sessions)) {
          savedCosts.set(name, cost as number);
        }
        clog(`Loaded costs for ${savedCosts.size} session(s) from costs.json`);
      }
    }
  } catch { /* ignore corrupt file */ }

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

  app.post("/api/sessions", async (req, res) => {
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

    // Detect git repo root for checkpoint staggering
    const repoRoot = await detectRepoRoot(resolvedDir);
    const siblingCount = repoRoot ? countRepoSiblings(repoRoot) : 0;
    const checkpointOffsetMs = siblingCount * CHECKPOINT_STAGGER_MS;

    if (repoRoot) {
      sessionRepoRoots.set(name, repoRoot);
      if (siblingCount > 0) {
        clog(`${name}: shares repo with ${siblingCount} session(s), checkpoint offset ${checkpointOffsetMs / 1000}s`);
      }
    }

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
      checkpointOffsetMs,
      busyTimeoutMs: DEFAULTS.busyTimeoutMs,
      mlServiceUrl: DEFAULTS.mlServiceUrl,
      mlDataDir: join(__dirname, "..", "ml-dataset"),
      mlCollectionMaxSamples: DEFAULTS.mlCollectionMaxSamples,
      mlModelPath: config.mlModelPath || join(__dirname, "..", "..", "pty-learner", "ml", "classifier.onnx"),
    };

    const session = new PtySession(sessionConfig);
    if (savedCosts.has(name)) session.costUsd = savedCosts.get(name)!;
    addSession(session);
    session.start();

    log(`[server] Created session: ${name} (${sessionConfig.command})${identity ? ` identity=${identity.name}` : ""}${repoRoot ? ` repo=${repoRoot}` : ""}`);
    res.json({ ok: true, name, pid: session.getPid(), identity: identity?.name });
  });

  app.delete("/api/sessions/:name", (req, res) => {
    const session = sessions.get(req.params.name);
    if (!session) return res.status(404).json({ error: "not found" });
    session.kill();
    sessions.delete(req.params.name);
    sessionRepoRoots.delete(req.params.name);
    broadcastSessionList();
    log(`[server] Killed session: ${req.params.name}`);
    res.json({ ok: true });
  });

  app.post("/api/open-editor", (req, res) => {
    const { path } = req.body;
    if (!path) return res.status(400).json({ error: "path is required" });
    const resolved = resolve(path);
    clog(`vscode: opening ${resolved}`);
    res.json({ ok: true });

    if (process.platform === "win32") {
      // Minimize the foreground window (the browser) then launch VS Code
      // This ensures VS Code appears in front even when browser is fullscreen
      const psScript = `
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Focus {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
        $hwnd = [Win32Focus]::GetForegroundWindow()
        [Win32Focus]::ShowWindow($hwnd, 6)  # SW_MINIMIZE
        Start-Process code -ArgumentList '${resolved.replace(/'/g, "''")}'
      `;
      clog(`vscode: launching via PowerShell (minimize + Start-Process)`);
      const ps = spawn("powershell", ["-NoProfile", "-Command", psScript],
        { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      ps.stdout?.on("data", (data: Buffer) => {
        clog(`vscode: stdout: ${data.toString().trim()}`);
      });
      ps.stderr?.on("data", (data: Buffer) => {
        clog(`vscode: stderr: ${data.toString().trim()}`);
      });
      ps.on("exit", (code) => {
        clog(`vscode: PowerShell exited (code ${code})`);
      });
      ps.unref();
    } else {
      const child = spawn("code", [resolved], {
        shell: true,
        stdio: "ignore",
      });
      child.unref();
      clog(`vscode: launched via shell`);
    }
  });

  app.post("/api/sessions/:name/force-idle", (req, res) => {
    const session = sessions.get(req.params.name);
    if (!session) return res.status(404).json({ error: "not found" });
    saveMlSample(
      join(__dirname, "..", "ml-dataset"),
      session.getContentLines(20),
      "not_busy",
      "strong",
      "force_idle",
      req.params.name
    );
    clog(`force-idle: ${req.params.name}`);
    session.forceIdle();
    broadcastSessionList();
    res.json({ ok: true });
  });

  app.post("/api/sessions/:name/quick-message", (req, res) => {
    const session = sessions.get(req.params.name);
    if (!session) return res.status(404).json({ error: "not found" });
    const { text } = req.body;
    if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "text required" });
    session.write(`${text.trim()} respond to Rajan via emcom.\r`);
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

  // Emcom feed for right panel — identity passed as query param
  app.get("/api/emcom-feed", async (req, res) => {
    const identity = req.query.identity as string;
    if (!identity) return res.status(400).json({ error: "identity query param required" });
    try {
      const client = new EmcomClient(config.emcomServer, identity);
      const emails = await client.getAll();
      res.json(emails);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Repo root detection for startup stagger
  app.get("/api/repo-root", async (req, res) => {
    const dirPath = req.query.path as string;
    if (!dirPath) return res.status(400).json({ error: "path required" });
    const repoRoot = await detectRepoRoot(resolve(dirPath));
    res.json({ repoRoot });
  });

  // Stats: rolling 5s averages per session
  app.get("/api/stats", (_req, res) => {
    const stats = [...sessions.values()].map((s) => s.getStats());
    res.json(stats);
  });

  app.get("/api/costs", (_req, res) => {
    const sessionCosts: Array<{ name: string; costUsd: number }> = [];
    // Live sessions
    for (const [name, session] of sessions) {
      sessionCosts.push({ name, costUsd: session.getInfo().costUsd });
    }
    // Dead sessions from saved costs (not currently live)
    for (const [name, cost] of savedCosts) {
      if (!sessions.has(name)) {
        sessionCosts.push({ name, costUsd: cost });
      }
    }
    const totalUsd = sessionCosts.reduce((sum, s) => sum + s.costUsd, 0);
    res.json({ sessions: sessionCosts, totalUsd: Math.round(totalUsd * 100) / 100 });
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
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
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

  // 30s stats logger
  setInterval(() => {
    for (const session of sessions.values()) {
      const s = session.getStats();
      if (s.overall.callbacksPerSec === 0) continue;
      const state = s.status === "busy" ? "busy" : s.status;
      const bucket = s.status === "busy" ? s.busy : s.notBusy;
      clog(`[stats] ${s.name}: ${bucket.callbacksPerSec} cb/s, ${Math.round(bucket.bytesPerSec / 1024)}KB/s, avg ${bucket.avgChunkBytes}b/cb (${state})`);
    }
  }, 30_000);

  // Graceful shutdown with save injection
  const AI_COMMANDS = ["claude", "agency cc", "agency cp", "copilot"];
  const SHUTDOWN_SAVE_PROMPT = "[pty-win:shutdown:urgent:urgent]\nServer shutting down — update tracker.md and briefing.md, commit and push immediately. Write entries assuming a fresh session reads them — include what and why, not just that.\r";
  const SHUTDOWN_TIMEOUT_MS = 240_000;

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

      // Group sessions by repo root for staggered injection
      const repoGroups = new Map<string, Array<[string, PtySession]>>();
      for (const [name, session] of aiSessions) {
        const repo = sessionRepoRoots.get(name) || `__solo_${name}`;
        if (!repoGroups.has(repo)) repoGroups.set(repo, []);
        repoGroups.get(repo)!.push([name, session]);
      }

      // Inject save prompts, staggered within each repo group
      const injectPromises: Promise<void>[] = [];
      for (const [, group] of repoGroups) {
        for (let i = 0; i < group.length; i++) {
          const [name, session] = group[i];
          const delay = i * CHECKPOINT_STAGGER_MS;
          injectPromises.push(new Promise((resolve) => {
            setTimeout(() => {
              const identity = session.getInfo().emcomIdentity;
              const label = identity ? `${name} (@${identity})` : name;
              clog(`${label}: saving...${delay > 0 ? ` (delayed ${delay / 1000}s)` : ""}`);
              session.forceIdle();
              session.write(SHUTDOWN_SAVE_PROMPT);
              resolve();
            }, delay);
          }));
        }
      }
      await Promise.all(injectPromises);

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

    // Persist costs before shutdown
    const costsData: Record<string, number> = {};
    for (const [name, session] of sessions) {
      const cost = session.getInfo().costUsd;
      if (cost > 0) costsData[name] = cost;
    }
    for (const [name, cost] of savedCosts) {
      if (!costsData[name] && cost > 0) costsData[name] = cost;
    }
    try {
      writeFileSync(costsPath, JSON.stringify({ sessions: costsData }, null, 2));
      clog(`Saved costs for ${Object.keys(costsData).length} session(s)`);
    } catch (e) {
      clog(`WARNING: Failed to save costs.json: ${e}`);
    }

    // Kill all sessions and shut down
    for (const [name, session] of sessions) {
      log(`[server] Killing session: ${name}`);
      session.kill();
    }
    sessions.clear();
    sessionRepoRoots.clear();
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
