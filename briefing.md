# Briefing
Last updated: 2026-04-13 15:20

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
- 2026-04-13 15:20 — E2E v0.0.3 clean test on dev-linux VM passed. All services start, health check 200, pty-win serves UI. Found register --force issue, fixed (1b5cd0f). Binary overwrite root cause confirmed by Rajan: skills junction + git-tracked binaries; blake untracking.
- 2026-04-10 14:13 — Independent verification rule finalized and broadcast to 18 agents. Added to team-manual.md (d83df24). All community-facing content (GitHub comments, PRs, docs) must be verified by a different agent before posting. Persisted in Claude-KB.md.
- 2026-04-09 22:04 — pty-win instance identification shipped (3 commits: d0fa117, 0043d6c, 97eef89). `--name` flag sets tab title + accent color + subtle background tint from name hash. Live name change via `POST /api/name` + clickable badge in sidebar header.
- 2026-04-08 07:07 — pwsh 7 now required for setup.ps1 (PS 5.1 incompatible). Version check + install instructions added (9524064). README updated. Moss fixed pty-win shell button (6f92b40): server normalizes pwsh→bash on Linux, new /api/config endpoint.
- 2026-04-08 04:15 — E2E test complete on both platforms. 5 fixes pushed, 10 findings logged. Both VMs deallocated, auto-shutdown at midnight ET.
- 2026-04-08 01:30 — Azure dev VMs provisioned (D2s_v4, rajan-rg, eastus). Tenant migration: BAMI1→teamssdk. Config updated, team notified.
- 2026-04-08 00:00 — fellow-agents release workflow shipped (461f96a), v1.0.0 published. 3 CI fixes (BANANA_PAT removal, npm ci→install, pty-win build).
- 2026-04-07 20:55 — fellow-agents one-click deploy: repo rebuilt (setup.ps1 + setup.sh), all 3 tracks complete (moss: prebuilt node-pty + CI, frost: emcom/tracker CI 3-platform, milo: install scripts + workspace templates). Binaries removed from repo — download from GitHub Releases. Tracker polish (column alignment, headers, zebra, density). Total cost sparkline. Inline sparklines in table.
- 2026-04-07 18:50 — Cost bar chart + sparklines shipped. Needs-input rule corrected (busy+0cb/s). Agents tab: cb/s column, compact, font match.
- 2026-04-07 18:12 — Needs-input rule fixed (796778c): busy + 0 cb/s = needs input. Font bumped (649e8d6). Agents compact + Ctrl+F5 v3 (341337b). cb/s column (a2516ef).
- 2026-04-07 17:34 — Agents compact (341337b): table width:auto + Ctrl+F5 fix v3 (refit on WS sessions message via rAF). cb/s column added (a2516ef).
- 2026-04-07 17:12 — Agents tab empty state fix (4803bbc) + Ctrl+F5 height fix v2 (116934b, retry loop) + Agents tab shipped (75ac23d, Feed/Tracker/Agents right panel). Cost history sampling by moss (60s, 24h, GET /api/cost-history).
- 2026-04-07 15:29 — Subagent inheritance confirmed by jade: MCP tools YES, skills via frontmatter, hooks YES, permissions inherited. No blockers for bolt. Saved to research/subagent-inheritance.md. Persistence rule RFC added to team-manual.md (5855e01).
- 2026-04-07 14:45 — Playwright MCP testing on port 3650+. Injection format cleanup by moss (timestamps, whitespace).
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
- **fellow-agents E2E test COMPLETE (both platforms)**. Both VMs deallocated. setup.sh and setup.ps1 work end-to-end: binaries download from GitHub Release, emcom-server starts, agents register, pty-win serves UI in browser.

**E2E Findings — Fixes pushed to fellow-agents:**
1. setup.sh not executable → fixed (0420a53)
2. Claude Code hard requirement → now optional warning on both scripts (ed5ed9c, efe730b)
3. npm link needs sudo on Linux → fixed (d8731d4)
4. setup.ps1 PS 5.1 parse error → nested hashtable replaced with JSON here-string (fc06605). Still needs pwsh 7 — PS 5.1 can't handle the JSON here-string either. **Action: document pwsh 7 as prerequisite or fix PS 5.1 compat.**

**E2E Findings — Open bugs for moss/frost:**
5. pty-win shell button hardcodes "pwsh" → can't open terminal on Linux (moss notified)
6. Default folder root is C:\ even when --root is set → cosmetic but confusing
7. setup.ps1 pty-win launch via npm link doesn't work → manual `node dist\index.js` works. Start-Process in setup.ps1 may need fixing.
8. Health check URL `/api/health` returns 401 (requires auth) → health check silently fails

**Infra findings (not fellow-agents bugs):**
9. Snap browsers (Firefox, Chromium) broken in xrdp → use Google Chrome .deb
10. xrdp on Ubuntu 24.04 needs: TLS key chmod, dbus-x11 pkg, startwm.sh → xfce4-session, high-DPI scaling hacks
- Bolt subagent architecture validated (jade confirmed inheritance). Waiting for scout's pattern to ship first.
- Server restart backlog: hook-based idle detection, injection timestamps, cost history sampling, many TS changes.
- Detach/reattach ideated but not confirmed.
