import { writeFileSync } from "fs";
import type { Server as HttpServer } from "http";
import { PtySession } from "../session.js";
import { clog, log } from "../log.js";
import type { WsRuntime } from "./ws-runtime.js";
import type { CostSample } from "./cost-history.js";

interface ShutdownOptions {
  sessions: Map<string, PtySession>;
  sessionRepoRoots: Map<string, string>;
  savedCosts: Map<string, number>;
  costHistory: CostSample[];
  costsPath: string;
  costHistoryPath: string;
  checkpointStaggerMs: number;
  shutdownTimeoutMs: number;
  wsRuntime: WsRuntime;
  httpServer: HttpServer;
}

export const AI_COMMANDS = ["claude", "agency cc", "agency cp", "copilot", "pi"];

export function shutdownPrompt(now: Date = new Date()): string {
  const ts = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  return `[${ts} pty-win:shutdown:urgent:urgent] Server shutting down — update tracker.md and briefing.md, commit and push immediately. Write entries assuming a fresh session reads them — include what and why, not just that.`;
}

/**
 * Filter sessions for live AI sessions (status !== "dead" and command is an AI CLI).
 * Pure data-shaping; exported for testability.
 */
export function collectActiveAiSessions(
  sessions: Map<string, PtySession>,
  aiCommands: readonly string[] = AI_COMMANDS,
): Array<[string, PtySession]> {
  const out: Array<[string, PtySession]> = [];
  for (const [name, session] of sessions) {
    const info = session.getInfo();
    if (info.status !== "dead" && aiCommands.includes(info.command)) {
      out.push([name, session]);
    }
  }
  return out;
}

/**
 * Group session pairs by their repo root. Sessions without a known root get a
 * synthetic `__solo_<name>` bucket so each is treated independently.
 * Generic over the session payload so tests can pass plain objects.
 */
export function groupSessionsByRepo<T>(
  pairs: Array<[string, T]>,
  repoRoots: Map<string, string>,
): Map<string, Array<[string, T]>> {
  const groups = new Map<string, Array<[string, T]>>();
  for (const [name, item] of pairs) {
    const repo = repoRoots.get(name) || `__solo_${name}`;
    if (!groups.has(repo)) groups.set(repo, []);
    groups.get(repo)!.push([name, item]);
  }
  return groups;
}

/** Render a session display label, prefixing with `@identity` when present. */
export function buildSessionLabel(name: string, identity?: string | null): string {
  return identity ? `${name} (@${identity})` : name;
}

/**
 * Build the cost-snapshot map written to costs.json. Live session costs win;
 * persisted savedCosts fill in for sessions that have already been killed.
 */
export function collectCostsData(
  sessions: Map<string, PtySession>,
  savedCosts: Map<string, number>,
): Record<string, number> {
  const costsData: Record<string, number> = {};
  for (const [name, session] of sessions) {
    const cost = session.getInfo().costUsd;
    if (cost > 0) costsData[name] = cost;
  }
  for (const [name, cost] of savedCosts) {
    if (!costsData[name] && cost > 0) costsData[name] = cost;
  }
  return costsData;
}

/**
 * Inject the shutdown prompt into each AI session, staggered by repo so
 * sibling sessions in the same checkout don't fight for git locks.
 */
function sendStaggeredSavePrompts(
  repoGroups: Map<string, Array<[string, PtySession]>>,
  checkpointStaggerMs: number,
): Promise<void> {
  const injectPromises: Promise<void>[] = [];
  for (const [, group] of repoGroups) {
    for (let i = 0; i < group.length; i++) {
      const entry = group[i];
      if (!entry) continue;
      const [name, session] = entry;
      const delay = i * checkpointStaggerMs;
      injectPromises.push(
        new Promise((resolve) => {
          setTimeout(() => {
            const label = buildSessionLabel(name, session.getInfo().emcomIdentity);
            clog(`${label}: saving...${delay > 0 ? ` (delayed ${delay / 1000}s)` : ""}`);
            session.forceIdle();
            session.relayWrite(shutdownPrompt());
            resolve();
          }, delay);
        }),
      );
    }
  }
  return Promise.all(injectPromises).then(() => undefined);
}

