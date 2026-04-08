# Briefing
Last updated: 2026-04-08 19:07

## Current Focus
Pipeline complete and idle since 2026-03-28. ONNX model (classifier.onnx) was integrated into pty-win by moss (commit d7de3df). No new work has been requested since initial deployment.

## Don't Forget
- Use `git commit -F - <<'EOF'` heredoc pattern (not `$()` substitution)
- Label schema is `busy`/`not_busy` (not `busy`/`idle`) — always verify against actual JSONL
- Class imbalance: ~6% busy (37 busy vs 544 not_busy) — needs more busy samples or class weighting before next retrain
- Model path: ../pty-learner/ml/classifier.onnx (relative from pty-win root); overridable via --ml-model-path
- ONNX output_probability is dict-keyed: result['output_probability'].data[0]['busy']
- ort TypeScript defs don't cover seq(map) — cast as `unknown as Record<string,number>`
- emcom identity: registered as **amber** on this workspace

## Recent
- 2026-04-02 22:07 — Received emcom feature announcement from milo (new batch/filter/status commands). Informational only.
- 2026-03-28 19:20 — Pipeline complete: train → evaluate → ONNX export → pty-win integration all done
- 2026-03-28 19:15 — ONNX integration into pty-win completed by moss (d7de3df), Rajan notified
- 2026-03-28 19:05 — Rajan chose Option A: ONNX local inference via onnxruntime-node
- 2026-03-28 18:10 — First training run: busy recall=1.00, accuracy=0.98 on 117 test samples

## Next Up
- Monitor pty-win in production — does ONNX inference improve idle detection accuracy?
- Collect more busy samples to address class imbalance (currently ~6% busy)
- Retrain when dataset grows or production issues surface
- No blockers; waiting for new work or production feedback
