import type { Express } from "express";
import { EmcomClient } from "../../emcom/client.js";
import type { ServerConfig } from "../../config.js";

interface EmcomRoutesOptions {
  app: Express;
  config: ServerConfig;
}

export function registerEmcomRoutes({ app, config }: EmcomRoutesOptions): void {
  app.get("/api/emcom-feed", async (req, res) => {
    const identity = req.query.identity as string;
    if (!identity) return res.status(400).json({ error: "identity query param required" });
    try {
      const client = new EmcomClient(config.emcomServer, identity);
      const emails = await client.getAll();
      res.json(emails);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("/api/emcom-proxy/tracker", async (req, res) => {
    const identity = req.headers["x-emcom-name"] as string || "";
    const status = req.query.status as string || "";
    try {
      const url = `${config.emcomServer}/tracker${status ? `?status=${status}` : ""}`;
      const resp = await fetch(url, { headers: { "X-Emcom-Name": identity } });
      const data = await resp.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("/api/emcom-proxy/tracker/:id", async (req, res) => {
    const identity = req.headers["x-emcom-name"] as string || "";
    try {
      const url = `${config.emcomServer}/tracker/${req.params.id}`;
      const resp = await fetch(url, { headers: { "X-Emcom-Name": identity } });
      const data = await resp.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("/api/emcom/who", async (_req, res) => {
    try {
      const client = new EmcomClient(config.emcomServer, "");
      const identities = await client.getWho();
      res.json(identities);
    } catch {
      res.json([]);
    }
  });
}