/**
 * Poll the given AI sessions until each reaches "idle" or "dead", or the
 * shutdownTimeout elapses. Logs progress every 10s.
 */
function waitForSessionsIdle(
  sessions: Map<string, PtySession>,
  aiSessions: Array<[string, PtySession]>,
  shutdownTimeoutMs: number,
): Promise<void> {
  const startTime = Date.now();
  const pending = new Set(aiSessions.map(([name]) => name));
  return new Promise<void>((resolve) => {
    const check = setInterval(() => {
      for (const name of pending) {
        const session = sessions.get(name);
        if (!session) { pending.delete(name); continue; }
        const info = session.getInfo();
        if (info.status === "idle" || info.status === "dead") {
          clog(`${buildSessionLabel(name, info.emcomIdentity)}: idle ✓`);
          pending.delete(name);
        }
      }
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (pending.size === 0) {
        clearInterval(check);
        clog(`All sessions saved (${elapsed}s). Shutting down.`);
        resolve();
      } else if (Date.now() - startTime > shutdownTimeoutMs) {
        clearInterval(check);
        for (const name of pending) {
          clog(`WARNING: ${name} did not finish saving (${elapsed}s timeout)`);
        }
        clog(`Timeout (${elapsed}s). Shutting down anyway.`);
        resolve();
      } else if (elapsed > 0 && elapsed % 10 === 0) {
        clog(`${elapsed}s — waiting on: ${[...pending].join(", ")}`);
      }
    }, 1000);
  });
}

/** Persist the cost snapshot + cost-history rollup. Best-effort; failures log only. */
function persistShutdownSnapshot(
  sessions: Map<string, PtySession>,
  savedCosts: Map<string, number>,
  costHistory: CostSample[],
  costsPath: string,
  costHistoryPath: string,
): void {
  const costsData = collectCostsData(sessions, savedCosts);
  try {
    writeFileSync(costsPath, JSON.stringify({ sessions: costsData }, null, 2));
    clog(`Saved costs for ${Object.keys(costsData).length} session(s)`);
  } catch (e) {
    clog(`WARNING: Failed to save costs.json: ${e}`);
  }
  try {
    writeFileSync(costHistoryPath, JSON.stringify(costHistory));
    clog(`Saved ${costHistory.length} cost history sample(s)`);
  } catch (e) {
    clog(`WARNING: Failed to save cost-history.json: ${e}`);
  }
}

/** Kill PTYs, close WS + HTTP, exit; force-exit after 2s if close() never fires. */
function terminateAllSessions(
  sessions: Map<string, PtySession>,
  sessionRepoRoots: Map<string, string>,
  wsRuntime: WsRuntime,
  httpServer: HttpServer,
): void {
  for (const [name, session] of sessions) {
    log(`[server] Killing session: ${name}`);
    session.kill();
  }
  sessions.clear();
  sessionRepoRoots.clear();
  wsRuntime.shutdown();
  httpServer.close(() => {
    log("[server] Stopped");
    process.exit(0);
  });
  setTimeout(() => {
    log("[server] Force exit");
    process.exit(0);
  }, 2000);
}

export function createShutdownHandler({
  sessions,
  sessionRepoRoots,
  savedCosts,
  costHistory,
  costsPath,
  costHistoryPath,
  checkpointStaggerMs,
  shutdownTimeoutMs,
  wsRuntime,
  httpServer,
}: ShutdownOptions): () => Promise<void> {
  return async () => {
    clog("Ctrl+C — graceful shutdown starting...");

    const aiSessions = collectActiveAiSessions(sessions);
    if (aiSessions.length > 0) {
      clog(`Sending save to ${aiSessions.length} active AI session(s)...`);
      const repoGroups = groupSessionsByRepo(aiSessions, sessionRepoRoots);
      await sendStaggeredSavePrompts(repoGroups, checkpointStaggerMs);
      await waitForSessionsIdle(sessions, aiSessions, shutdownTimeoutMs);
    }

    persistShutdownSnapshot(sessions, savedCosts, costHistory, costsPath, costHistoryPath);
    terminateAllSessions(sessions, sessionRepoRoots, wsRuntime, httpServer);
  };
}
