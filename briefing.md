# Briefing
Last updated: 2026-04-01 11:35

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
- 2026-04-01 11:33 — Status bar JSON hook implemented (model, tokens, cost via settings.local.json + /api/hook/status-line)
- 2026-04-01 11:20 — Jade onboarded (claude-code-src analyst). First task: status bar format investigation.
- 2026-04-01 11:00 — Cost regex improved + ~/.claude.json path identified
- 2026-04-01 05:12 — Per-session cost tracking (regex + costs.json), moved to Diag tab
- 2026-04-01 04:22 — Add Root to Folders header, orange pane border, fellow-agents kit

## Next Up
- Status bar hook: needs server restart to activate
- Rajan's settings.json statusLine takes priority over hook (expected behavior)
- pty-cld: add force-idle subcommand (pending Rajan's confirmation)
- Jade: available for next investigation task
