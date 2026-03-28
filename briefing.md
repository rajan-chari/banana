# Briefing
Last updated: 2026-03-28 shutdown

## Current Focus
pty-learner browse.py complete (lazy loading, regex opinion, priority ordering). Waiting for ~300 samples before first training run.

## Don't Forget
- Run `/rc-save` after each user request
- Use `git commit -F - <<'EOF'` heredoc pattern (not `$()` substitution)
- Layered auto-save: commit after completing each tracker item
- Three-tier operating manual shipped — global rule auto-loaded, onboarding.md read once, team-manual.md on-demand

## Recent
- 2026-03-28 shutdown — browse.py: lazy loading + smarter UI (c5e298e)
- 2026-03-28 04:00 — browse.py v1: single-keypress reviewer with regex opinion (e5e100b)
- 2026-03-28 04:00 — pty-learner: created workspace + ML skeleton, aligned data format with pty-win (6ec51ba)
- 2026-03-27 19:15 — Read updated onboarding.md; noted 3 new agents (heidi, thorn, researcher); replied to Rajan
- 2026-03-27 14:20 — Emcom: replied to RFC on utility script workspaces (4 script ideas, structural feedback)
- 2026-03-26 20:30 — Emcom: replied to Rajan's check-in, cleaned up 10 stale pending messages → all handled
- 2026-03-25 20:30 — Acknowledged shipped three-tier operating manual from Rajan. No cleanup needed — CLAUDE.md already clean.

## Next Up
- pty-learner: first training run when ~300 samples collected
- Implement layered auto-save rules in CLAUDE.md (pending Rajan's confirmation)
