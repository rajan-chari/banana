#!/usr/bin/env node

import { createServer, type Server } from "http";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { buildCliConfig, type CliOverrides } from "./config.js";
import { ClaudeSession } from "./pty/claude-session.js";
import { EmcomClient } from "./emcom/client.js";
import { log } from "./log.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]): { serve: boolean; setup: boolean; claudeArgs: string[]; overrides: CliOverrides } {
  const overrides: CliOverrides = {};
  const claudeArgs: string[] = [];
  let serve = false;
  let setup = false;

  let i = 0;
  if (argv[0] === "setup") {
    setup = true;
    i = 1;
  }

  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--serve") {
      serve = true;
    } else if (arg === "--poll-interval" && i + 1 < argv.length) {
      const val = Number(argv[++i]);
      if (Number.isNaN(val)) { console.error(`Invalid --poll-interval: ${argv[i]}`); process.exit(1); }
      overrides.pollIntervalMs = val;
    } else if (arg === "--cooldown" && i + 1 < argv.length) {
      const val = Number(argv[++i]);
      if (Number.isNaN(val)) { console.error(`Invalid --cooldown: ${argv[i]}`); process.exit(1); }
      overrides.cooldownMs = val;
    } else if (arg === "--control-port" && i + 1 < argv.length) {
      const val = Number(argv[++i]);
      if (Number.isNaN(val)) { console.error(`Invalid --control-port: ${argv[i]}`); process.exit(1); }
      overrides.controlPort = val;
    } else {
      claudeArgs.push(arg);
    }
    i++;
  }

  return { serve, setup, claudeArgs, overrides };
}

/** Bind control API, trying successive ports. Returns { server, port }. */
function bindControlApi(startPort: number): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const maxAttempts = 20;
    let attempt = 0;

    function tryPort(port: number): void {
      const server = createServer((req, res) => {
        // Handled after session is created — stash for now
        (server as any)._handler?.(req, res);
        if (!res.writableEnded) {
          res.writeHead(404);
          res.end();
        }
      });

      server.listen(port, "127.0.0.1", () => {
        resolve({ server, port });
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && ++attempt < maxAttempts) {
          log(`[pty-cld] Port ${port} in use, trying ${port + 1}`);
          tryPort(port + 1);
        } else {
          reject(err);
        }
      });
    }

    tryPort(startPort);
  });
}

async function runCli(claudeArgs: string[], overrides: CliOverrides): Promise<void> {
  const cwd = process.cwd();
  const config = buildCliConfig(cwd, claudeArgs, overrides);
  const sessionCfg = config.sessions[0];

  // Validate emcom server is reachable and identity exists
  const client = new EmcomClient(sessionCfg.emcomServer, sessionCfg.emcomIdentity);
  try {
    const healthy = await client.health();
    if (!healthy) {
      console.error(`Cannot reach emcom server at ${sessionCfg.emcomServer}`);
      console.error(`Start it with: emcom-server`);
      process.exit(1);
    }
    const identities = await client.getWho();
    const found = identities.some((id) => id.name === sessionCfg.emcomIdentity);
    if (!found) {
      console.error(`Identity "${sessionCfg.emcomIdentity}" not found on emcom server`);
      console.error(`Register with: emcom register`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Failed to validate emcom: ${err}`);
    process.exit(1);
  }

  // Bind control API first so we know the actual port
  const { server: controlServer, port: actualPort } = await bindControlApi(config.controlPort);
  log(`[pty-cld] Control API listening on 127.0.0.1:${actualPort}`);

  log(`[pty-cld] Identity: ${sessionCfg.emcomIdentity} | Server: ${sessionCfg.emcomServer}`);
  log(`[pty-cld] Polling emcom every ${sessionCfg.pollIntervalMs}ms`);

  // Now create session with the confirmed port — hook points to correct port
  const session = new ClaudeSession(sessionCfg, actualPort);

  // Wire control API handler to session
  (controlServer as any)._handler = (req: any, res: any) => {
    if (req.method === "POST" && req.url === "/idle") {
      session.signalIdle();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    }
  };

  // Pipe PTY output to stdout
  session.on("data", (data: string) => {
    process.stdout.write(data);
  });

  session.on("exit", (code: number | undefined) => {
    log(`[pty-cld] Claude exited (code ${code ?? "unknown"})`);
    process.stdin.setRawMode?.(false);
    controlServer.close();
    process.exit(code ?? 0);
  });

  // Pipe stdin to PTY
  process.stdin.setRawMode?.(true);

  // Windows: enable ENABLE_VIRTUAL_TERMINAL_INPUT so Shift+Tab arrives as \x1b[Z
  // instead of 0x09 (indistinguishable from plain Tab). Must run AFTER setRawMode
  // since that resets console mode flags. PowerShell child shares the console handle.
  if (process.platform === "win32") {
    try {
      const script = resolve(__dirname, "../bin/enable-vt-input.ps1");
      execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${script}"`, {
        stdio: "inherit",
      });
      log("[pty-cld] VT input mode enabled");
    } catch (err) {
      log(`[pty-cld] Warning: failed to enable VT input: ${err}`);
    }
  }

  process.stdin.resume();
  process.stdin.on("data", (data) => {
    session.write(data);
  });

  // Handle terminal resize
  process.stdout.on("resize", () => {
    session.resize(process.stdout.columns, process.stdout.rows);
  });

  // Initial resize to match current terminal
  if (process.stdout.columns && process.stdout.rows) {
    session.resize(process.stdout.columns, process.stdout.rows);
  }

  // Start polling + heuristic
  session.start();

  // Safety net: always restore raw mode on process exit
  process.on("exit", () => {
    try { process.stdin.setRawMode?.(false); } catch {}
  });

  // Graceful shutdown
  const cleanup = () => {
    process.stdin.setRawMode?.(false);
    session.kill();
    controlServer.close();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

async function main(): Promise<void> {
  const { serve, setup, claudeArgs, overrides } = parseArgs(process.argv.slice(2));

  if (setup) {
    const { runSetup } = await import("./setup.js");
    runSetup(claudeArgs);
  } else if (serve) {
    const { startServer } = await import("./server.js");
    await startServer();
  } else {
    await runCli(claudeArgs, overrides);
  }
}

main().catch((err) => {
  process.stdin.setRawMode?.(false);
  console.error(err);
  process.exit(1);
});
