# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this workspace.

## Startup

Before responding to the user's first message:

1. Read `C:\s\projects\work\teams\working\working-state\amber\briefing.md` — current focus, don't-forget, recent, next up. Prune entries older than 7 days on startup (move to `briefing-archive.md`).
2. Read `C:\s\projects\work\teams\working\working-state\amber\field-notes.md` — tactical gotchas learned by doing.
3. Run `tracker queue amber` for current work items (tracker CLI is the sole source of truth).
4. Read team-wiki index: `../../team-wiki/index.md`. Follow into `tooling/pty-learner/` (owned by amber) and any section relevant to the current task. Librarian is the sole writer; contribute via emcom to `librarian` (or `private-librarian` for sensitive content).
5. Greet the user covering:
   - **What's here** — project summary, current model status
   - **Open items** — active tasks, blockers
   - **Quick actions** — common commands

## Project

`pty-learner` is a Python ML pipeline for classifying pty-win session state (busy vs not_busy) using terminal buffer text. It may expand to other pty-related ML work.

```
pty-learner/
├── ml/
│   ├── train.py           # model training
│   ├── evaluate.py        # evaluation + metrics
│   ├── export_onnx.py     # export trained model to ONNX
│   ├── requirements.txt   # ML dependencies
│   └── service/           # FastAPI inference service
│       └── main.py
└── CLAUDE.md
```

Working state (briefing, field-notes, activity log) lives in `working-state/amber/` — a separate private repo. Tracker items live in the `tracker` CLI DB.

## Quick Commands

```bash
# Setup
cd ml && python -m venv .venv && source .venv/Scripts/activate
pip install -r requirements.txt

# Training / evaluation / export
python train.py
python evaluate.py
python export_onnx.py

# Inference service
uvicorn service.main:app --reload --port 8710
```

## Git Commit Style

Always use `-F -` with heredoc — never `$(cat <<'EOF'...)`:

```bash
git commit -F - <<'EOF'
Commit message here.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

Keep host-repo commit messages procedural ("update CLAUDE.md", "fix train.py"). Session narratives belong in `working-state/amber/` commits.

## Session End

Before ending a session, run `/rc-save` to commit and push changes.

## Guardrails

- **Independent verification**: All community-facing content (GitHub comments, PRs, docs, samples) must be verified by a different agent before posting. Canonical: team-wiki/process/ (via librarian).

## Field Notes

Tactical gotchas go in `working-state/amber/field-notes.md` — update it immediately when encountered. Key items as of 2026-04-24:

- Label schema is `busy`/`not_busy` (not `busy`/`idle`) — always check the actual JSONL
- ML service port is 8710 (original spec said 3601 — use 8710)
