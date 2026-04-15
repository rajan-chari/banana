#!/usr/bin/env node

import { startServer } from "./server.js";
import { DEFAULTS } from "./config.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`pty-win — browser-based terminal multiplexer

Usage: pty-win [options]

Options:
  --port <number>          HTTP server port (default: ${DEFAULTS.port})
  --host <address>         Bind address (default: ${DEFAULTS.host}, use 0.0.0.0 for Docker)
  --name <string>          Instance name (shown in browser tab + accent color)
  --root <path>            Add a folder root to the sidebar (repeatable)
  --emcom <url>            Emcom server URL (default: ${DEFAULTS.emcomServer})
  --ml-model-path <path>   Path to ONNX classifier model (default: auto-detect)
  --debug                  Enable /api/debug/* endpoints and /debug dashboard
  -h, --help               Show this help message

Examples:
  pty-win
  pty-win --port 3602
  pty-win --root "C:\\projects\\my-app" --root "C:\\projects\\other"
  pty-win --port 3602 --emcom http://127.0.0.1:8800`);
  process.exit(0);
}

let port = DEFAULTS.port;
let host = DEFAULTS.host;
let name = "";
let debug = false;
let emcomServer = DEFAULTS.emcomServer;
let mlModelPath = "";
const rootDirs: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    port = parseInt(args[++i], 10);
  } else if (args[i] === "--host" && args[i + 1]) {
    host = args[++i];
  } else if (args[i] === "--name" && args[i + 1]) {
    name = args[++i];
  } else if (args[i] === "--emcom" && args[i + 1]) {
    emcomServer = args[++i];
  } else if (args[i] === "--root" && args[i + 1]) {
    rootDirs.push(args[++i]);
  } else if (args[i] === "--ml-model-path" && args[i + 1]) {
    mlModelPath = args[++i];
  } else if (args[i] === "--debug") {
    debug = true;
  }
}

startServer({ port, host, name, debug, emcomServer, rootDirs, mlModelPath });
