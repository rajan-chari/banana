# Briefing
Last updated: 2026-03-31 05:21

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
- 2026-03-31 05:19 — Answered Rajan's questions about EM coordination efficiency and AI preset feature
- 2026-03-31 05:10 — Switched to correct DevTools port (3601), recorded in KB + briefing
- 2026-03-31 05:07 — AI preset label verified live after browser refresh. Reported to Rajan + moss.
- 2026-03-31 05:03 — Verified all post-restart changes (feed toolbar, resume kick, identity picker, dashboard)
- 2026-03-31 05:01 — Assigned pty-win/emcom UI coordinator role by Rajan
- 2026-03-31 05:02 — Synced with moss on open items; sent AI preset label spec

## Next Up
- Pick next pty-win polish item: root folder indent alignment or drag-and-drop pane reorder
- Phase 8: Polish & Hardening (banana project)
- EM coordination efficiency re-test (low priority, banana-scope)
