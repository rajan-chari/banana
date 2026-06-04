import express from "express";
import type { Express } from "express";
import { basename, resolve } from "path";
import { existsSync } from "fs";
import { join } from "path";
import { createDir, listDir } from "../../folders.js";
import { DEFAULTS } from "../../config.js";
import type { ServerConfig } from "../../config.js";
import { KEY_SCHEMAS, readPreferences, resolveCliPreference, writePreferences } from "../../preferences.js";
import { launchVscode, readIdentityInfo } from "./admin-helpers.js";

interface BuildInfo {
  version: string;
  commit: string;
  startedAt: string;
}

interface AdminRoutesOptions {
  app: Express;
  config: ServerConfig;
  buildInfo: BuildInfo;
  onNameChange: () => void;
}

function registerFolderRoutes(app: Express): void {
  app.get("/api/folders", (req, res) => {
    const dirPath = req.query["path"] as string;
    if (!dirPath) {
      return res.status(400).json({ error: "path query parameter required" });
    }
    res.json(listDir(resolve(dirPath)));
  });

  app.get("/api/folder-info", (req, res) => {
    const dirPath = req.query["path"] as string;
    if (!dirPath) return res.status(400).json({ error: "path query parameter required" });
    const resolved = resolve(dirPath);
    const name = basename(resolved);
    try {
      const isClaudeReady = existsSync(join(resolved, "CLAUDE.md"));
      const hasClaudeDir = existsSync(join(resolved, ".claude"));
      const { hasIdentity, identityName } = readIdentityInfo(resolved);
      res.json({ name, path: resolved, isDir: true, isClaudeReady, hasIdentity, identityName, hasClaudeDir });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/api/folders", (req, res) => {
    const { parentPath, name } = req.body;
    if (!parentPath || !name) return res.status(400).json({ error: "parentPath and name required" });
    if (/[/\\:*?"<>|]/.test(name)) return res.status(400).json({ error: "Invalid folder name" });
    try {
      res.json({ ok: true, path: createDir(resolve(parentPath), name) });
    } catch (err) {
      res.status(409).json({ error: String(err) });
    }
  });
}

function registerConfigRoutes(
  app: Express,
  config: ServerConfig,
  buildInfo: BuildInfo,
  onNameChange: () => void,
): void {
  app.get("/api/config", (_req, res) => {
    res.json({ rootDirs: config.rootDirs, platform: process.platform, defaultShell: DEFAULTS.defaultShell, name: config.name, build: buildInfo });
  });

  app.get("/api/preferences/schema", (_req, res) => {
    res.json({ keys: KEY_SCHEMAS });
  });

  app.get("/api/preferences", (_req, res) => {
    const resolved = resolveCliPreference();
    const file = readPreferences();
    res.json({
      cliPreference: resolved.cliPreference,
      source: resolved.source,
      file: file || null,
    });
  });

  app.post("/api/preferences", express.json(), (req, res) => {
    const { cliPreference, updatedBy } = req.body;
    if (typeof cliPreference !== "string" || !cliPreference) {
      return res.status(400).json({ error: "cliPreference must be a non-empty string" });
    }
    if (typeof updatedBy !== "string" || !updatedBy) {
      return res.status(400).json({ error: "updatedBy must be a non-empty string" });
    }
    const prev = readPreferences() || { schema: 1 as const };
    const next = {
      ...prev,
      schema: 1 as const,
      cliPreference,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    try {
      writePreferences(next);
    } catch (e) {
      return res.status(500).json({ error: `write failed: ${(e as Error).message}` });
    }
    res.json({ cliPreference: next.cliPreference, updatedAt: next.updatedAt, updatedBy: next.updatedBy });
  });

  app.post("/api/name", express.json(), (req, res) => {
    const { name } = req.body;
    if (typeof name !== "string") return res.status(400).json({ error: "name must be a string" });
    config.name = name;
    onNameChange();
    res.json({ name: config.name });
  });
}

function registerOpenEditorRoute(app: Express): void {
  app.post("/api/open-editor", (req, res) => {
    const { path } = req.body;
    if (!path) return res.status(400).json({ error: "path is required" });
    const resolved = resolve(path);
    res.json({ ok: true });
    launchVscode(resolved);
  });
}

export function registerAdminRoutes({ app, config, buildInfo, onNameChange }: AdminRoutesOptions): void {
  registerFolderRoutes(app);
  registerConfigRoutes(app, config, buildInfo, onNameChange);
  registerOpenEditorRoute(app);
}
