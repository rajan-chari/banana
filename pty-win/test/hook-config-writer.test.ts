import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { writeSessionHooks } from "../src/server/hook-config-writer.js";

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function countEndpoint(entries: any[], endpoint: string): number {
  return entries.filter((entry) => JSON.stringify(entry).includes(endpoint)).length;
}

describe("writeSessionHooks", () => {
  it("preserves Claude settings and non-owned hooks while replacing pty-win hooks", () => {
    const dir = mkdtempSync(join(tmpdir(), "pty-win-hooks-"));
    const claudeDir = join(dir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, "settings.local.json");
    writeFileSync(settingsPath, JSON.stringify({
      permissions: { allow: ["Bash(git status)"] },
      customSetting: "keep",
      hooks: {
        Stop: [
          { matcher: "custom", hooks: [{ type: "command", command: "echo stop" }] },
          { matcher: "", hooks: [{ type: "http", url: "http://127.0.0.1:3700/api/hook/stop", timeout: 2 }] },
        ],
        PreToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: "echo pre" }] }],
      },
    }, null, 2));

    writeSessionHooks(dir, 3658);
    writeSessionHooks(dir, 3658);

    const settings = readJson(settingsPath);
    const hooks = settings["hooks"];
    expect(settings["permissions"]).toEqual({ allow: ["Bash(git status)"] });
    expect(settings["customSetting"]).toBe("keep");
    expect(hooks.PreToolUse).toHaveLength(1);
    expect(settings["messageIdleNotifThresholdMs"]).toBe(5000);
    expect(hooks.Stop).toHaveLength(2);
    expect(hooks.Stop[0].hooks[0].command).toBe("echo stop");
    expect(countEndpoint(hooks.Stop, "/api/hook/stop")).toBe(1);
    expect(countEndpoint(hooks.SessionStart, "/api/hook/session-start")).toBe(1);
    expect(countEndpoint(hooks.Notification, "/api/hook/notify")).toBe(1);
    expect(countEndpoint(hooks.UserPromptSubmit, "/api/hook/prompt-submit")).toBe(1);
  });

  it("preserves Copilot settings and non-owned hooks while replacing pty-win hooks", () => {
    const dir = mkdtempSync(join(tmpdir(), "pty-win-copilot-hooks-"));
    const copilotDir = join(dir, ".github", "copilot");
    mkdirSync(copilotDir, { recursive: true });
    const settingsPath = join(copilotDir, "settings.local.json");
    writeFileSync(settingsPath, JSON.stringify({
      customSetting: "keep",
      hooks: {
        Stop: [
          { type: "command", powershell: "Write-Host custom" },
          { type: "command", powershell: "Invoke-RestMethod http://127.0.0.1:3700/api/hook/stop" },
        ],
        ToolCall: [{ type: "command", powershell: "Write-Host tool" }],
      },
    }, null, 2));

    writeSessionHooks(dir, 3658);
    writeSessionHooks(dir, 3658);

    const settings = readJson(settingsPath);
    const hooks = settings["hooks"];
    expect(settings["customSetting"]).toBe("keep");
    expect(hooks.ToolCall).toHaveLength(1);
    expect(hooks.Stop).toHaveLength(2);
    expect(hooks.Stop[0].powershell).toBe("Write-Host custom");
    expect(countEndpoint(hooks.Stop, "/api/hook/stop")).toBe(1);
    expect(countEndpoint(hooks.SessionStart, "/api/hook/session-start")).toBe(1);
    expect(countEndpoint(hooks.Notification, "/api/hook/notify")).toBe(1);
    expect(countEndpoint(hooks.UserPromptSubmit, "/api/hook/prompt-submit")).toBe(1);
  });
});
