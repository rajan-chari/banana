# Briefing
Last updated: 2026-04-23 23:23

## Current Focus
Pipeline complete and idle since 2026-03-28. ONNX model (classifier.onnx) is live in pty-win (moss, d7de3df). Team wiki went live 2026-04-20 with tooling/pty-learner/ published by librarian. CLAUDE.md now reads team-wiki index on every startup so shared-knowledge awareness survives restarts. No open work; waiting for dataset growth or production feedback before retrain.

## Don't Forget
- Use `git commit -F - <<'EOF'` heredoc pattern (not `$()` substitution)
- Label schema is `busy`/`not_busy` (not `busy`/`idle`) — always verify against actual JSONL
- Class imbalance: ~6% busy (37 busy vs 544 not_busy) — needs more busy samples or class weighting before next retrain
- Model path: ../pty-learner/ml/classifier.onnx (relative from pty-win root); overridable via --ml-model-path
- ONNX output_probability is dict-keyed: result['output_probability'].data[0]['busy']
- ort TypeScript defs don't cover seq(map) — cast as `unknown as Record<string,number>`
- emcom identity: registered as **amber** on this workspace
- Team wiki at `../../team-wiki/` — librarian is the ONLY writer to shared pages; contribute via emcom to `librarian` (or `private-librarian` for sensitive)

## Recent
- 2026-04-23 23:22 — Replied to Rajan's RFC on working-state repo (context leak fix). Supported the split; proposed option (b) explicit-path mount; flagged cost-history.json, scattered PNGs, settings.local.json, briefing-archive semantics as also-in-scope. Awaiting synthesis. (emcom 42388b6f)
- 2026-04-20 21:08 — CLAUDE.md startup step 4 added: reads ../../team-wiki/index.md every session so wiki awareness survives restarts; librarian-only-writer rule noted (df2a70f).
- 2026-04-20 20:58 — Librarian published tooling/pty-learner/ (index + classifier.md + integration.md) and applied all three duplicate consolidations. Both acked.
- 2026-04-20 20:55 — Wiki cleanup review: sent duplicate report + pty-learner content draft to librarian; replied handled to Rajan (ac1c1430).
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
