# Briefing
Last updated: 2026-03-28 19:15

## Current Focus
ONNX integration into pty-win — moss implementing runLocalMLInference() in session.ts.

## Don't Forget
- Use `git commit -F - <<'EOF'` heredoc pattern (not `$()` substitution)
- Label schema is `busy`/`not_busy` (not `busy`/`idle`)
- Class imbalance: ~6% busy — may need class weighting for future training runs
- labels-001.jsonl:199 is a permission dialog mid-execution — correctly labeled busy
- Model path convention: ../pty-learner/ml/classifier.onnx (relative from pty-win root)
- ONNX output_probability is dict-keyed: result['output_probability'].data[0]['busy'] — not index-based

## Recent
- 2026-03-28 19:10 — Sent complete ONNX spec to moss (tensor names, path, extraction pattern)
- 2026-03-28 19:05 — Rajan confirmed Option A: ONNX local via onnxruntime-node
- 2026-03-28 18:10 — First training run complete: busy recall=1.00, accuracy=0.98
- 2026-03-28 17:55 — Dataset label review: 54 corrections applied

## Next Up
- Wait for moss to complete integration and confirm /predict equivalent working in pty-win
- Consider: collect more busy samples to address class imbalance before next training run
