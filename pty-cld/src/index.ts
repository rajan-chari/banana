#!/usr/bin/env node

import { createServer, type Server } from "http";
import { buildCliConfig } from "./config.js";
import { ClaudeSession } from "./pty/claude-session.js";
import { log } from "./log.js";

function parseArgs(argv: string[]): { serve: boolean; setup: boolean; claudeArgs: string[] } {
  const firstArg = argv[0];
  const setup = firstArg === "setup";
  const serve = argv.includes("--serve");
  const claudeArgs = argv.filter((a) => a !== "--serve" && a !== "setup");
  return { serve, setup, claudeArgs };
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

async function runCli(claudeArgs: string[]): Promise<void> {
  const cwd = process.cwd();
  const config = buildCliConfig(cwd, claudeArgs);
  const sessionCfg = config.sessions[0];

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
    controlServer.close();
    process.exit(code ?? 0);
  });

  // Pipe stdin to PTY
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", (data) => {
    session.write(data.toString());
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

  // Graceful shutdown
  const cleanup = () => {
    session.kill();
    controlServer.close();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

async function main(): Promise<void> {
  const { serve, setup, claudeArgs } = parseArgs(process.argv.slice(2));

  if (setup) {
    const { runSetup } = await import("./setup.js");
    runSetup(claudeArgs);
  } else if (serve) {
    const { startServer } = await import("./server.js");
    await startServer();
  } else {
    await runCli(claudeArgs);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
