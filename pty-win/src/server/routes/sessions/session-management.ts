import { basename, resolve } from "path";
import { readIdentity } from "../../../folders.js";
import { DEFAULTS } from "../../../config.js";
import type { SessionConfig } from "../../../config.js";
import { clog, log } from "../../../log.js";
import { PtySession } from "../../../session.js";
import { detectRepoRoot, countRepoSiblings } from "../../repo-roots.js";
import { writeSessionHooks } from "../../hook-config-writer.js";
import type { SessionRoutesOptions } from "./types.js";

type Identity = ReturnType<typeof readIdentity>;

async function registerRepoRoot(
  name: string,
  resolvedDir: string,
  sessions: Map<string, PtySession>,
  sessionRepoRoots: Map<string, string>,
  checkpointStaggerMs: number,
): Promise<number> {
  const repoRoot = await detectRepoRoot(resolvedDir);
  if (!repoRoot) return 0;
  const siblingCount = countRepoSiblings(repoRoot, sessionRepoRoots, sessions);
  const checkpointOffsetMs = siblingCount * checkpointStaggerMs;
  sessionRepoRoots.set(name, repoRoot);
  if (siblingCount > 0) {
    clog(`${name}: shares repo with ${siblingCount} session(s), checkpoint offset ${checkpointOffsetMs / 1000}s`);
  }
  return checkpointOffsetMs;
}

interface BuildSessionConfigOpts {
  name: string;
  resolvedDir: string;
  command: string | undefined;
  args: string[];
  cols: number | undefined;
  rows: number | undefined;
  identity: Identity;
  checkpointOffsetMs: number;
  injectionSender: SessionConfig["injectionPort"];
}

function buildSessionConfig(opts: BuildSessionConfigOpts): SessionConfig {
  return {
    name: opts.name,
    command: opts.command || "claude",
    args: opts.args,
    workingDir: opts.resolvedDir,
    cols: opts.cols || 120,
    rows: opts.rows || 40,
    emcomIdentity: opts.identity?.name,
    emcomServer: opts.identity ? opts.identity.server : undefined,
    pollIntervalMs: DEFAULTS.pollIntervalMs,
    quietThresholdMs: DEFAULTS.quietThresholdMs,
    injectionCooldownMs: DEFAULTS.injectionCooldownMs,
    checkpointOffsetMs: opts.checkpointOffsetMs,
    busyTimeoutMs: DEFAULTS.busyTimeoutMs,
    injectionPort: opts.injectionSender,
  };
}

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
    const checkpointOffsetMs = await registerRepoRoot(name, resolvedDir, sessions, sessionRepoRoots, checkpointStaggerMs);

    const sessionConfig = buildSessionConfig({
      name,
      resolvedDir,
      command: resolvedCommand,
      args,
      cols,
      rows,
      identity,
      checkpointOffsetMs,
      injectionSender,
    });

    const session = new PtySession(sessionConfig);
    if (savedCosts.has(name)) session.costUsd = savedCosts.get(name)!;
    if (!isShell) writeSessionHooks(resolvedDir, config.port);
    addSession(session);
    session.start();

    log(`[server] Created session: ${name} (${sessionConfig.command})${identity ? ` identity=${identity.name}` : ""}${sessionRepoRoots.get(name) ? ` repo=${sessionRepoRoots.get(name)}` : ""}`);
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
