# Briefing
Last updated: 2026-04-07 15:02

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
- 2026-04-07 15:01 — Subagent pattern: evaluated vale, bolt, scout-triage, SDK agents. Bolt architecture drafted (coordinator + per-PR subagent). Open blocker: do Agent tool subagents inherit MCP/skills? Asked jade. Persist to bolt KB once validated.
- 2026-04-07 14:45 — Playwright MCP testing approach for Ctrl+F5 layout bug: use port 3650+ test instance, real browser inspection. Persisted in Claude-KB.md. Sent moss to start test instance.
- 2026-04-07 11:38 — Injection format cleanup by moss: timestamps prepended, whitespace removed, functions for fresh timestamps. Jade confirmed injection convention. Needs restart.
- 2026-04-07 05:15 — Tracker: Reminders button, stale empty fix, reminder convention. Dashboard scrollbar themed.
- 2026-04-07 03:20 — Ctrl+F5 layout fix (47d2e09): delayed fitAddon.fit() after full page load. Focus loss fix (dea5f14): re-focus terminal after WS DOM rebuilds. Feed recipient display (a27f694): "sender → recipient".
- 2026-04-07 01:00 — Tracker polish: category filter, null issue fix, show-closed toggle, closed styling on item class (DOM-persistent), zebra/hover, refresh button, resizable columns, history timeline, GitHub microsoft/ link.
- 2026-04-06 16:37 — Dashboard flicker fix + tracker panel redesign + right panel toggle.
- 2026-04-06 18:24 — Tracker Round 1 shipped (4a4ba0f): IBM Plex Mono font, brighter text (#ccc/#a080c0), tighter rows (3px padding), zebra striping.
- 2026-04-06 18:02 — Tracker staleness shipped (90c476a): age + time-in-status columns with green/yellow/red coding (<3d/3-7d/>7d). Stale items get red row highlight. Uses date_found when available, falls back to created_at.
- 2026-04-06 17:47 — Tracker moved to right panel (b193e2d): Feed/Tracker toggle tabs instead of workspace tab. Badge shows decision-pending count. Auto-polls 10s.
- 2026-04-06 16:37 — Dashboard flicker fix shipped (21359a8): DOM patching in-place instead of innerHTML rebuild. Cards keyed by data-session.
- 2026-04-06 16:40 — Frost shipped tracker WS endpoint. DOM patterns research copied to research/.
- 2026-04-04 05:11 — Hook error fixed: endpoints returned {status:'ok'} failing Zod validation. Fix: return {}. type:http confirmed not feature-gated.
- 2026-04-04 01:35 — Tracker panel spec parked (moss on tests). Work tracker CLI live (tracker command in PATH).
- 2026-04-04 00:28 — Hook-based idle detection implemented (Stop, Notification, UserPromptSubmit). Needs server restart.

## Next Up
- Server restart needed by Rajan: hook-based idle detection (priority), cost regex, merged dashboard, pane separation, drag-and-drop, cost in checkpoints, last-active column, double-Ctrl+C fix. Large TS backlog.
- Tracker panel complete (2 rounds). Milo now implementing frontend directly (Rajan approved). Moss on test coverage.
- Frost's tracker WS endpoint ready but emcom-server.exe needs rebuild. Frontend WS subscription not yet wired (polling works).
- Jade: investigating subagent tool/skill/MCP inheritance (blocker for bolt architecture).
- Moss: starting test pty-win on port 3650 for Playwright layout testing. Waiting for confirmation.
- Bolt subagent architecture drafted, pending jade's inheritance answer + scout's pattern validation.
- Detach/reattach ideated but not confirmed.
- Scout cost optimization: Rajan has fix vectors but hasn't acted.
