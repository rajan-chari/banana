# Briefing
Last updated: 2026-04-17 10:49

## Current Focus
pty-win/emcom UI coordinator (assigned by Rajan 2026-03-31). Owns spec→delegate→test→report loop with moss. Rajan handles strategic work; milo handles tactical pty-win/emcom iteration. Current session: heavy fellow-agents template work per Rajan's specs.

## Don't Forget
- Run `/rc-save` after each user request
- Use `git commit -F - <<'EOF'` heredoc pattern (not `$()` substitution)
- Chrome DevTools: use port 3601 (milo's session), NOT 3600 (Rajan's)
- emcom identity fallback: `emcom --identity c:/s/projects/work/teams/working/banana/identity.json <cmd>`
- Layered auto-save: commit after completing each tracker item

## Recent
- 2026-04-17 10:04 — **fellow-agents: trim default permissions.** Rajan requested tighter security on shipped settings.local.json. Trimmed all templates from broad wildcards (git, npm, python, node, ls) to just `emcom:*` + `tracker:*`. Setup script fallbacks updated to match. Rajan also edited CLAUDE.md files to remove SDK-specific guardrail ("never push to SDK repos") since these are general-purpose templates. Committed together (ef44de3).
- 2026-04-17 08:47 — **fellow-agents: template improvements — bundled spec (6 items).** Per Rajan's spec: (1) greet with capabilities, (2) ship settings.local.json with emcom pre-approved, (3) coordinator task tracking + onboarding, (4) startup protocol (register/read briefing/KB/tracker), (5) guardrails, (6) pty-win checkpoints + session resilience. All 3 CLAUDE.md files rewritten, .claude/settings.local.json created, setup scripts updated to merge permissions with hooks. .gitignore updated to track settings.local.json in templates. (e0ddccd)
- 2026-04-17 08:52 — **fellow-agents: clear ~/.emcom/ on fresh install.** Added to step 4: removes stale emcom database before starting fresh. (5645f4a)
- 2026-04-17 08:30 — **fellow-agents: clear stale workspace config on fresh install.** Added step 4/7 to both setup.ps1 and setup.sh: rewrites `identity.json` server URL to match `--EmcomPort` parameter. Fixes hardcoded `:8800` port mismatch. Steps renumbered to 7 total. (00af997)
- 2026-04-16 22:45 — **Tracker feature: opened_by + responders fields.** Two new fields on work items per Rajan. `opened_by` (TEXT, who reported), `responders` (JSON array of agents who engaged). Python server (db.py schema + migration + create/update + `add_responder`), router (Pydantic models), C# CLI (Models + Program flags + Formatting view). 100 Python tests pass, C# builds clean. **Needs server restart + C# AOT rebuild to deploy.** (c4d9621)
- 2026-04-15 13:50 — **ACTIVE BUG: pty-win injection not submitting.** `\r` not triggering Enter on Windows after Linux newline fix chain. Rajan testing via --debug dashboard.
- 2026-04-15 03:01 — pty-win bug fixes + fellow-agents v0.0.4 release green.
- 2026-04-14 — fellow-agents npm package, tracker panel polish, Docker E2E test.

## Next Up
- **Server restart needed by Rajan**: deploy opened_by/responders fields (rebuild emcom-server.exe + tracker.exe), hook-based idle detection, cost regex, merged dashboard, pane separation, drag-and-drop, cost in checkpoints, last-active column, double-Ctrl+C fix. Large TS backlog.
- **Injection submit bug**: Rajan testing via --debug dashboard with different line endings.
- Tracker panel complete (2 rounds). Milo now implementing frontend directly (Rajan approved). Moss on test coverage.
- Frost's tracker WS endpoint ready but emcom-server.exe needs rebuild. Frontend WS subscription not yet wired (polling works).
- **fellow-agents setup complete** — E2E tested both platforms, templates improved, permissions trimmed, stale config cleanup added.
- Bolt subagent architecture validated (jade confirmed inheritance). Waiting for scout's pattern to ship first.
