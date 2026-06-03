import { PtySession } from "../session.js";
import { clog } from "../log.js";
import type { CostSample } from "./cost-history.js";

interface BackgroundTaskOptions {
  sessions: Map<string, PtySession>;
  costHistory: CostSample[];
  costHistoryMax: number;
}

export interface BackgroundTaskHandles {
  statsLogger: ReturnType<typeof setInterval>;
  costSampler: ReturnType<typeof setInterval>;
  lagDetector: ReturnType<typeof setInterval>;
}

export function startBackgroundTasks({
  sessions,
  costHistory,
  costHistoryMax,
}: BackgroundTaskOptions): BackgroundTaskHandles {
  const statsLogger = setInterval(() => {
    for (const session of sessions.values()) {
      const s = session.getStats();
      if (s.overall.callbacksPerSec === 0) continue;
      const state = s.status === "busy" ? "busy" : s.status;
      const bucket = s.status === "busy" ? s.busy : s.notBusy;
      clog(
        `[stats] ${s.name}: ${bucket.callbacksPerSec} cb/s, ${Math.round(bucket.bytesPerSec / 1024)}KB/s, avg ${bucket.avgChunkBytes}b/cb (${state})`,
      );
    }
  }, 30_000);

  const costSampler = setInterval(() => {
    if (sessions.size === 0) return;
    const sample: CostSample = { timestamp: Date.now(), sessions: {} };
    for (const [name, session] of sessions) {
      const cost = session.getInfo().costUsd;
      if (cost > 0) sample.sessions[name] = cost;
    }
    costHistory.push(sample);
    if (costHistory.length > costHistoryMax) {
      costHistory.splice(0, costHistory.length - costHistoryMax);
    }
  }, 60_000);

  const TICK_MS = 100;
  const SPIKE_MS = 200;
  let last = Date.now();
  let cooldownUntil = 0;
  const lagDetector = setInterval(() => {
    const now = Date.now();
    const drift = now - last - TICK_MS;
    last = now;
    if (drift > SPIKE_MS && now > cooldownUntil) {
      const heap = process.memoryUsage().heapUsed >> 20;
      clog(`[loop-lag] event loop blocked ${drift}ms (heap=${heap}MB, sessions=${sessions.size})`);
      cooldownUntil = now + 5_000;
    }
  }, TICK_MS);

  return { statsLogger, costSampler, lagDetector };
}

export function stopBackgroundTasks(handles: BackgroundTaskHandles): void {
  clearInterval(handles.statsLogger);
  clearInterval(handles.costSampler);
  clearInterval(handles.lagDetector);
}
