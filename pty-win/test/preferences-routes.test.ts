import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import { AddressInfo } from "net";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { registerAdminRoutes } from "../src/server/routes/admin.js";

/** Isolated HOME-dir test harness. Spins up a real express+http server,
 *  redirects ~/.fellow-agents/ via USERPROFILE / HOME env var (Node's
 *  os.homedir() reads these on every call so no module-level mocking is
 *  needed), and exposes the assigned port for fetch-driven assertions. */
async function setup() {
  const home = mkdtempSync(join(tmpdir(), "pty-win-prefs-"));
  const prevUserProfile = process.env.USERPROFILE;
  const prevHome = process.env.HOME;
  process.env.USERPROFILE = home;
  process.env.HOME = home;

  const app = express();
  app.use(express.json());
  registerAdminRoutes({
    app,
    config: { rootDirs: [], port: 0, host: "127.0.0.1", name: "test", debug: false },
    buildInfo: { version: "test", commit: "test", startedAt: "test" },
    onNameChange: () => {},
  });

  const httpServer: HttpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const port = (httpServer.address() as AddressInfo).port;

  return {
    home,
    port,
    prefsFile: join(home, ".fellow-agents", "preferences.json"),
    async teardown() {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      if (prevUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = prevUserProfile;
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      rmSync(home, { recursive: true, force: true });
    },
  };
}

function url(port: number, path: string) {
  return `http://127.0.0.1:${port}${path}`;
}

describe("admin preferences routes", () => {
  let h: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => { h = await setup(); });
  afterEach(async () => { await h.teardown(); });

  describe("GET /api/preferences/schema", () => {
    it("returns the KEY_SCHEMAS descriptor", async () => {
      const resp = await fetch(url(h.port, "/api/preferences/schema"));
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.keys).toBeDefined();
      expect(body.keys.cliPreference).toBeDefined();
      expect(body.keys.cliPreference.type).toBe("select");
      expect(body.keys.cliPreference.options).toEqual(["claude", "copilot", "pi"]);
      expect(body.keys.cliPreference.allowCustom).toBe(true);
    });
  });

  describe("GET /api/preferences", () => {
    it("returns null file and a resolved cliPreference when no file exists", async () => {
      const resp = await fetch(url(h.port, "/api/preferences"));
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.file).toBeNull();
      // source is "first-found" if any of claude/copilot/pi is on PATH,
      // otherwise "none". Either is acceptable here — we just verify the
      // fallback path runs without throwing and the shape is right.
      expect(["first-found", "none"]).toContain(body.source);
    });

    it("returns the saved preference when a file exists", async () => {
      mkdirSync(join(h.home, ".fellow-agents"), { recursive: true });
      writeFileSync(h.prefsFile, JSON.stringify({
        schema: 1,
        cliPreference: "copilot",
        updatedAt: "2026-06-03T00:00:00.000Z",
        updatedBy: "first-run-prompt",
      }));

      const resp = await fetch(url(h.port, "/api/preferences"));
      const body = await resp.json();
      expect(body.cliPreference).toBe("copilot");
      expect(body.source).toBe("preferences");
      expect(body.file).toMatchObject({ cliPreference: "copilot", updatedBy: "first-run-prompt" });
    });

    it("ignores files with the wrong schema version", async () => {
      mkdirSync(join(h.home, ".fellow-agents"), { recursive: true });
      writeFileSync(h.prefsFile, JSON.stringify({
        schema: 99,
        cliPreference: "should-be-ignored",
      }));

      const resp = await fetch(url(h.port, "/api/preferences"));
      const body = await resp.json();
      expect(body.file).toBeNull();
      expect(["first-found", "none"]).toContain(body.source);
    });
  });

  describe("POST /api/preferences", () => {
    it("writes the file and returns the updated values", async () => {
      const resp = await fetch(url(h.port, "/api/preferences"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliPreference: "pi", updatedBy: "pty-win-settings" }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.cliPreference).toBe("pi");
      expect(body.updatedBy).toBe("pty-win-settings");
      expect(typeof body.updatedAt).toBe("string");

      const written = JSON.parse(readFileSync(h.prefsFile, "utf-8"));
      expect(written.cliPreference).toBe("pi");
      expect(written.schema).toBe(1);
    });

    it("creates the ~/.fellow-agents directory if missing", async () => {
      expect(existsSync(join(h.home, ".fellow-agents"))).toBe(false);

      const resp = await fetch(url(h.port, "/api/preferences"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliPreference: "claude", updatedBy: "pty-win-play" }),
      });

      expect(resp.status).toBe(200);
      expect(existsSync(h.prefsFile)).toBe(true);
    });

    it("preserves unknown keys from the prior file (forward-compat)", async () => {
      mkdirSync(join(h.home, ".fellow-agents"), { recursive: true });
      writeFileSync(h.prefsFile, JSON.stringify({
        schema: 1,
        cliPreference: "claude",
        somethingFutureKey: { nested: true },
        anotherFutureField: 42,
      }));

      await fetch(url(h.port, "/api/preferences"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliPreference: "pi", updatedBy: "pty-win-settings" }),
      });

      const written = JSON.parse(readFileSync(h.prefsFile, "utf-8"));
      expect(written.cliPreference).toBe("pi");
      expect(written.somethingFutureKey).toEqual({ nested: true });
      expect(written.anotherFutureField).toBe(42);
    });

    it("rejects missing cliPreference with 400", async () => {
      const resp = await fetch(url(h.port, "/api/preferences"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updatedBy: "pty-win-play" }),
      });
      expect(resp.status).toBe(400);
      const body = await resp.json();
      expect(body.error).toMatch(/cliPreference/);
    });

    it("rejects empty cliPreference with 400", async () => {
      const resp = await fetch(url(h.port, "/api/preferences"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliPreference: "", updatedBy: "pty-win-play" }),
      });
      expect(resp.status).toBe(400);
    });

    it("rejects missing updatedBy with 400", async () => {
      const resp = await fetch(url(h.port, "/api/preferences"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliPreference: "claude" }),
      });
      expect(resp.status).toBe(400);
      const body = await resp.json();
      expect(body.error).toMatch(/updatedBy/);
    });

    it("round-trips: POST then GET returns the saved value", async () => {
      await fetch(url(h.port, "/api/preferences"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliPreference: "copilot", updatedBy: "pty-win-settings" }),
      });

      const getResp = await fetch(url(h.port, "/api/preferences"));
      const body = await getResp.json();
      expect(body.cliPreference).toBe("copilot");
      expect(body.source).toBe("preferences");
      expect(body.file.updatedBy).toBe("pty-win-settings");
    });
  });
});
