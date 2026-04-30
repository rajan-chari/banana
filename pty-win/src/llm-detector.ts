import { clog } from "./log.js";

/**
 * LLM-based readiness checks for Claude Code TUI sessions.
 *
 * Two questions:
 *
 * 1) checkReadiness — "is Claude waiting at an empty input prompt?"
 *    Used when cheap heuristics get stuck (stuck-busy or unknown-streak)
 *    and we want to decide whether to fire a pending inject.
 *
 * 2) checkStuckInput — "is the previously-injected text sitting in the input
 *    area, awaiting Enter?"
 *    Used by the post-inject verifier when no prompt-submit hook fired
 *    within 5s. If yes, we re-send SUBMIT to recover the stuck inject.
 *
 * Asymmetric decision rule baked into both prompts: when uncertain, choose NO.
 *  - For checkReadiness: false-positive READY causes lost auto-injections.
 *  - For checkStuckInput: false-positive STUCK causes a stray Enter (cheap).
 *  Both directions favor "do nothing" over "act incorrectly".
 *
 * On any error / timeout / parse failure → return null. Caller falls through
 * to current behavior; we never introduce new failure modes.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-5-nano";
const TIMEOUT_MS = 6_000;

export interface LlmCheckInput {
  screenLines: string[];
  lastInjectText?: string;
  lastInjectAgoMs?: number;
  // Corrections from past wrong verdicts — rotated in for adaptive few-shot.
  corrections?: CorrectionExample[];
}

export interface CorrectionExample {
  screen: string;
  llmSaid: boolean;
  actualOutcome: "no_submit_within_5s" | "user_intervened" | "submitted_ok" | "recovered_by_resend" | "gave_up";
  notes?: string;
}

export interface LlmVerdict {
  ready: boolean;
  why: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

// ---- Prompts ----

const READINESS_FEW_SHOT: Array<{ screen: string; ready: boolean; why: string }> = [
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

const READINESS_SYSTEM_PROMPT = `You are a precise classifier for the Claude Code terminal UI.

You will be shown the last ~30 lines of a Claude Code TUI screen and asked: is Claude waiting at an empty input prompt, ready to receive a new auto-injected user message?

Definitions:
- READY (ready=true): Cursor is at an empty input box (line starts with ❯ followed by nothing or whitespace), no streaming output, no permission prompt, no churn/spinner. The input area is stable.
- NOT READY (ready=false): Claude is rendering a response, a tool is running, a permission/confirmation prompt is open, the input area shows previous text, or the screen is mid-update.

Decision rule: when uncertain, choose NOT READY. False-positive READY causes lost auto-injections; false-negative READY just delays one inject.

Respond with strict JSON only: {"ready": boolean, "why": "<short reason>"}`;

const STUCK_INPUT_FEW_SHOT: Array<{ screen: string; injectText: string; stuck: boolean; why: string }> = [
  {
    screen: [
      "✻ Churned for 12s",
      "─────────────────────────────────────────────────────",
      "❯ [2026-04-30 06:54 pty-win:emcom:normal:normal] Check emcom inbox, read and",
      "  handle new messages, and collaborate with others as needed.                ",
      "─────────────────────────────────────────────────────",
    ].join("\n"),
    injectText: "[2026-04-30 06:54 pty-win:emcom:normal:normal] Check emcom inbox",
    stuck: true,
    why: "The injected emcom prompt is visible in the input box (lines after ❯), Claude is not currently processing it. Resending Enter will submit it.",
  },
  {
    screen: [
      "  ⎿  All 6 tests pass",
      "✻ Churned for 8s",
      "─────────────────────────────────────────────────────",
      "❯ ",
      "─────────────────────────────────────────────────────",
    ].join("\n"),
    injectText: "[pty-win:checkpoint-light...] update tracker.md",
    stuck: false,
    why: "Input box is empty. The injected text is not present — Claude likely consumed and discarded it, or the inject never landed in the input area. Resending Enter would submit empty input.",
  },
  {
    screen: [
      "  ⎿  Reading file...",
      "─────────────────────────────────────────────────────",
      "❯ The user's question goes here for context  ",
      "─────────────────────────────────────────────────────",
    ].join("\n"),
    injectText: "[pty-win:emcom:normal:normal] Check emcom inbox",
    stuck: false,
    why: "Input box has text but it's the user's prior question, not the pty-win injection. Don't resend Enter — would submit unrelated content.",
  },
];

const STUCK_INPUT_SYSTEM_PROMPT = `You are a precise classifier for the Claude Code terminal UI.

You will be shown the last ~30 lines of a Claude Code TUI screen, plus the text that pty-win recently tried to auto-inject. Question: is that injected text currently sitting in the input area, awaiting Enter to submit?

Definitions:
- STUCK (stuck=true): The input area visibly contains the injected text (or the start of it). Re-sending Enter would submit it. Claude is not actively rendering output that would consume the input.
- NOT STUCK (stuck=false): The input box is empty, contains different text (e.g., the user's prior message), or the screen is in a state where re-sending Enter would do something unintended (modal dialog, mid-render, etc.).

Decision rule: when uncertain, choose NOT STUCK. False-positive STUCK causes a stray Enter into Claude (mostly harmless but noisy); false-negative STUCK leaves a recoverable inject unrecovered.

Respond with strict JSON only: {"stuck": boolean, "why": "<short reason>"}`;

// ---- Shared HTTP / parsing helpers ----

interface RawMessage { role: "system" | "user" | "assistant"; content: string }

async function callOpenAI<TParsed>(
  messages: RawMessage[],
  validate: (obj: unknown) => TParsed | null,
): Promise<({ parsed: TParsed; latencyMs: number; inputTokens?: number; outputTokens?: number }) | null> {
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
      messages,
      response_format: { type: "json_object" as const },
      reasoning_effort: "minimal" as const,
      max_completion_tokens: 1000,
    };
    const resp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      clog(`[llm-detector] JSON parse failed: ${content.slice(0, 80)}`);
      return null;
    }
    const parsed = validate(raw);
    if (parsed == null) return null;
    return {
      parsed,
      latencyMs: Date.now() - start,
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
    };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") clog(`[llm-detector] timeout after ${TIMEOUT_MS}ms`);
    else clog(`[llm-detector] error: ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Public API ----

function buildReadinessUserMsg(input: LlmCheckInput): string {
  const parts: string[] = [];
  parts.push("Screen lines:");
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

export async function checkReadiness(input: LlmCheckInput): Promise<LlmVerdict | null> {
  const messages: RawMessage[] = [{ role: "system", content: READINESS_SYSTEM_PROMPT }];
  for (const ex of READINESS_FEW_SHOT) {
    messages.push({ role: "user", content: `Screen lines:\n\`\`\`\n${ex.screen}\n\`\`\`\nReturn only the JSON verdict.` });
    messages.push({ role: "assistant", content: JSON.stringify({ ready: ex.ready, why: ex.why }) });
  }
  messages.push({ role: "user", content: buildReadinessUserMsg(input) });

  const result = await callOpenAI(messages, (raw): { ready: boolean; why: string } | null => {
    const obj = raw as { ready?: unknown; why?: unknown };
    if (typeof obj.ready !== "boolean") {
      clog(`[llm-detector] missing 'ready' bool in response`);
      return null;
    }
    return { ready: obj.ready, why: typeof obj.why === "string" ? obj.why : "" };
  });
  if (!result) return null;
  return { ready: result.parsed.ready, why: result.parsed.why, latencyMs: result.latencyMs, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}

export interface StuckInputCheckInput {
  screenLines: string[];
  injectText: string;
}

export interface StuckVerdict {
  stuck: boolean;
  why: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export async function checkStuckInput(input: StuckInputCheckInput): Promise<StuckVerdict | null> {
  const messages: RawMessage[] = [{ role: "system", content: STUCK_INPUT_SYSTEM_PROMPT }];
  for (const ex of STUCK_INPUT_FEW_SHOT) {
    const userPart = `Screen lines:\n\`\`\`\n${ex.screen}\n\`\`\`\nInjected text: ${JSON.stringify(ex.injectText)}\nReturn only the JSON verdict.`;
    messages.push({ role: "user", content: userPart });
    messages.push({ role: "assistant", content: JSON.stringify({ stuck: ex.stuck, why: ex.why }) });
  }
  messages.push({
    role: "user",
    content: `Screen lines:\n\`\`\`\n${input.screenLines.join("\n")}\n\`\`\`\nInjected text: ${JSON.stringify(input.injectText)}\nReturn only the JSON verdict.`,
  });
  const result = await callOpenAI(messages, (raw): { stuck: boolean; why: string } | null => {
    const obj = raw as { stuck?: unknown; why?: unknown };
    if (typeof obj.stuck !== "boolean") {
      clog(`[llm-detector] missing 'stuck' bool in response`);
      return null;
    }
    return { stuck: obj.stuck, why: typeof obj.why === "string" ? obj.why : "" };
  });
  if (!result) return null;
  return { stuck: result.parsed.stuck, why: result.parsed.why, latencyMs: result.latencyMs, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}
