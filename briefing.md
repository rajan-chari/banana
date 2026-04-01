# Briefing
Last updated: 2026-04-01 05:13

## Current Focus
pty-win/emcom UI coordinator (assigned by Rajan 2026-03-31). Owns spec→delegate→test→report loop with moss. Rajan handles strategic work; milo handles tactical pty-win/emcom iteration.

## Don't Forget
- Run `/rc-save` after each user request
- Use `git commit -F - <<'EOF'` heredoc pattern (not `$()` substitution)
- Chrome DevTools: use port 3601 (milo's session), NOT 3600 (Rajan's)
- emcom identity fallback: `emcom --identity c:/s/projects/work/teams/working/banana/identity.json <cmd>`
- ONNX output_probability is dict-keyed (not index): `result['output_probability'].data[0]['busy']`
- Layered auto-save: commit after completing each tracker item

## Recent
- 2026-04-01 05:12 — Per-session cost tracking shipped (regex on PTY stream, costs.json persistence, dashboard display)
- 2026-04-01 04:22 — Add Root button moved to Folders header
- 2026-04-01 02:30 — fellow-agents starter kit pushed (5 commits, all tasks done)
- 2026-04-01 01:40 — Focused pane border → orange (#d4882a)
- 2026-03-31 18:30 — Ported 3 features to pty-cld: checkpoint, resume kick, dynamic identity
- 2026-03-31 — 6 pty-win UI items shipped (AI preset label, highlight, VS Code btn, resume, identity click, VS Code left)

## Next Up
- pty-cld: add `force-idle` subcommand (pending Rajan's confirmation)
- pty-cld changes not yet committed (3 features + build)
- Waiting for new pty-win requests from Rajan
- Phase 8: Polish & Hardening (banana project)
