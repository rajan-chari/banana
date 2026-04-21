# Claude-KB — pty-learner

Domain knowledge, lessons learned, and gotchas for the pty-learner workspace.

## Project Context

- **Goal**: Classify pty-win terminal session state (busy vs not_busy) from screen buffer text
- **Input**: 20-line terminal buffer snapshot (what xterm-headless sees)
- **Output**: `busy` | `not_busy` label (binary classification, may expand)
- **Integration target**: pty-win's idle detection (`src/screen-detector.ts`)
- **Current pty-win approach**: Regex patterns on screen buffer + quiet-period timer

## Data Format

Written by `pty-win/src/ml-dataset.ts` → `pty-win/ml-dataset/labels.jsonl` (gitignored, live on disk).

```jsonl
{
  "text_lines": ["line1", ..., "line20"],
  "label": "busy|not_busy",
  "confidence": "auto|strong|uncertain",
  "source": "auto_detect|force_idle|timeout_flag",
  "timestamp": "...",
  "session_id": "..."
}
```

**Source meanings:**
- `auto_detect` — detected automatically via screen analysis (confidence: auto)
- `force_idle` — user/system explicitly forced idle state (confidence: strong)
- `timeout_flag` — 5-min busy timeout fired, boundary is uncertain (confidence: uncertain)

**Training filter:** exclude `source=timeout_flag` by default. Both `auto` and `strong` confidence are safe to train on.

**Target:** ~300 samples before first training run.

## Architecture Notes

- ONNX export enables language-agnostic inference — pty-win (TypeScript) can load the model via `onnxruntime-node`
- FastAPI service (port 8710) is an alternative integration path if ONNX loading is complex in TS
- Port plan: original spec said 3601, scaffold used 8710 — moss (pty-win) will coordinate which to use
- `applyMLInference()` stub already exists in `pty-win/src/session.ts` — ready for inference integration

## Guardrails

### Independent verification for community-facing content (2026-04-10)
All community-facing content (GitHub comments, PRs, docs, samples) must be independently verified before posting. Author prepares, a different agent tests/reviews. No self-verification.
- **Code** (PRs, samples): must compile + run, tested by a different agent
- **Non-code** (comments, recommendations): fact-checked by a different agent
- **Exempt**: low-risk responses (ack issues, asking for repro)
- **Scope**: GitHub/public only. Internal emcom/tracker/briefing excluded.

## Lessons Learned

### 2026-03-28: Label schema is "busy"/"not_busy" not "busy"/"idle"
pty-win's data collector uses `not_busy` (not `idle`). Original scaffold used `busy`/`idle` — corrected in train.py and evaluate.py. Always check the actual JSONL file before assuming label names.

### 2026-03-28: timeout_flag samples are systematically mislabeled busy
`source=timeout_flag` means the 5-min busy timer fired — but by the time the snapshot is captured, the session has often already gone idle (shows `❯` prompt). These get labeled `busy` incorrectly. Always review timeout_flag samples separately; most should be flipped to `not_busy`.

### 2026-03-28: emcom --body backticks are eaten by bash
Backticks inside `emcom send/reply --body "..."` are interpreted as command substitution by bash, stripping code blocks. Avoid backticks in emcom message bodies — use indented plain text instead.

### 2026-03-28: ONNX seq(map) output type in onnxruntime-node
`output_probability` from skl2onnx is type `seq(map(string, float))` — ort TypeScript type defs don't cover this. Access as: `result['output_probability'].data[0] as unknown as Record<string, number>`. Functionally correct, just needs the cast.

### 2026-03-28: ONNX input must be full 20-line buffer
Model was trained on full 20-line terminal buffers joined with `\n`. Single-line or partial inputs produce unreliable results. Always pass all 20 lines joined as one string.

### 2026-04-20: Team wiki — librarian is sole writer
Team wiki lives at `../../team-wiki/`. Per-workspace owners do NOT write directly to it. All contributions — including to your own section (e.g. `tooling/pty-learner/`) — go via emcom to `librarian`. Sensitive content (HR, creds, 1:1 notes) goes to `private-librarian` instead. Send the full page seed in the message body; librarian publishes and acks. Verify the write afterward by reading the file. Our own section tooling/pty-learner/ was seeded this way (emcom 6b310fa1).

### 2026-04-20: Wiki duplicate-consolidation pattern
When the same fact appears in 3+ pages, pick one canonical page and replace the others with single-line pointers ("See [path] for …"). Don't delete detail — just move it. Librarian applied this pattern cleanly for port 8800, --body flag, and --runtime-tmpdir. Send the cleanup proposal to librarian as a structured list with canonical-page recommendation.
