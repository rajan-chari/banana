# Briefing
Last updated: 2026-04-17 15:15

## Current Focus
pty-win/emcom UI coordinator (assigned by Rajan 2026-03-31). Owns spec→delegate→test→report loop with moss. Rajan handles strategic work; milo handles tactical pty-win/emcom iteration. Current session: heavy fellow-agents template work per Rajan's specs, plus tracker feature and emcom bug discovery.

## Don't Forget
- Run `/rc-save` after each user request
- Use `git commit -F - <<'EOF'` heredoc pattern (not `$()` substitution)
- Chrome DevTools: use port 3601 (milo's session), NOT 3600 (Rajan's)
- emcom identity fallback: `emcom --identity c:/s/projects/work/teams/working/banana/identity.json <cmd>`
- Layered auto-save: commit after completing each tracker item
- emcom send uses `--body` not `--message` — `--message` silently drops content. frost adding alias (7652069).

## Recent
- 2026-04-17 15:14 — **pty-cld v0.2.1 perf optimizations (pine).** 3 changes ported from pty-win: output batching 16ms, deferred xterm parsing, async logging. Commit 706ffd6 on banana/main. pine asked for builds + fellow-agents update — replied that GHA release workflow handles it on tag push, flagged for Rajan.
- 2026-04-17 12:45 — **emcom --body vs --message PSA.** Rajan flagged that `--message` silently drops body content (explains empty bodies earlier today). frost adding `--message` as alias (7652069). Use `--body` until then. Added to Don't Forget.
- 2026-04-17 10:04 — **fellow-agents: trim default permissions (ef44de3).** Rajan requested tighter security. Trimmed all templates from broad wildcards (git, npm, python, node, ls) to just `emcom:*` + `tracker:*`. Setup script fallbacks updated. Rajan also removed SDK-specific guardrail from CLAUDE.md files.
- 2026-04-17 08:47 — **fellow-agents: template improvements — bundled 6-item spec (e0ddccd).** Per Rajan: (1) greet with capabilities, (2) ship settings.local.json with emcom pre-approved, (3) coordinator task tracking + onboarding, (4) startup protocol, (5) guardrails, (6) pty-win checkpoints + session resilience. All 3 CLAUDE.md files rewritten. Setup scripts updated to merge permissions with hooks.
- 2026-04-17 08:52 — **fellow-agents: clear ~/.emcom/ on fresh install (5645f4a).** Removes stale emcom database before starting fresh.
- 2026-04-17 08:30 — **fellow-agents: clear stale workspace config (00af997).** Step 4/7 rewrites identity.json server URL to match --EmcomPort. Fixes hardcoded :8800 port mismatch.
- 2026-04-16 22:45 — **Tracker feature: opened_by + responders fields (c4d9621).** Two new work item fields across Python server, router, and C# CLI. **Needs server restart + C# AOT rebuild to deploy.**
- 2026-04-15 13:50 — **ACTIVE BUG: pty-win injection not submitting.** `\r` not triggering Enter on Windows. Rajan testing via --debug dashboard.

## Next Up
- **Server restart needed by Rajan**: deploy opened_by/responders fields (rebuild emcom-server.exe + tracker.exe), hook-based idle detection, cost regex, merged dashboard, and more. Large TS backlog.
- **fellow-agents next release**: needs Rajan to push a tag to trigger GHA workflow. Will include pty-cld v0.2.1 perf optimizations.
- **Injection submit bug**: Rajan testing via --debug dashboard with different line endings.
- Frost's tracker WS endpoint ready but emcom-server.exe needs rebuild.
- Bolt subagent architecture validated. Waiting for scout's pattern to ship first.
