import { appendFile, readFile, mkdir, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { clog } from "./log.js";
import type { CorrectionExample } from "./llm-detector.js";

const CORRECTIONS_DIR = join(homedir(), ".pty-win");
const CORRECTIONS_FILE = join(CORRECTIONS_DIR, "llm-corrections.jsonl");
const MAX_ENTRIES = 200;

interface CorrectionRecord {
  time: string;
  session: string;
  screen: string;
  llmSaid: boolean | null;
  llmWhy: string;
  actualOutcome: "no_submit_within_5s" | "user_intervened" | "submitted_ok" | "recovered_by_resend" | "gave_up";
}

let cache: CorrectionRecord[] | null = null;

/** Append a correction to the on-disk JSONL store. Idempotent on dir creation. */
export async function appendCorrection(record: CorrectionRecord): Promise<void> {
  try {
    await mkdir(CORRECTIONS_DIR, { recursive: true });
    await appendFile(CORRECTIONS_FILE, JSON.stringify(record) + "\n", "utf-8");
    if (cache) {
      cache.push(record);
      if (cache.length > MAX_ENTRIES) {
        cache = cache.slice(cache.length - MAX_ENTRIES);
        // Rewrite file to keep size bounded
        await writeFile(CORRECTIONS_FILE, cache.map((c) => JSON.stringify(c)).join("\n") + "\n", "utf-8");
      }
    }
  } catch (err) {
    clog(`[llm-corrections] append failed: ${(err as Error).message}`);
  }
}

/** Load all corrections (cached). Returns newest-last. */
export async function loadCorrections(): Promise<CorrectionRecord[]> {
  if (cache) return cache;
  try {
    const data = await readFile(CORRECTIONS_FILE, "utf-8");
    const lines = data.split("\n").filter((l) => l.trim().length > 0);
    cache = [];
    for (const line of lines) {
      try {
        cache.push(JSON.parse(line) as CorrectionRecord);
      } catch {
        // skip malformed line
      }
    }
    return cache;
  } catch {
    cache = [];
    return cache;
  }
}

/** Recent few-shot-eligible corrections — converted to LLM input shape. Newest first. */
export async function recentForFewShot(n: number = 3): Promise<CorrectionExample[]> {
  const records = await loadCorrections();
  return records
    .slice(-n)
    .reverse()
    .filter((r) => r.llmSaid !== null)
    .map((r) => ({
      screen: r.screen,
      llmSaid: r.llmSaid as boolean,
      actualOutcome: r.actualOutcome,
      notes: r.llmWhy ? `(model said: "${r.llmWhy}")` : undefined,
    }));
}
