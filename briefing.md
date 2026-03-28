# Briefing
Last updated: 2026-03-28 18:00

## Current Focus
pty-learner tooling complete: browse.py, agent_review.py, PyInstaller build. Amber doing dataset labeling. Waiting for corrections before training run.

## Don't Forget
- Run `/rc-save` after each user request
- Use `git commit -F - <<'EOF'` heredoc pattern (not `$()` substitution)
- Layered auto-save: commit after completing each tracker item
- Three-tier operating manual shipped — global rule auto-loaded, onboarding.md read once, team-manual.md on-demand

## Recent
- 2026-03-28 18:00 — agent_review.py: export/apply modes for amber's AI dataset labeling (9b88b0c)
- 2026-03-28 18:00 — PyInstaller build.ps1 + all 4 exes built successfully
- 2026-03-28 shutdown — browse.py: lazy loading + smarter UI (c5e298e)
- 2026-03-28 04:00 — browse.py v1: single-keypress reviewer with regex opinion (e5e100b)
- 2026-03-28 04:00 — pty-learner: created workspace + ML skeleton, aligned data format with pty-win (6ec51ba)
- 2026-03-27 19:15 — Read updated onboarding.md; noted 3 new agents (heidi, thorn, researcher); replied to Rajan
- 2026-03-27 14:20 — Emcom: replied to RFC on utility script workspaces (4 script ideas, structural feedback)

## Next Up
- pty-learner: apply amber's corrections → first training run
- Implement layered auto-save rules in CLAUDE.md (pending Rajan's confirmation)
