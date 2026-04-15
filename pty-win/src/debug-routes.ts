import type { Express, Request, Response } from "express";
import type { ServerConfig } from "./config.js";
import { PtySession, INJECTION_PROMPT, STARTUP_KICK, RESUME_KICK, makeCheckpointLightPrompt, makeCheckpointFullPrompt } from "./session.js";
import { setDebugLog, getDebugLogState, addDebugLogListener } from "./log.js";

const SUBMIT = process.platform === "win32" ? "\r" : "\n";

export function registerDebugRoutes(
  app: Express,
  sessions: Map<string, PtySession>,
  sessionRepoRoots: Map<string, string>,
  config: ServerConfig,
  costHistory: unknown[],
  wsClientCount: () => number,
): void {

  function getSession(req: Request, res: Response): PtySession | null {
    const name = req.params.name as string;
    const session = sessions.get(name);
    if (!session) { res.status(404).json({ error: "session not found" }); return null; }
    return session;
  }

  // --- Inspection ---

  app.get("/api/debug/server", (_req, res) => {
    const repoGroups: Record<string, string[]> = {};
    for (const [name, root] of sessionRepoRoots) {
      (repoGroups[root] ||= []).push(name);
    }
    res.json({
      serverTime: Date.now(),
      config: { port: config.port, host: config.host, debug: config.debug, emcomServer: config.emcomServer, rootDirs: config.rootDirs },
      sessionCount: sessions.size,
      wsClientCount: wsClientCount(),
      repoGroups,
      costHistoryLength: costHistory.length,
    });
  });

  app.get("/api/debug/sessions", (_req, res) => {
    const result: Record<string, unknown> = {};
    for (const [name, session] of sessions) {
      result[name] = session.getDebugState();
    }
    res.json({ serverTime: Date.now(), sessionCount: sessions.size, sessions: result });
  });

  app.get("/api/debug/sessions/:name", (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    res.json(session.getDebugState());
  });

  app.get("/api/debug/sessions/:name/screen", (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    const lines = parseInt(req.query.lines as string) || 20;
    const contentLines = session.getContentLines(lines);
    if (req.query.format === "text") {
      res.type("text/plain").send(contentLines.join("\n"));
      return;
    }
    const detection = session.getDetectionState() as Record<string, unknown>;
    res.json({
      session: req.params.name,
      contentLines,
      screen: detection.screen,
      quiet: detection.quiet,
    });
  });

  app.get("/api/debug/sessions/:name/detection", (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    res.json(session.getDetectionState());
  });

  app.get("/api/debug/sessions/:name/detection/history", (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    const history = session.getDetectionHistory();
    res.json({ session: req.params.name, count: history.length, ticks: history });
  });

  app.get("/api/debug/sessions/:name/injections", (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    const history = session.getInjectionHistory();
    res.json({ session: req.params.name, count: history.length, injections: history });
  });

  app.get("/api/debug/sessions/:name/prompts", (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    res.json({
      session: req.params.name,
      emcom: INJECTION_PROMPT(),
      startupKick: STARTUP_KICK(),
      resumeKick: RESUME_KICK(),
      checkpointLight: makeCheckpointLightPrompt("HH:MM"),
      checkpointFull: makeCheckpointFullPrompt("HH:MM"),
      submitChar: SUBMIT === "\r" ? "\\r" : "\\n",
      submitCharCode: SUBMIT.charCodeAt(0),
    });
  });

  app.get("/api/debug/timers", (_req, res) => {
    const result: Record<string, unknown> = {};
    for (const [name, session] of sessions) {
      const state = session.getDebugState();
      result[name] = {
        repoRoot: sessionRepoRoots.get(name) || null,
        status: state.status,
        quietMs: state.quietMs,
        pendingCheckpoint: state.pendingCheckpoint,
        checkpointInFlight: state.checkpointInFlight,
        lastCheckpointTime: state.lastCheckpointTime,
        lastCheckpointAgoMs: state.lastCheckpointAgoMs,
        checkpointLightTimerActive: state.checkpointLightTimerActive,
        checkpointFullTimerActive: state.checkpointFullTimerActive,
        heuristicTimerActive: state.heuristicTimerActive,
      };
    }
    res.json({ serverTime: Date.now(), sessions: result });
  });

  // --- Actions ---

  app.post("/api/debug/sessions/:name/inject", (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    const type = req.body?.type as string;
    if (!type) return res.status(400).json({ error: "type required (emcom|checkpoint-light|checkpoint-full|startup|resume)" });

    switch (type) {
      case "emcom":
        session.debugForceInject();
        return res.json({ ok: true, type });
      case "checkpoint-light":
      case "checkpoint-full": {
        const cpType = type === "checkpoint-light" ? "light" : "full";
        const result = session.debugTriggerCheckpoint(cpType as "light" | "full");
        return res.json({ ok: true, type, ...result });
      }
      case "startup":
      case "resume":
        // These just write the kick directly
        session.write(type === "resume" ? RESUME_KICK() : STARTUP_KICK());
        return res.json({ ok: true, type });
      default:
        return res.status(400).json({ error: `unknown type: ${type}` });
    }
  });

  app.post("/api/debug/log", (req, res) => {
    const { enabled, path, level } = req.body || {};
    setDebugLog({ enabled, path, level });
    res.json(getDebugLogState());
  });

  // --- SSE log stream ---

  app.get("/api/debug/log-stream", (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("event: connected\ndata: {}\n\n");

    const remove = addDebugLogListener((line) => {
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    });

    _req.on("close", remove);
  });

  // --- Serve debug page ---

  app.get("/debug", (_req, res) => {
    res.sendFile("debug.html", { root: "public" });
  });
}
