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
