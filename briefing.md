# Briefing
Last updated: 2026-03-31 14:28

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
- 2026-03-31 14:25 — VS Code button moved left + identity click switches feed panel. Verified + reported.
- 2026-03-31 14:04 — Claude --resume context menu verified (right-click AI cmd-tag + pane topbar)
- 2026-03-31 13:55 — Session row highlight revised to 0.22 opacity + VS Code button always visible
- 2026-03-31 13:38 — Session row highlight + VS Code pane button first pass (revised after Rajan feedback)
- 2026-03-31 05:01 — Assigned pty-win/emcom UI coordinator role by Rajan

## Next Up
- Waiting for new pty-win requests from Rajan
- Phase 8: Polish & Hardening (banana project)
- EM coordination efficiency re-test (low priority, banana-scope)
