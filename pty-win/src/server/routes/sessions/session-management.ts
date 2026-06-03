import { basename, resolve } from "path";
import { readIdentity } from "../../../folders.js";
import { DEFAULTS } from "../../../config.js";
import type { SessionConfig } from "../../../config.js";
import { clog, log } from "../../../log.js";
import { PtySession } from "../../../session.js";
import { detectRepoRoot, countRepoSiblings } from "../../repo-roots.js";
import { writeSessionHooks } from "../../hook-config-writer.js";
import type { SessionRoutesOptions } from "./types.js";

export function registerSessionManagementRoutes({
  app,
  config,
  sessions,
  sessionRepoRoots,
  savedCosts,
  checkpointStaggerMs,
  injectionSender,
  addSession,
  onSessionListChange,
}: SessionRoutesOptions): void {
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
    const isShell = command === "pwsh" || command === "bash" || command === "shell";
    const suffix = isShell ? "~pwsh" : "";
    const name = basename(resolvedDir) + suffix;

    if (sessions.has(name)) {
      return res.status(409).json({ error: "Session already exists" });
    }

    const resolvedCommand = isShell ? DEFAULTS.defaultShell : command;
    const identity = isShell ? null : readIdentity(resolvedDir);

    const repoRoot = await detectRepoRoot(resolvedDir);
    const siblingCount = repoRoot ? countRepoSiblings(repoRoot, sessionRepoRoots, sessions) : 0;
    const checkpointOffsetMs = siblingCount * checkpointStaggerMs;

    if (repoRoot) {
      sessionRepoRoots.set(name, repoRoot);
      if (siblingCount > 0) {
        clog(`${name}: shares repo with ${siblingCount} session(s), checkpoint offset ${checkpointOffsetMs / 1000}s`);
      }
    }

    const sessionConfig: SessionConfig = {
      name,
      command: resolvedCommand || "claude",
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
      injectionPort: injectionSender,
    };

    const session = new PtySession(sessionConfig);
    if (savedCosts.has(name)) session.costUsd = savedCosts.get(name)!;
    if (!isShell) writeSessionHooks(resolvedDir, config.port);
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
    onSessionListChange();
    log(`[server] Killed session: ${req.params.name}`);
    res.json({ ok: true });
  });

  app.post("/api/sessions/:name/force-idle", (req, res) => {
    const session = sessions.get(req.params.name);
    if (!session) return res.status(404).json({ error: "not found" });
    clog(`force-idle: ${req.params.name}`);
    session.forceIdle();
    onSessionListChange();
    res.json({ ok: true });
  });
}
