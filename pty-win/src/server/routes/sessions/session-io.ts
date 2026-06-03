import type { SessionRoutesOptions } from "./types.js";

export function registerSessionIoRoutes({ app, sessions, injectWrite }: SessionRoutesOptions): void {
  app.post("/api/sessions/:name/quick-message", (req, res) => {
    const session = sessions.get(req.params.name);
    if (!session) return res.status(404).json({ error: "not found" });
    const { text } = req.body;
    if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "text required" });
    session.write(`${text.trim()} respond to Rajan via emcom.\r`);
    res.json({ ok: true });
  });

  app.post("/api/sessions/:name/write", (req, res) => {
    const session = sessions.get(req.params.name);
    if (!session) return res.status(404).json({ error: "not found" });
    const { text } = req.body;
    if (typeof text !== "string") return res.status(400).json({ error: "text required" });
    session.write(text);
    res.json({ ok: true });
  });

  app.post("/api/sessions/:name/inject", (req, res) => {
    const session = sessions.get(req.params.name);
    if (!session) return res.status(404).json({ error: "not found" });
    const { text } = req.body;
    if (typeof text !== "string") return res.status(400).json({ error: "text required" });
    injectWrite(session, text, "http");
    res.json({ ok: true });
  });

  app.get("/api/sessions/:name/snapshot", (req, res) => {
    const session = sessions.get(req.params.name);
    if (!session) return res.status(404).json({ error: "not found" });
    if (req.query["raw"] === "1") {
      const maxBytes = parseInt(req.query["bytes"] as string) || 32_768;
      res.type("text/plain").send(session.getRawTail(maxBytes));
      return;
    }
    const n = parseInt(req.query["lines"] as string) || 8;
    res.json({ lines: session.getSnapshot(n) });
  });
}
