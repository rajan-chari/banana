# Briefing
Last updated: 2026-04-01 13:37

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
- 2026-04-01 13:36 — Unfocused pane border #505050 (visible edge definition)
- 2026-04-01 12:23 — Dashboard + Diag merged into single tab
- 2026-04-01 12:20 — Reverted hook approach → regex scraping (works with multi-instance pty-win)
- 2026-04-01 12:00 — Fixed 3 cost bugs: broadcast, exit-only regex, 4-decimal display
- 2026-04-01 11:20 — Jade onboarded + status bar analysis complete

## Next Up
- Server restart needed: cost regex + merged dashboard + unfocused border
- Jade: available for next investigation task
- pty-cld: force-idle subcommand (pending Rajan)
