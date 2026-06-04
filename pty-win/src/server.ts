import express from "express";
import { createServer } from "http";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import { execFileSync } from "child_process";
import { PtySession } from "./session.js";
import type { ServerConfig } from "./config.js";
import { log, clog, setLogPort, getLogPathInfo } from "./log.js";
import { registerDebugRoutes } from "./debug-routes.js";
import { createInjectionRelay } from "./server/injection.js";
import { registerAdminRoutes } from "./server/routes/admin.js";
import { registerEmcomRoutes } from "./server/routes/emcom.js";
import { registerSessionRoutes } from "./server/routes/sessions.js";
import { createWsRuntime } from "./server/ws-runtime.js";
import { startBackgroundTasks, stopBackgroundTasks } from "./server/background-tasks.js";
import { createShutdownHandler } from "./server/shutdown.js";
import type { CostSample } from "./server/cost-history.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
let gitCommit = "unknown";
// Primary source: dist/build-info.json written by scripts/write-build-info.mjs
// at build time. This survives packaging (the released zip has no .git).
try {
  const buildInfoPath = join(__dirname, "build-info.json");
  if (existsSync(buildInfoPath)) {
    const info = JSON.parse(readFileSync(buildInfoPath, "utf-8"));
    if (typeof info.commit === "string" && info.commit) gitCommit = info.commit;
  }
} catch { /* fall through to git */ }
// Fallback: ask git directly (useful in dev when build-info.json may be stale).
if (gitCommit === "unknown") {
  try { gitCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: __dirname, encoding: "utf-8" }).trim(); } catch { /* not in git */ }
}
const buildInfo = { version: pkg.version as string, commit: gitCommit, startedAt: new Date().toISOString() };

const sessions = new Map<string, PtySession>();
const sessionRepoRoots = new Map<string, string>(); // session name → normalized repo root
const savedCosts = new Map<string, number>(); // session name → last known costUsd

const { injectionSender, injectWrite } = createInjectionRelay(sessions);

const CHECKPOINT_STAGGER_MS = 10_000; // 10s between sessions on same repo

export async function startServer(config: ServerConfig): Promise<void> {
  // Resolve the log file path based on the listening port. Must come before
  // the first clog() so the logger picks up the port-keyed filename.
  setLogPort(config.port);
  clog(`log file: ${getLogPathInfo()}`);

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

  // Load cost history from previous run
  const costHistory: CostSample[] = [];
  const costHistoryPath = join(__dirname, "..", "cost-history.json");
  const COST_HISTORY_MAX = 1440; // 24h at 60s intervals
  try {
    if (existsSync(costHistoryPath)) {
      const data = JSON.parse(readFileSync(costHistoryPath, "utf-8"));
      if (Array.isArray(data)) {
        costHistory.push(...data.slice(-COST_HISTORY_MAX));
        clog(`Loaded ${costHistory.length} cost history sample(s)`);
      }
    }
  } catch { /* ignore */ }

  const app = express();
  app.use(express.json());

  const publicDir = join(__dirname, "..", "public");
  app.use(express.static(publicDir));

  const httpServer = createServer(app);
  const wsRuntime = createWsRuntime(httpServer, sessions);

  // --- REST API ---

  registerAdminRoutes({
    app,
    config,
    buildInfo,
    onNameChange: () => wsRuntime.broadcastName(config.name),
  });

  registerSessionRoutes({
    app,
    config,
    sessions,
    sessionRepoRoots,
    savedCosts,
    costHistory,
    checkpointStaggerMs: CHECKPOINT_STAGGER_MS,
    injectionSender,
    injectWrite,
    addSession,
    onSessionListChange: () => wsRuntime.broadcastSessionList(),
    onSessionStatusChange: (session) => wsRuntime.broadcastStatus(session),
  });

  registerEmcomRoutes({ app, config });

  // --- Helpers ---

  function addSession(session: PtySession): void {
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
  }

  // --- Debug routes (conditional) ---

  if (config.debug) {
    registerDebugRoutes(app, sessions, sessionRepoRoots, config, costHistory, () => wsRuntime.getClientCount());
    clog("Debug mode enabled — /api/debug/* routes active, /debug dashboard available");
  }

  // --- Start ---

  httpServer.listen(config.port, config.host, () => {
    log(`[server] pty-win listening on http://${config.host}:${config.port}`);
    console.log(`pty-win: http://${config.host}:${config.port}`);
  });

  const backgroundTasks = startBackgroundTasks({
    sessions,
    costHistory,
    costHistoryMax: COST_HISTORY_MAX,
  });

  const shutdown = createShutdownHandler({
    sessions,
    sessionRepoRoots,
    savedCosts,
    costHistory,
    costsPath,
    costHistoryPath,
    checkpointStaggerMs: CHECKPOINT_STAGGER_MS,
    shutdownTimeoutMs: 240_000,
    wsRuntime,
    httpServer,
  });

  const shutdownWithTaskCleanup = async () => {
    stopBackgroundTasks(backgroundTasks);
    await shutdown();
  };

  process.on("SIGINT", shutdownWithTaskCleanup);
  process.on("SIGTERM", shutdownWithTaskCleanup);
}
