import type { ServerConfig } from "./config.js";
import { PtySession, SUBMIT, INJECTION_PROMPT, STARTUP_KICK, RESUME_KICK, makeCheckpointLightPrompt, makeCheckpointFullPrompt } from "./session.js";

/**
 * Subset of ServerConfig surfaced through the /api/debug/server response.
 * Defined explicitly so unrelated additions to ServerConfig don't leak
 * into the debug surface by accident.
 */
type DebugServerConfig = Pick<ServerConfig, "port" | "host" | "debug" | "emcomServer" | "rootDirs">;

export interface DebugServerInfo {
  serverTime: number;
  config: DebugServerConfig;
  sessionCount: number;
  wsClientCount: number;
  repoGroups: Record<string, string[]>;
  costHistoryLength: number;
}

export interface DebugBuildInfo {
  version: string;
  commit: string;
  startedAt: string;
  fellowAgentsRelease?: string;
}

export interface TraceBundle {
  traceVersion: 1;
  capturedAt: string;
  session: Record<string, unknown>;
  server: {
    config: DebugServerConfig;
    build: DebugBuildInfo;
    repoRoot: string | null;
  };
  user: {
    note: string;
  };
  privacy: {
    rawIncluded: boolean;
    redactedByDefault: boolean;
    warnings: string[];
  };
  histories: {
    injections: unknown;
    stateEvents: unknown;
    detection: unknown;
    llm: unknown;
  };
  rawTerminal?: {
    maxBytes: number;
    tail: string;
  };
}

/**
 * Aggregate session names by their repository root. Pure helper extracted
 * from registerInspectionRoutes so it can be tested without an Express
 * harness.
 */
export function groupSessionsByRepoRoot(
  sessionRepoRoots: Map<string, string>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, root] of sessionRepoRoots) {
    (out[root] ||= []).push(name);
  }
  return out;
}

/**
 * Build the /api/debug/server response payload. Pure — does not touch
 * Express or any I/O. `nowMs` is injectable for deterministic tests.
 */
export function buildServerDebugInfo(args: {
  sessions: Map<string, PtySession>;
  sessionRepoRoots: Map<string, string>;
  config: ServerConfig;
  costHistoryLength: number;
  wsClientCount: number;
  nowMs?: number;
}): DebugServerInfo {
  const { sessions, sessionRepoRoots, config, costHistoryLength, wsClientCount, nowMs } = args;
  return {
    serverTime: nowMs ?? Date.now(),
    config: {
      port: config.port,
      host: config.host,
      debug: config.debug,
      emcomServer: config.emcomServer,
      rootDirs: config.rootDirs,
    },
    sessionCount: sessions.size,
    wsClientCount,
    repoGroups: groupSessionsByRepoRoot(sessionRepoRoots),
    costHistoryLength,
  };
}

/**
 * Build the /api/debug/sessions/:name/prompts response payload. All prompt
 * makers are invoked through their factory functions; the time placeholder
 * is fixed "HH:MM" matching production behavior.
 */
export function buildPromptsResponse(sessionName: string): {
  session: string;
  emcom: string;
  startupKick: string;
  resumeKick: string;
  checkpointLight: string;
  checkpointFull: string;
  submitChar: string;
  submitCharCode: number;
} {
  return {
    session: sessionName,
    emcom: INJECTION_PROMPT(),
    startupKick: STARTUP_KICK(),
    resumeKick: RESUME_KICK(),
    checkpointLight: makeCheckpointLightPrompt("HH:MM"),
    checkpointFull: makeCheckpointFullPrompt("HH:MM"),
    submitChar: SUBMIT === "\r" ? "\\r" : "\\n",
    submitCharCode: SUBMIT.charCodeAt(0),
  };
}

/**
 * Build the /api/debug/timers response payload. Reads getDebugState() for
 * each session and projects the timer-relevant fields, attaching the
 * mapped repo root. Pure aside from session.getDebugState() (which is
 * idempotent and side-effect-free).
 */
export function buildTimersInfo(args: {
  sessions: Map<string, PtySession>;
  sessionRepoRoots: Map<string, string>;
  nowMs?: number;
}): { serverTime: number; sessions: Record<string, unknown> } {
  const { sessions, sessionRepoRoots, nowMs } = args;
  const result: Record<string, unknown> = {};
  for (const [name, session] of sessions) {
    const state = session.getDebugState();
    result[name] = {
      repoRoot: sessionRepoRoots.get(name) || null,
      status: state["status"],
      quietMs: state["quietMs"],
      pendingCheckpoint: state["pendingCheckpoint"],
      checkpointInFlight: state["checkpointInFlight"],
      lastCheckpointTime: state["lastCheckpointTime"],
      lastCheckpointAgoMs: state["lastCheckpointAgoMs"],
      checkpointLightTimerActive: state["checkpointLightTimerActive"],
      checkpointFullTimerActive: state["checkpointFullTimerActive"],
      heuristicTimerActive: state["heuristicTimerActive"],
    };
  }
  return { serverTime: nowMs ?? Date.now(), sessions: result };
}

function debugServerConfig(config: ServerConfig): DebugServerConfig {
  return {
    port: config.port,
    host: config.host,
    debug: config.debug,
    emcomServer: config.emcomServer,
    rootDirs: config.rootDirs,
  };
}

/**
 * Build a portable pty-win trace bundle for emcom/idle/injection debugging.
 * Raw terminal bytes are omitted by default because they may contain private
 * conversation content; callers must explicitly opt in with `includeRaw`.
 */
export function buildTraceBundle(args: {
  session: PtySession;
  config: ServerConfig;
  buildInfo: DebugBuildInfo;
  sessionRepoRoot?: string | null;
  note?: string;
  includeRaw?: boolean;
  rawMaxBytes?: number;
  nowMs?: number;
}): TraceBundle {
  const { session, config, buildInfo, sessionRepoRoot, note, includeRaw, nowMs } = args;
  const rawMaxBytes = args.rawMaxBytes ?? 32_768;
  const state = session.getDebugState();
  const bundle: TraceBundle = {
    traceVersion: 1,
    capturedAt: new Date(nowMs ?? Date.now()).toISOString(),
    session: {
      ...state,
      info: session.getInfo(),
    },
    server: {
      config: debugServerConfig(config),
      build: buildInfo,
      repoRoot: sessionRepoRoot ?? null,
    },
    user: {
      note: note || "",
    },
    privacy: {
      rawIncluded: !!includeRaw,
      redactedByDefault: true,
      warnings: [
        "Raw terminal output and message bodies may contain sensitive content.",
        "Default trace export omits raw terminal bytes; include raw only after preview.",
        "Trace export is local-only; pty-win does not upload this bundle automatically.",
      ],
    },
    histories: {
      injections: session.getInjectionHistory(),
      stateEvents: state["stateEventHistory"] ?? [],
      detection: session.getDetectionHistory(),
      llm: session.getLlmHistory(),
    },
  };
  if (includeRaw) {
    bundle.rawTerminal = {
      maxBytes: rawMaxBytes,
      tail: session.getRawTail(rawMaxBytes),
    };
  }
  return bundle;
}
