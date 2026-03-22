#!/usr/bin/env node

import { startServer } from "./server.js";
import { DEFAULTS } from "./config.js";

const args = process.argv.slice(2);

let port = DEFAULTS.port;
let emcomServer = DEFAULTS.emcomServer;
const rootDirs: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    port = parseInt(args[++i], 10);
  } else if (args[i] === "--emcom" && args[i + 1]) {
    emcomServer = args[++i];
  } else if (args[i] === "--root" && args[i + 1]) {
    rootDirs.push(args[++i]);
  }
}

startServer({ port, emcomServer, rootDirs });
