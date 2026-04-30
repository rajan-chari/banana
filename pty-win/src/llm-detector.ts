import { clog } from "./log.js";

/**
 * LLM-based readiness check for Claude Code TUI sessions.
 *
 * Used as an escalation when cheap heuristics get stuck — e.g. status has been
 * busy for too long with low byte rate, or promptType has been "unknown" for
 * many ticks. NOT called every heuristic tick. Cost is bounded by the trigger.
 *
 * Asymmetric decision:
 *   - LLM says ready=true  → fire inject
 *   - LLM says ready=false → keep waiting
 *   - LLM unavailable / timeout / parse error → return null (caller falls
 *     through to current behavior; we don't introduce new failure modes)
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-5-nano";
const TIMEOUT_MS = 6_000;

export interface LlmCheckInput {
  screenLines: string[];
  lastInjectText?: string;
  lastInjectAgoMs?: number;
  // Corrections from past wrong verdicts — rotated in for adaptive few-shot.
  // Newest first; caller decides how many to include.
  corrections?: CorrectionExample[];
}

export interface CorrectionExample {
  screen: string;          // joined screen lines at the time
  llmSaid: boolean;        // what LLM said (ready)
  actualOutcome: "no_submit_within_5s" | "user_intervened" | "submitted_ok";
  notes?: string;
}

export interface LlmVerdict {
  ready: boolean;
  why: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Hand-written few-shot examples calibrating the model. Future corrections
 * captured in step 4/5 are appended dynamically by the caller via `input.corrections`.
 */
const FEW_SHOT: Array<{ screen: string; ready: boolean; why: string }> = [
  {
    screen: [
      "  Try edit code — claude can read and write files",
      "  Try run shell command — claude can run shell commands",
      "",
      "❯ ",
      "─────────────────────────────────────────────────────",
    ].join("\n"),
    ready: true,
    why: "Empty input prompt with cursor at start. Claude is waiting for next user input.",
  },
  {
    screen: [
      "  ⎿  Reading files...",
      "✻ Churned for 47s",
      "─────────────────────────────────────────────────────",
      "❯ this is the user's previous prompt still showing while claude renders",
      "─────────────────────────────────────────────────────",
    ].join("\n"),
    ready: false,
    why: "Claude is mid-response (Churned timer active, output streaming). Input area shows previous prompt, not empty.",
  },
  {
    screen: [
      "Do you want to allow this command?",
      "  Run: rm -rf /tmp/foo",
      "",
      "❯ 1. Yes  2. No",
    ].join("\n"),
    ready: false,
    why: "Permission prompt is open. Claude is waiting for the human to choose, not for an auto-injection.",
  },
  {
    screen: [
      "  ⎿  4 files modified, 23 lines changed",
      "  ⎿  Tests pass: 79/79",
      "",
      "Done. Ready for next instruction.",
      "",
      "❯ ",
      "─────────────────────────────────────────────────────",
    ].join("\n"),
    ready: true,
    why: "Tool result block finished, prompt is empty, cursor at start. Claude completed its turn.",
  },
];

const SYSTEM_PROMPT = `You are a precise classifier for the Claude Code terminal UI.

You will be shown the last ~30 lines of a Claude Code TUI screen and asked: is Claude waiting at an empty input prompt, ready to receive a new auto-injected user message?

Definitions:
- READY (ready=true): Cursor is at an empty input box (line starts with ❯ followed by nothing or whitespace), no streaming output, no permission prompt, no churn/spinner. The input area is stable.
- NOT READY (ready=false): Claude is rendering a response, a tool is running, a permission/confirmation prompt is open, the input area shows previous text, or the screen is mid-update.

Decision rule: when uncertain, choose NOT READY. False-positive READY causes lost auto-injections; false-negative READY just delays one inject.

Respond with strict JSON only: {"ready": boolean, "why": "<short reason>"}`;

function buildUserMessage(input: LlmCheckInput): string {
  const parts: string[] = [];
  parts.push("Screen lines (most recent first not guaranteed; see as-is):");
  parts.push("```");
  parts.push(input.screenLines.join("\n"));
  parts.push("```");
  if (input.lastInjectText) {
    const ago = input.lastInjectAgoMs != null ? ` ${Math.round(input.lastInjectAgoMs / 1000)}s ago` : "";
    parts.push(`\nLast pty-win inject${ago}: ${JSON.stringify(input.lastInjectText)}`);
  }
  if (input.corrections && input.corrections.length > 0) {
    parts.push("\nKnown past mistakes by you on this terminal (treat similar shapes carefully):");
    for (const c of input.corrections.slice(0, 5)) {
      parts.push(`- said ready=${c.llmSaid}, actual outcome was "${c.actualOutcome}"${c.notes ? ` — ${c.notes}` : ""}`);
    }
  }
  parts.push("\nReturn only the JSON verdict.");
  return parts.join("\n");
}

function buildMessages(input: LlmCheckInput) {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  messages.push({ role: "system", content: SYSTEM_PROMPT });
  // Few-shot calibration
  for (const ex of FEW_SHOT) {
    messages.push({ role: "user", content: `Screen lines:\n\`\`\`\n${ex.screen}\n\`\`\`\nReturn only the JSON verdict.` });
    messages.push({ role: "assistant", content: JSON.stringify({ ready: ex.ready, why: ex.why }) });
  }
  // Live query
  messages.push({ role: "user", content: buildUserMessage(input) });
  return messages;
}

export async function checkReadiness(input: LlmCheckInput): Promise<LlmVerdict | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    clog("[llm-detector] OPENAI_API_KEY not set — skipping");
    return null;
  }

  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const body = {
      model: MODEL,
      messages: buildMessages(input),
      response_format: { type: "json_object" as const },
      // gpt-5-nano: keep generation short
      max_completion_tokens: 200,
    };
    const resp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      clog(`[llm-detector] HTTP ${resp.status} — falling through`);
      return null;
    }
    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      clog("[llm-detector] empty content — falling through");
      return null;
    }
    let parsed: { ready?: boolean; why?: string };
    try {
      parsed = JSON.parse(content) as { ready?: boolean; why?: string };
    } catch {
      clog(`[llm-detector] JSON parse failed: ${content.slice(0, 80)}`);
      return null;
    }
    if (typeof parsed.ready !== "boolean") {
      clog(`[llm-detector] missing 'ready' bool in response`);
      return null;
    }
    return {
      ready: parsed.ready,
      why: typeof parsed.why === "string" ? parsed.why : "",
      latencyMs: Date.now() - start,
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
    };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      clog(`[llm-detector] timeout after ${TIMEOUT_MS}ms`);
    } else {
      clog(`[llm-detector] error: ${(err as Error).message}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
