import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export type MlLabel = "busy" | "not_busy";
export type MlConfidence = "auto" | "strong" | "uncertain";
export type MlSource = "auto_detect" | "force_idle" | "timeout_flag";

export function saveMlSample(
  dataDir: string,
  textLines: string[],
  label: MlLabel,
  confidence: MlConfidence,
  source: MlSource,
  sessionId: string
): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const record = {
    text_lines: textLines,
    label,
    confidence,
    source,
    timestamp: new Date().toISOString(),
    session_id: sessionId,
  };
  appendFileSync(join(dataDir, "labels.jsonl"), JSON.stringify(record) + "\n", "utf8");
}
