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

const AI_COMMANDS = ["claude", "agency cc", "agency cp", "copilot", "pi"];

function shutdownPrompt(): string {
  const d = new Date();
  const ts = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  return `[${ts} pty-win:shutdown:urgent:urgent] Server shutting down — update tracker.md and briefing.md, commit and push immediately. Write entries assuming a fresh session reads them — include what and why, not just that.`;
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

    const aiSessions: Array<[string, PtySession]> = [];
    for (const [name, session] of sessions) {
      const info = session.getInfo();
      if (info.status !== "dead" && AI_COMMANDS.includes(info.command)) {
        aiSessions.push([name, session]);
      }
    }

    if (aiSessions.length > 0) {
      clog(`Sending save to ${aiSessions.length} active AI session(s)...`);

      const repoGroups = new Map<string, Array<[string, PtySession]>>();
      for (const [name, session] of aiSessions) {
        const repo = sessionRepoRoots.get(name) || `__solo_${name}`;
        if (!repoGroups.has(repo)) repoGroups.set(repo, []);
        repoGroups.get(repo)!.push([name, session]);
      }

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
                const identity = session.getInfo().emcomIdentity;
                const label = identity ? `${name} (@${identity})` : name;
                clog(`${label}: saving...${delay > 0 ? ` (delayed ${delay / 1000}s)` : ""}`);
                session.forceIdle();
                session.relayWrite(shutdownPrompt());
                resolve();
              }, delay);
            }),
          );
        }
      }
      await Promise.all(injectPromises);

      const startTime = Date.now();
      const pending = new Set(aiSessions.map(([name]) => name));

      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          for (const name of pending) {
            const session = sessions.get(name);
            if (!session) {
              pending.delete(name);
              continue;
            }
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
          } else if (Date.now() - startTime > shutdownTimeoutMs) {
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

    try {
      writeFileSync(costHistoryPath, JSON.stringify(costHistory));
      clog(`Saved ${costHistory.length} cost history sample(s)`);
    } catch (e) {
      clog(`WARNING: Failed to save cost-history.json: ${e}`);
    }

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
  };
}
