# Tracker
Last updated: 2026-04-20 20:55

## In Motion
| Item | Status | Owner | Notes/Links |
|------|--------|-------|-------------|

## Watching
| Item | Waiting On | Details | Links |
|------|------------|---------|-------|
| pty-win live with ONNX | moss/Rajan | Needs server restart to go live | commit d7de3df |
| working-state migration (Phase 1 canary) | Rajan/coordinator | Plan v2 locked; awaiting folder-creation ping then execute 5-step migration | emcom 9afb689b |

## Completed
| Date | Item | Outcome |
|------|------|---------|
| 2026-04-20 | Wiki cleanup + pty-learner seed | librarian published tooling/pty-learner/ (index + classifier.md + integration.md); 3 duplicates consolidated |
| 2026-03-28 | Initial workspace creation | Scaffolded by milo per Rajan's request |
| 2026-03-28 | Onboarding setup | Registered as amber, .gitignore + CLAUDE.md updated |
| 2026-03-28 | Dataset label review | 54 corrections (51 relabeled, 3 deleted); busy: 37, not_busy: 544 |
| 2026-03-28 | First training run | busy recall=1.00, accuracy=0.98 on 117 test samples (run by milo) |
| 2026-03-28 | ONNX export | classifier.onnx at pty-learner/ml/; char_wb→word tokenizer fix |
| 2026-03-28 | ONNX integration into pty-win | Done (moss d7de3df) — runLocalMLInference(), mlModelPath flag, 0.75 threshold |
