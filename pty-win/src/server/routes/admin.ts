import express from "express";
import type { Express } from "express";
import { basename, join, resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { spawn } from "child_process";
import { createDir, listDir } from "../../folders.js";
import { DEFAULTS } from "../../config.js";
import type { ServerConfig } from "../../config.js";
import { clog } from "../../log.js";
import { readPreferences, resolveCliPreference, writePreferences } from "../../preferences.js";

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

export function registerAdminRoutes({ app, config, buildInfo, onNameChange }: AdminRoutesOptions): void {
  app.get("/api/folders", (req, res) => {
    const dirPath = req.query.path as string;
    if (!dirPath) {
      return res.status(400).json({ error: "path query parameter required" });
    }
    res.json(listDir(resolve(dirPath)));
  });

  app.get("/api/folder-info", (req, res) => {
    const dirPath = req.query.path as string;
    if (!dirPath) return res.status(400).json({ error: "path query parameter required" });
    const resolved = resolve(dirPath);
    const name = basename(resolved);
    try {
      const isClaudeReady = existsSync(join(resolved, "CLAUDE.md"));
      const hasClaudeDir = existsSync(join(resolved, ".claude"));
      let hasIdentity = false;
      let identityName: string | undefined;
      const identityPath = join(resolved, "identity.json");
      if (existsSync(identityPath)) {
        hasIdentity = true;
        try {
          const raw = JSON.parse(readFileSync(identityPath, "utf-8"));
          if (typeof raw.name === "string" && raw.name.trim()) identityName = raw.name;
        } catch {
          // Best-effort metadata endpoint.
        }
      }
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

  app.get("/api/config", (_req, res) => {
    res.json({ rootDirs: config.rootDirs, platform: process.platform, defaultShell: DEFAULTS.defaultShell, name: config.name, build: buildInfo });
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

  app.post("/api/open-editor", (req, res) => {
    const { path } = req.body;
    if (!path) return res.status(400).json({ error: "path is required" });
    const resolved = resolve(path);
    clog(`vscode: opening ${resolved}`);
    res.json({ ok: true });

    if (process.platform === "win32") {
      const psScript = `
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Focus {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
        $hwnd = [Win32Focus]::GetForegroundWindow()
        [Win32Focus]::ShowWindow($hwnd, 6)  # SW_MINIMIZE
        Start-Process code -ArgumentList '${resolved.replace(/'/g, "''")}' -WindowStyle Hidden
      `;
      clog("vscode: launching via PowerShell (minimize + Start-Process)");
      const ps = spawn("powershell", ["-NoProfile", "-Command", psScript], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      ps.stdout?.on("data", (data: Buffer) => {
        clog(`vscode: stdout: ${data.toString().trim()}`);
      });
      ps.stderr?.on("data", (data: Buffer) => {
        clog(`vscode: stderr: ${data.toString().trim()}`);
      });
      ps.on("exit", (code) => {
        clog(`vscode: PowerShell exited (code ${code})`);
      });
      ps.unref();
      return;
    }

    const child = spawn("code", [resolved], {
      shell: true,
      stdio: "ignore",
    });
    child.unref();
    clog("vscode: launched via shell");
  });
}
