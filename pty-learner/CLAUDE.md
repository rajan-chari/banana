# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this workspace.

## Startup

Before responding to the user's first message:

1. Read `Claude-KB.md` (domain knowledge, lessons learned).
2. Read `briefing.md` (current focus, recent decisions, next up). Prune entries older than 7 days on startup.
3. Read `tracker.md` for current work items and status.
4. Greet the user covering:
   - **What's here** — project summary, current model status
   - **Open items** — active tasks, blockers
   - **Quick actions** — common commands

## Project

`pty-learner` is a Python ML pipeline for classifying pty-win session state (busy vs idle) using terminal buffer text. It may expand to other pty-related ML work.

```
pty-learner/
├── ml/
│   ├── train.py           # model training
│   ├── evaluate.py        # evaluation + metrics
│   ├── export_onnx.py     # export trained model to ONNX
│   ├── requirements.txt   # ML dependencies
│   └── service/           # FastAPI inference service
│       └── main.py
├── CLAUDE.md
├── briefing.md
├── tracker.md
└── Claude-KB.md
```

## Quick Commands

```bash
# Setup
cd ml && python -m venv .venv && source .venv/Scripts/activate
pip install -r requirements.txt

# Training
python train.py

# Evaluation
python evaluate.py

# Export to ONNX
python export_onnx.py

# Inference service
uvicorn service.main:app --reload --port 8710
```

## Git Commit Style

Always use `-F -` with heredoc — never `$(cat <<'EOF'...)`:

```bash
git commit -F - <<'EOF'
Commit message here.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
```

## Session End

Before ending a session, run `/rc-save` to commit and push changes.
