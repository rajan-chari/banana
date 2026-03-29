# Briefing
Last updated: 2026-03-29 00:00

## Current Focus
Idle. pty-learner ML pipeline fully complete — amber labeled dataset, milo trained + exported ONNX, moss integrated into pty-win (d7de3df). Waiting for pty-win restart to go live.

## Don't Forget
- Run `/rc-save` after each user request
- Use `git commit -F - <<'EOF'` heredoc pattern (not `$()` substitution)
- emcom identity fallback: `emcom --identity c:/s/projects/work/teams/working/banana/identity.json <cmd>`
- ONNX output_probability is dict-keyed (not index): `result['output_probability'].data[0]['busy']`
- Layered auto-save: commit after completing each tracker item

## Recent
- 2026-03-28 19:25 — ONNX integration complete (moss d7de3df) — pty-win live pending restart
- 2026-03-28 19:15 — Sent ONNX tensor spec to moss (string_input, output_label, output_probability)
- 2026-03-28 19:00 — classifier.onnx exported, inference service running on :8710
- 2026-03-28 18:30 — First training run: busy recall=1.00, accuracy=0.98 (amber's 54 corrections applied)
- 2026-03-28 18:00 — agent_review.py: export/apply modes for amber's AI dataset labeling (9b88b0c)
- 2026-03-28 17:30 — PyInstaller build: all 5 exes built (browse/train/evaluate/export/agent-review)

## Next Up
- Monitor pty-win in production once restarted
- Collect more busy samples to address 6% class imbalance
- Implement layered auto-save rules in CLAUDE.md (pending Rajan's confirmation)
- Phase 8: Polish & Hardening
