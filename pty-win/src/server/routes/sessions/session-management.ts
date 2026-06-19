import { basename, resolve } from "path";
import { stat } from "fs/promises";
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

export async function isExistingDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function isShellCommand(command: string | undefined): boolean {
  return command === "pwsh" || command === "bash" || command === "shell";
}

function buildSessionTarget(resolvedDir: string, command: string | undefined): { isShell: boolean; name: string; command: string | undefined } {
  const isShell = isShellCommand(command);
  return {
    isShell,
    name: basename(resolvedDir) + (isShell ? "~pwsh" : ""),
    command: isShell ? DEFAULTS.defaultShell : command,
  };
}

function createPtySession(sessionConfig: SessionConfig, resolvedDir: string): { session?: PtySession; error?: string } {
  try {
    return { session: new PtySession(sessionConfig) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[server] Failed to create session ${sessionConfig.name} (${sessionConfig.command}) in ${resolvedDir}: ${message}`);
    return { error: message };
  }
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
    if (!(await isExistingDirectory(resolvedDir))) {
      return res.status(400).json({ error: "workingDir must be an existing directory", workingDir: resolvedDir });
    }

    const target = buildSessionTarget(resolvedDir, command);

    if (sessions.has(target.name)) {
      return res.status(409).json({ error: "Session already exists" });
    }

    const identity = target.isShell ? null : readIdentity(resolvedDir);
    const checkpointOffsetMs = await registerRepoRoot(target.name, resolvedDir, sessions, sessionRepoRoots, checkpointStaggerMs);

    const sessionConfig = buildSessionConfig({
      name: target.name,
      resolvedDir,
      command: target.command,
      args,
      cols,
      rows,
      identity,
      checkpointOffsetMs,
      injectionSender,
    });

    const { session, error } = createPtySession(sessionConfig, resolvedDir);
    if (!session) return res.status(500).json({ error: "failed to create PTY session", detail: error, command: sessionConfig.command });
    if (savedCosts.has(target.name)) session.costUsd = savedCosts.get(target.name)!;
    if (!target.isShell) writeSessionHooks(resolvedDir, config.port);
    addSession(session);
    session.start();

    log(`[server] Created session: ${target.name} (${sessionConfig.command})${identity ? ` identity=${identity.name}` : ""}${sessionRepoRoots.get(target.name) ? ` repo=${sessionRepoRoots.get(target.name)}` : ""}`);
    res.json({ ok: true, name: target.name, pid: session.getPid(), identity: identity?.name });
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
