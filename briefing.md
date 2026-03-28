# Briefing
Last updated: 2026-03-28 19:15

## Current Focus
pty-learner ML pipeline complete end-to-end. classifier.onnx exported, inference service running on :8710. Moss implementing onnxruntime-node integration in pty-win.

## Don't Forget
- Run `/rc-save` after each user request
- Use `git commit -F - <<'EOF'` heredoc pattern (not `$()` substitution)
- emcom missing identity: use `emcom --identity c:/s/projects/work/teams/working/banana/identity.json <cmd>`
- No TypeScript preprocessing needed for ONNX — full sklearn pipeline baked in
- Layered auto-save: commit after completing each tracker item

## Recent
- 2026-03-28 19:15 — ONNX tensor spec sent to moss: string_input→output_label+output_probability (dict-keyed)
- 2026-03-28 19:00 — classifier.onnx exported, inference service running on :8710, /predict verified
- 2026-03-28 18:30 — First training run: busy recall=1.00, accuracy=0.98 (583 samples, amber's corrections)
- 2026-03-28 18:00 — agent_review.py: export/apply modes for amber's AI dataset labeling (9b88b0c)
- 2026-03-28 18:00 — PyInstaller build.ps1 + all 5 exes built (added pty-agent-review)
- 2026-03-28 shutdown — browse.py: lazy loading + smarter UI (c5e298e)
- 2026-03-28 04:00 — pty-learner: created workspace + ML skeleton, aligned data format with pty-win (6ec51ba)

## Next Up
- Wait for moss to implement applyMLInference() in pty-win
- Re-train periodically as more labeled data accumulates
- Implement layered auto-save rules in CLAUDE.md (pending Rajan's confirmation)
