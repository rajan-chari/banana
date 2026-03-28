# Tracker
Last updated: 2026-03-28 19:15

## In Motion
| Item | Status | Owner | Notes/Links |
|------|--------|-------|-------------|
| ONNX integration into pty-win | Implementing | moss | Full spec sent; moss implementing runLocalMLInference in session.ts |

## Watching
| Item | Waiting On | Details | Links |
|------|------------|---------|-------|
| pty-win integration complete | moss | Replacing queryMLService with ONNX local call | |

## Completed
| Date | Item | Outcome |
|------|------|---------|
| 2026-03-28 | Initial workspace creation | Scaffolded by milo per Rajan's request |
| 2026-03-28 | Onboarding setup | Registered as amber, .gitignore + CLAUDE.md updated |
| 2026-03-28 | Dataset label review | 54 corrections (51 relabeled, 3 deleted); busy: 37, not_busy: 544 |
| 2026-03-28 | First training run | busy recall=1.00, accuracy=0.98 on 117 test samples (run by milo) |
| 2026-03-28 | ONNX export | classifier.onnx at pty-learner/ml/; char_wb→word tokenizer fix, accuracy unchanged |
| 2026-03-28 | Architecture decision | Option A confirmed by Rajan: ONNX local via onnxruntime-node (no HTTP service) |
| 2026-03-28 | ONNX tensor spec | Confirmed with milo: output_label + output_probability (dict-keyed), path ../pty-learner/ml/classifier.onnx |
