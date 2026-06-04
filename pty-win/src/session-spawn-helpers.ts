/**
 * Pure helpers used by PtySession's constructor and data handler.
 * Extracted to keep the constructor below the function-size threshold
 * and to make the regex-heavy / string-munging parts unit-testable.
 */

export interface SessionLikeConfig {
  command: string;
  args: readonly string[];
  emcomIdentity?: string | null | undefined;
  emcomServer?: string | null | undefined;
  cols?: number | undefined;
  rows?: number | undefined;
  workingDir: string;
}

export interface SpawnPlan {
  shell: string;
  shellArgs: string[];
  cols: number;
  rows: number;
  isClaude: boolean;
  hasWorkingHooks: boolean;
}

/** AI CLIs whose process name we recognize for special idle handling. */
export const AI_COMMANDS = ["claude", "agency cc", "agency cp", "copilot", "pi"] as const;

/**
 * CLIs that accept `--append-system-prompt` for the emcom preamble. Claude
 * Code has it natively. `agency cc` is a Claude wrapper that passes args
 * through. `pi` has the same flag. `agency cp` and `copilot` are Copilot
 * CLI which does NOT support `--append-system-prompt`.
 */
export const PREAMBLE_FLAG_COMMANDS = ["claude", "agency cc", "pi"] as const;

/**
 * Commands whose hooks reliably fire (proven via testing). Used to decide
 * whether to trust hook-driven idle transitions vs. fall back to the
 * quiet-threshold heuristic.
 */
export const HOOKS_WORKING_COMMANDS = ["claude", "agency cc"] as const;

const COST_REGEX_LIVE = /\$(\d+\.\d+)\s+\d+m\d*s/; // live status bar
const COST_REGEX_EXIT = /Total cost:\s+\$(\d+\.\d+)/; // exit summary

/** Build the platform-correct shell + arg list for spawning a PTY for `config`. */
export function buildSpawnPlan(
  config: SessionLikeConfig,
  emcomPreamble: string,
  platform: NodeJS.Platform = process.platform,
): SpawnPlan {
  const isClaude = (AI_COMMANDS as readonly string[]).includes(config.command);
  const supportsPreamble = (PREAMBLE_FLAG_COMMANDS as readonly string[]).includes(config.command);
  const hasEmcom = !!(config.emcomIdentity && config.emcomServer);
  const preambleArgs = supportsPreamble && hasEmcom ? ["--append-system-prompt", emcomPreamble] : [];
  const allArgs = [...preambleArgs, ...config.args];

  const isWin = platform === "win32";
  const shell = isWin ? "cmd.exe" : "/bin/sh";
  const commandParts = config.command.split(/\s+/);
  const shellArgs = isWin
    ? ["/c", ...commandParts, ...allArgs]
    : ["-c", `${config.command} ${allArgs.map((a) => `'${a}'`).join(" ")}`];

  const hasWorkingHooks = (HOOKS_WORKING_COMMANDS as readonly string[]).includes(config.command);

  return {
    shell,
    shellArgs,
    cols: config.cols || 120,
    rows: config.rows || 40,
    isClaude,
    hasWorkingHooks,
  };
}

/** Extract a parsed cost value (USD) from a chunk of PTY output, or null. */
export function extractCost(data: string): number | null {
  const m = COST_REGEX_EXIT.exec(data) || COST_REGEX_LIVE.exec(data);
  if (m && m[1]) {
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Append `chunk` to `prev` and truncate to the last `maxBytes`. Pure;
 * returns the new buffer string.
 */
export function appendRawBuffer(prev: string, chunk: string, maxBytes: number): string {
  const combined = prev + chunk;
  return combined.length > maxBytes ? combined.slice(-maxBytes) : combined;
}

/**
 * Scan `data` for tracked terminal mode-set escapes (CSI ?N h/l) and apply
 * them to `modeState`. Mutates `modeState`. `modeRe` MUST be a /g regex.
 */
export function trackModeEscapes(
  data: string,
  modeState: Map<string, "h" | "l">,
  modeRe: RegExp,
): void {
  modeRe.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = modeRe.exec(data)) !== null) {
    const mode = m[1];
    const state = m[2];
    if (mode && state) modeState.set(mode, state as "h" | "l");
  }
}
