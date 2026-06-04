import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Express, Request, Response } from "express";
import type { ServerConfig } from "./config.js";
import { PtySession, SUBMIT, STARTUP_KICK, RESUME_KICK } from "./session.js";
import { setDebugLog, getDebugLogState, addDebugLogListener } from "./log.js";
import { checkReadiness, checkStuckInput } from "./llm-detector.js";
import { recentForFewShot } from "./llm-corrections.js";
import { buildPromptsResponse, buildServerDebugInfo, buildTimersInfo } from "./debug-routes-helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type GetSession = (req: Request, res: Response) => PtySession | null;

function makeGetSession(sessions: Map<string, PtySession>): GetSession {
  return (req, res) => {
    const name = req.params["name"] as string;
    const session = sessions.get(name);
    if (!session) { res.status(404).json({ error: "session not found" }); return null; }
    return session;
  };
}

function registerInspectionRoutes(
  app: Express,
  sessions: Map<string, PtySession>,
  sessionRepoRoots: Map<string, string>,
  config: ServerConfig,
  costHistory: unknown[],
  wsClientCount: () => number,
  getSession: GetSession,
): void {
  app.get("/api/debug/server", (_req, res) => {
    res.json(buildServerDebugInfo({
      sessions,
      sessionRepoRoots,
      config,
      costHistoryLength: costHistory.length,
      wsClientCount: wsClientCount(),
    }));
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
    const lines = parseInt(req.query["lines"] as string) || 20;
    const contentLines = session.getContentLines(lines);
    if (req.query["format"] === "text") {
      res.type("text/plain").send(contentLines.join("\n"));
      return;
    }
    const detection = session.getDetectionState() as Record<string, unknown>;
    res.json({
      session: req.params["name"],
      contentLines,
      quiet: detection["quiet"],
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

  app.get("/api/debug/sessions/:name/llm-history", (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    const history = session.getLlmHistory();
    res.json({ session: req.params.name, count: history.length, history });
  });

  app.get("/api/debug/sessions/:name/prompts", (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    res.json(buildPromptsResponse(req.params.name));
  });

  app.get("/api/debug/timers", (_req, res) => {
    res.json(buildTimersInfo({ sessions, sessionRepoRoots }));
  });
}

function registerActionRoutes(app: Express, getSession: GetSession): void {
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
        session.relayWrite(type === "resume" ? RESUME_KICK() : STARTUP_KICK());
        return res.json({ ok: true, type });
      default:
        return res.status(400).json({ error: `unknown type: ${type}` });
    }
  });

  // Manually trigger an LLM readiness check on the current screen.
  app.post("/api/debug/sessions/:name/llm-check", async (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    const lines = session.getContentLines(30);
    const corrections = await recentForFewShot(3);
    const verdict = await checkReadiness({ screenLines: lines, corrections });
    res.json({ session: req.params.name, verdict, screenLineCount: lines.length, correctionsCount: corrections.length });
  });

  // Manually invoke checkStuckInput. Can use current session screen, or pass
  // crafted screenLines / injectText in the body for testing the prompt.
  app.post("/api/debug/sessions/:name/stuck-check", async (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    const screenLines: string[] = req.body?.screenLines ?? session.getContentLines(30);
    const injectText: string | undefined = req.body?.injectText;
    if (!injectText) return res.status(400).json({ error: "injectText required (the bytes that were supposedly injected)" });
    const verdict = await checkStuckInput({ screenLines, injectText });
    res.json({ session: req.params.name, verdict, screenLineCount: screenLines.length, injectTextLen: injectText.length });
  });

  // Test: write text then \r separately with a delay
  app.post("/api/debug/sessions/:name/split-write", (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    const { text, delayMs = 50 } = req.body || {};
    if (!text) return res.status(400).json({ error: "text required" });
    session.write(text);
    setTimeout(() => session.write(SUBMIT), delayMs);
    res.json({ ok: true, textLen: text.length, delayMs });
  });

  app.post("/api/debug/log", (req, res) => {
    const { enabled, path, level } = req.body || {};
    setDebugLog({ enabled, path, level });
    res.json(getDebugLogState());
  });
}

function registerLogStreamRoute(app: Express): void {
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
}

function registerDebugPageRoute(app: Express): void {
  app.get("/debug", (_req, res) => {
    res.sendFile("debug.html", { root: join(__dirname, "..", "public") });
  });
}

export function registerDebugRoutes(
  app: Express,
  sessions: Map<string, PtySession>,
  sessionRepoRoots: Map<string, string>,
  config: ServerConfig,
  costHistory: unknown[],
  wsClientCount: () => number,
): void {
  const getSession = makeGetSession(sessions);
  registerInspectionRoutes(app, sessions, sessionRepoRoots, config, costHistory, wsClientCount, getSession);
  registerActionRoutes(app, getSession);
  registerLogStreamRoute(app);
  registerDebugPageRoute(app);
}
