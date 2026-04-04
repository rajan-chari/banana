# Briefing
Last updated: 2026-04-04 01:36

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
- 2026-04-04 01:35 — Tracker panel spec sent to moss but PARKED — moss focused on session.ts test coverage per Rajan. Rajan considering adding a second pty-win worker agent. Offered to onboard/coordinate them.
- 2026-04-04 01:32 — Work tracker live on emcom-server (GET /tracker with X-Emcom-Name header). Tested API — items have repo, number, title, status, severity, assigned_to, blocker, findings, decision.
- 2026-04-04 00:28 — PRIORITY: Hook-based idle detection implemented by moss. 3 Claude Code hooks (Stop, Notification, UserPromptSubmit) replace heuristic screen detection. type:'http', 5s idle threshold. Hooks merge safely (jade confirmed). Needs server restart. Research: research/hooks.md.
- 2026-04-03 22:42 — Shutdown double-Ctrl+C fix, 3 of 5 pty-win improvements shipped, scout cost investigation.
- 2026-04-03 14:25 — # in --body permission prompt fix. emcom case-insensitive confirmed.
- 2026-04-02 22:10 — emcom announcement distributed to team via blake (9 sub-workspace agents). Frost shipped Batch 2 too (status, inbox filters, CC comma fix, stdin body, case-insensitive names). Threading already existed (emcom thread/threads).
- 2026-04-02 20:10 — Jade completed comprehensive permissions review. Saved to research/permissions.md. Covers rule syntax, 7 common prompt triggers with fixes, recommended configs per agent type.
- 2026-04-02 19:30 — Fixed rc-save SKILL.md to explicitly require separate git calls + git commit -F - heredoc. Root cause of team-wide permission prompts was agents choosing && chaining + $(cat) heredoc.
- 2026-04-02 19:01 — Dashboard: cost last column, drag-and-drop onto tabs. Pane separation: #aaa borders, 4px gap, 2px width, dimmed unfocused topbar.
- 2026-04-02 18:55 — Scout cost investigation: $4.98 from context accumulation × cold cache × 15-min polling. Fix: Haiku + /clear = ~50x reduction.
- 2026-04-02 14:42 — Pane separation: 4px gutter + 2px borders + dimmed unfocused topbar + bg contrast. Multiple Rajan feedback rounds.
- 2026-04-02 14:24 — Dashboard polish: bright text, clickable rows, merged stats+costs table, collapsible cards.
- 2026-04-02 13:09 — PID file idle detection blocked: BG_SESSIONS compile-time flag OFF. PID files exist (pid, cwd) but lack live status. Heuristics work fine. Upgrade path documented in Claude-KB.md.
- 2026-04-02 12:30 — Restructured own Claude-KB.md to 4 sections. Added "debug by reading, not guessing" to CLAUDE.md. Jade investigated idle detection — found explicit state machine, PID file, Notification hook timing.
- 2026-04-02 11:47 — PR testing workflow + Claude-KB expansion in team-manual.md. Organic rollout confirmed.

## Next Up
- Server restart needed by Rajan: hook-based idle detection (priority), cost regex, merged dashboard, pane separation, drag-and-drop, cost in checkpoints, last-active column, double-Ctrl+C fix. Large TS backlog.
- **Moss is on test coverage** — do NOT send feature specs to moss until tests are done. Tracker panel parked.
- Rajan may add a second pty-win worker — milo ready to onboard/coordinate.
- Detach/reattach ideated but not confirmed. PID file cwd helps with session matching.
- Jade: available for next task. Resume behavior still unexplored.
- Scout cost optimization: Rajan has fix vectors but hasn't acted.
- emcom next round: message priority, read receipts, forward, broadcast/groups. Waiting on Rajan.
