# Briefing
Last updated: 2026-04-06 22:25

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
- 2026-04-06 22:24 — 3 tracker fixes shipped (a5e4a71): (1) history proxy endpoint was missing (GET /api/emcom-proxy/tracker/:id — caused "Failed to load"), (2) GitHub link fixed to microsoft/ org (was nicross/), (3) resizable columns with drag handles + localStorage persistence. TS change needs restart.
- 2026-04-06 21:25 — Tracker history timeline shipped (0028602): lazy-load history from /tracker/{id} on expand.
- 2026-04-06 18:29 — Tracker Rounds 1+2: font, text, rows, zebra, filter bar, GitHub links.
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
- Detach/reattach ideated but not confirmed. PID file cwd helps with session matching.
- Jade: available for next task. Resume behavior still unexplored.
- Scout cost optimization: Rajan has fix vectors but hasn't acted.
- emcom next round: message priority, read receipts, forward, broadcast/groups. Waiting on Rajan.
