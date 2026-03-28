# Briefing
Last updated: 2026-03-28 18:10

## Current Focus
First model trained and validated. Deciding next step: ONNX export for pty-win integration vs further validation.

## Don't Forget
- Use `git commit -F - <<'EOF'` heredoc pattern (not `$()` substitution)
- ML service runs on port 8710
- Label schema is `busy`/`not_busy` (not `busy`/`idle`)
- Class imbalance: ~6% busy — may need class weighting for future training runs
- labels-001.jsonl:199 is a permission dialog mid-execution — correctly labeled busy (don't re-correct)

## Recent
- 2026-03-28 18:10 — First training run complete: busy recall=1.00, accuracy=0.98 (117 test samples)
- 2026-03-28 17:55 — Dataset label review: 54 corrections applied (47 timeout_flag flips, 3 auto_detect, 3 deleted)
- 2026-03-28 17:50 — Coordinated with milo on agent_review.py format; tool shipped at commit 9b88b0c
- 2026-03-28 03:40 — Workspace created by milo on request from Rajan

## Next Up
- Decide: ONNX export for pty-win (via onnxruntime-node) or validate errors first
- If ONNX: run export_onnx.py, coordinate with moss on integration into screen-detector.ts
