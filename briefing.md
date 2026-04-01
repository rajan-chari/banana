# Briefing
Last updated: 2026-04-01 12:00

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
- 2026-04-01 12:00 — Fixed 3 cost display bugs: missing broadcast, exit-only regex, 4-decimal display
- 2026-04-01 11:33 — Status bar JSON hook implemented + jade confirmed no billing gate
- 2026-04-01 11:20 — Jade onboarded. First task: status bar + cost analysis (complete)
- 2026-04-01 05:12 — Per-session cost tracking, moved to Diag tab
- 2026-04-01 04:22 — Add Root to header, orange border, fellow-agents kit

## Next Up
- Server restart needed: cost fixes + status bar hook activation
- Jade: available for next investigation task
- pty-cld: force-idle subcommand (pending Rajan)
