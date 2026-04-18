# Briefing
Last updated: 2026-04-18 12:01

## Current Focus
pty-win/emcom UI coordinator (assigned by Rajan 2026-03-31). Owns spec→delegate→test→report loop with moss. Rajan handles strategic work; milo handles tactical pty-win/emcom iteration.

## Don't Forget
- Run `/rc-save` after each user request
- Use `git commit -F - <<'EOF'` heredoc pattern (not `$()` substitution)
- Chrome DevTools: use port 3601 (milo's session), NOT 3600 (Rajan's)
- emcom identity fallback: `emcom --identity c:/s/projects/work/teams/working/banana/identity.json <cmd>`
- Layered auto-save: commit after completing each tracker item
- emcom send uses `--body` not `--message` — `--message` silently drops content. frost added alias (7652069).

## Recent
- 2026-04-17 15:19 — **pty-cld v0.2.1 integration Q&A with pine.** Pine asked about fellow-agents integration for pty-cld perf optimizations (706ffd6). Explained: GHA release workflow builds from banana/main, Rajan pushes release tag to trigger. No action needed from pine.
- 2026-04-17 15:14 — **pty-cld v0.2.1 perf optimizations (pine, 706ffd6).** 3 changes ported from pty-win: output batching 16ms, deferred xterm parsing (~10% CPU), async logging. 84/84 tests pass. Needs Rajan to push fellow-agents release tag to deploy.
- 2026-04-17 12:45 — **emcom --body vs --message PSA.** `--message` silently drops body content. frost adding alias (7652069).
- 2026-04-17 10:04 — **fellow-agents: trim default permissions (ef44de3).** Trimmed settings.local.json to just `emcom:*` + `tracker:*`. Rajan removed SDK-specific guardrail from CLAUDE.md templates.
- 2026-04-17 08:47 — **fellow-agents: template improvements — bundled 6-item spec (e0ddccd).** Greet with capabilities, settings.local.json with emcom pre-approved, coordinator task tracking + onboarding, startup protocol, guardrails, pty-win checkpoints. All 3 CLAUDE.md files rewritten. Setup scripts merge permissions with hooks.
- 2026-04-17 08:52 — **fellow-agents: clear ~/.emcom/ on fresh install (5645f4a).** Removes stale emcom database.
- 2026-04-17 08:30 — **fellow-agents: clear stale workspace config (00af997).** Step 4/7 rewrites identity.json server URL to match --EmcomPort.
- 2026-04-16 22:45 — **Tracker feature: opened_by + responders fields (c4d9621).** Two new work item fields across Python server, router, C# CLI. **Needs server restart + C# AOT rebuild to deploy.**

## Next Up
- **Server restart needed by Rajan**: deploy opened_by/responders fields (rebuild emcom-server.exe + tracker.exe), hook-based idle detection, cost regex, merged dashboard, and more. Large TS backlog.
- **fellow-agents next release**: Rajan needs to push tag to trigger GHA workflow. Will include pty-cld v0.2.1 perf optimizations.
- **Injection submit bug**: `\r` not triggering Enter on Windows. Rajan testing via --debug dashboard.
- Frost's tracker WS endpoint ready but emcom-server.exe needs rebuild.
- Bolt subagent architecture validated. Waiting for scout's pattern to ship first.
