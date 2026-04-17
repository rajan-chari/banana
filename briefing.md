# Briefing
Last updated: 2026-04-17 08:32

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
- 2026-04-17 08:30 — **fellow-agents: clear stale workspace config on fresh install.** Added step 4/7 to both setup.ps1 and setup.sh: removes old `.claude/` dirs from workspace templates + rewrites `identity.json` server URL to match `--EmcomPort` parameter. Fixes hardcoded `:8800` port mismatch. Steps renumbered to 7 total.
- 2026-04-16 22:45 — **Tracker feature: opened_by + responders fields.** Two new fields on work items per Rajan. `opened_by` (TEXT, who reported — distinct from `created_by`/`github_author`), `responders` (JSON array of agents who engaged). Implemented across Python server (db.py schema + migration + create/update + `add_responder`), router (Pydantic models), C# CLI (Models + Program flags `--opened-by`/`--responders`/`--add-responder` + Formatting view display). 100 Python tests pass, C# builds clean. **Needs server restart + C# AOT rebuild to deploy.**
- 2026-04-15 13:50 — **ACTIVE BUG: pty-win injection not submitting.** Injected prompts appear in Claude Code's input area but don't get processed until user manually hits Enter. Rajan confirmed issue started after the Linux newline fix chain (dbfeaeb→9631593→587be80). Current code sends `\r` (SUBMIT) at end of single-line prompts — `\r` should be Enter on Windows but isn't triggering submission. dist/ is up to date. Next step: Rajan starting pty-win with `--debug` flag to test different line endings live (\r, \n, \r\n) via the debug dashboard REST API.
- 2026-04-15 03:01 — pty-win bug fixes: Linux injection submit (\r→\n, dbfeaeb), double-paste fix (paste guard, f3b9519), tracker hover stronger + stale-row hover (54656d5, 6a454b0), tracker row numbers + ref split + active color-coding (e1aa02e, 0655203). fellow-agents: chmod +x on Linux binaries (982c258), v0.0.4 release green (ubuntu-22.04 pin). npm shims for all binaries (fadc2a0). CLI UX polish (4616a7b). pine coordinating pty-cld integration.
- 2026-04-14 15:01 — fellow-agents npm package: shims, CLI UX, pty-cld coordination, external quality bar principle.
- 2026-04-14 03:51 — fellow-agents npm package initial implementation (9f1cbf6). 3 bugs fixed (4e03a67). AppLocker fix (eda9878). npm-publish job + README (dcd8e19). v0.0.4 release green.
- 2026-04-14 01:51 — Tracker panel polish (3 commits: 11768e5, 14e69ab, 904f0a1). Removed "In Status" column. Panel width 300→380px. Age+Active center-aligned and adjacent. Brighter font colors. Tested with Playwright. Needs server restart.
- 2026-04-13 16:00 — Docker E2E test added (f0c5980): Dockerfile.test + test-e2e.sh (7 checks) + GHA workflow (e2e-test.yml, runs on release + manual).
- 2026-04-13 15:20 — E2E v0.0.3 clean test on dev-linux VM passed. All services start, health check 200, pty-win serves UI. Found register --force issue, fixed (1b5cd0f). dev-linux deallocated.
- 2026-04-10 14:13 — Independent verification rule finalized and broadcast to 18 agents. Added to team-manual.md (d83df24). All community-facing content (GitHub comments, PRs, docs) must be verified by a different agent before posting. Persisted in Claude-KB.md.

## Next Up
- **Server restart needed by Rajan**: deploy opened_by/responders fields (rebuild emcom-server.exe + tracker.exe), hook-based idle detection, cost regex, merged dashboard, pane separation, drag-and-drop, cost in checkpoints, last-active column, double-Ctrl+C fix. Large TS backlog.
- **Injection submit bug**: Rajan testing via --debug dashboard with different line endings.
- Tracker panel complete (2 rounds). Milo now implementing frontend directly (Rajan approved). Moss on test coverage.
- Frost's tracker WS endpoint ready but emcom-server.exe needs rebuild. Frontend WS subscription not yet wired (polling works).
- **fellow-agents E2E test COMPLETE (both platforms)**. Both VMs deallocated. setup.sh and setup.ps1 work end-to-end.
- Bolt subagent architecture validated (jade confirmed inheritance). Waiting for scout's pattern to ship first.
- Detach/reattach ideated but not confirmed.
