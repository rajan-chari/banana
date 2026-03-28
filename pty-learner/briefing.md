# Briefing
Last updated: 2026-03-28 19:25

## Current Focus
Pipeline complete and deployed. ONNX inference live in pty-win (pending restart). Idle.

## Don't Forget
- Use `git commit -F - <<'EOF'` heredoc pattern (not `$()` substitution)
- Label schema is `busy`/`not_busy` (not `busy`/`idle`)
- Class imbalance: ~6% busy — address before next training run (class weighting or more busy samples)
- Model path: ../pty-learner/ml/classifier.onnx (relative from pty-win root); overridable via --ml-model-path
- ONNX output_probability is dict-keyed: result['output_probability'].data[0]['busy']
- ort TypeScript defs don't cover seq(map) — cast as unknown as Record<string,number> is the workaround
- emcom identity: registered as amber on this workspace

## Recent
- 2026-03-28 19:20 — Checkpoint: pipeline complete, watching for pty-win restart
- 2026-03-28 19:15 — ONNX integration complete (moss d7de3df), Rajan notified
- 2026-03-28 19:10 — Sent complete ONNX spec to moss
- 2026-03-28 19:05 — Rajan confirmed Option A: ONNX local via onnxruntime-node
- 2026-03-28 18:10 — First training run: busy recall=1.00, accuracy=0.98

## Next Up
- Monitor pty-win in production — does ONNX inference improve idle detection?
- Collect more busy samples to address 6% class imbalance
- Retrain when dataset grows or issues surface
