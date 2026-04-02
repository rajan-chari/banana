# Briefing
Last updated: 2026-04-02 14:43

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
- 2026-04-02 14:42 — Pane separation iteration: gap (4px gutter), 2px borders (orange focused, steel-blue #3d5a6a unfocused), dimmed unfocused topbar (#252525 bg, muted text), slightly darker unfocused pane bg (#1a1a1a vs #1e1e1e). Multiple rounds with Rajan's feedback — gray borders blended in, needed a distinct hue + physical separation.
- 2026-04-02 14:24 — Dashboard polish: brightened stats text (#ccc), clickable rows → focus pane, merged stats+costs into one table, collapsible workspace cards (localStorage persisted).
- 2026-04-02 13:09 — PID file idle detection blocked: BG_SESSIONS compile-time flag OFF. PID files exist (pid, cwd) but lack live status. Heuristics work fine. Upgrade path documented in Claude-KB.md.
- 2026-04-02 12:30 — Restructured own Claude-KB.md to 4 sections. Added "debug by reading, not guessing" to CLAUDE.md. Jade investigated idle detection — found explicit state machine, PID file, Notification hook timing.
- 2026-04-02 11:47 — PR testing workflow + Claude-KB expansion in team-manual.md. Organic rollout confirmed.

## Next Up
- Server restart needed by Rajan: cost regex, merged dashboard, unfocused border, hook revert, checkpoint prompt update. All TS changes requiring rebuild.
- Detach/reattach feature ideated (close pane but keep process alive, pty-cld as remote client). PID file cwd helps with session matching. Rajan hasn't confirmed — waiting.
- Jade: available for next investigation. Resume behavior is the remaining unexplored area.
- Session resilience rollout: organic via team-manual. Rajan said no broadcast.
- pty-cld: force-idle subcommand (pending Rajan).
