import { resolve } from "path";
import type { PtySession } from "../../../session.js";
import type { SessionRoutesOptions } from "./types.js";

function findSessionByCwd(sessions: Map<string, PtySession>, cwd: string): PtySession | undefined {
  if (!cwd) return undefined;
  const norm = resolve(cwd).replace(/\\/g, "/").toLowerCase();
  for (const session of sessions.values()) {
    if (session.workingDir.replace(/\\/g, "/").toLowerCase() === norm) return session;
  }
  return undefined;
}

export function registerHookEventRoutes({ app, sessions, onSessionStatusChange }: SessionRoutesOptions): void {
  app.post("/api/hook/session-start", (req, res) => {
    res.json({});
    const session = findSessionByCwd(sessions, req.body?.cwd || req.body?.session_cwd);
    const source = req.body?.source || "startup";
    if (session) {
      session.hookSessionStart(source);
      onSessionStatusChange(session);
    }
  });

  app.post("/api/hook/stop", (req, res) => {
    res.json({});
    const session = findSessionByCwd(sessions, req.body?.cwd || req.body?.session_cwd);
    if (session) {
      session.hookStop();
      onSessionStatusChange(session);
    }
  });

  app.post("/api/hook/notify", (req, res) => {
    res.json({});
    const session = findSessionByCwd(sessions, req.body?.cwd || req.body?.session_cwd);
    const type = req.body?.type || req.body?.notification_type || "";
    if (session) {
      session.hookNotify(type);
      onSessionStatusChange(session);
    }
  });

  app.post("/api/hook/prompt-submit", (req, res) => {
    res.json({});
    const session = findSessionByCwd(sessions, req.body?.cwd || req.body?.session_cwd);
    if (session) {
      session.hookPromptSubmit();
      onSessionStatusChange(session);
    }
  });
}
