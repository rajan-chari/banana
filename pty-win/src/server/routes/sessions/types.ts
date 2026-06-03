import type { Express } from "express";
import type { MessagePort } from "worker_threads";
import type { PtySession } from "../../../session.js";
import type { ServerConfig } from "../../../config.js";
import type { CostSample } from "../../cost-history.js";

export interface SessionRoutesOptions {
  app: Express;
  config: ServerConfig;
  sessions: Map<string, PtySession>;
  sessionRepoRoots: Map<string, string>;
  savedCosts: Map<string, number>;
  costHistory: CostSample[];
  checkpointStaggerMs: number;
  injectionSender: MessagePort;
  injectWrite: (session: PtySession, text: string, source?: string) => void;
  addSession: (session: PtySession) => void;
  onSessionListChange: () => void;
  onSessionStatusChange: (session: PtySession) => void;
}
