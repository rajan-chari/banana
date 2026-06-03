import { resolve } from "path";
import { detectRepoRoot } from "../../repo-roots.js";
import type { SessionRoutesOptions } from "./types.js";

export function registerSessionObservabilityRoutes({
  app,
  sessions,
  savedCosts,
  costHistory,
}: SessionRoutesOptions): void {
  app.get("/api/repo-root", async (req, res) => {
    const dirPath = req.query["path"] as string;
    if (!dirPath) return res.status(400).json({ error: "path required" });
    const repoRoot = await detectRepoRoot(resolve(dirPath));
    res.json({ repoRoot });
  });

  app.get("/api/stats", (_req, res) => {
    const stats = [...sessions.values()].map((s) => s.getStats());
    res.json(stats);
  });

  app.get("/api/costs", (_req, res) => {
    const sessionCosts: Array<{ name: string; costUsd: number }> = [];
    for (const [name, session] of sessions) {
      sessionCosts.push({ name, costUsd: session.getInfo().costUsd });
    }
    for (const [name, cost] of savedCosts) {
      if (!sessions.has(name)) {
        sessionCosts.push({ name, costUsd: cost });
      }
    }
    const totalUsd = sessionCosts.reduce((sum, s) => sum + s.costUsd, 0);
    res.json({ sessions: sessionCosts, totalUsd: Math.round(totalUsd * 100) / 100 });
  });

  app.get("/api/cost-history", (_req, res) => {
    res.json(costHistory);
  });
}
