# Briefing
Last updated: 2026-04-24 09:23

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
- 2026-04-24 00:41 — **working-state migration plan v2 locked.** Rajan synthesized 22 RFC replies. All wikis + working-state become private repos (artifacts exported on demand). Phase 1 canaries: spark.net, spark-ts, librarian, amber, pine, scout. I'm Phase 2 — waiting for ping. Layout: briefing.md + briefing-archive.md + notes.md + field-notes.md + optional decisions.md + research/. Soft guidance: keep host-repo commit messages procedural, session narratives in working-state commits. My migration items when called: banana/emcom/briefing.md + Claude-KB.md + research/.
- 2026-04-23 23:18 — **RFC: working-state repo.** Rajan proposing new sibling repo `working-state/` (not shared) for per-agent briefing/notes/research, trimming fellow-scholars to team contract only. Tracker CLI becomes sole source of truth (drop tracker.md mirrors). Claude-KB splits into wiki/field-notes/decisions. Answered all 6 questions: split makes sense, 'field-notes' name lands, explicit path mount (symlinks fragile on Windows), can drop tracker.md today, flagged settings.local.json as additional capability leak. Awaiting Rajan's synthesis.
- 2026-04-20 20:23 — **Wiki cleanup complete.** Verified 3 wiki articles (setup, releases, tracker) are accurate. Removed 2 duplicate entries from Claude-KB.md (tracker CLI ref + reminder convention). CLAUDE.md updated externally to read wiki on startup. Claude-KB.md now has migration note. Team-onboarding rules updated with wiki contribution guidelines (librarian for shared, private-librarian for sensitive).
- 2026-04-20 19:02 — **Team wiki live.** Rajan shipped shared knowledge wiki at `c:\s\projects\work\teams\working\team-wiki\`. Single-writer model: librarian agent receives contributions via emcom, eliminates merge conflicts. Seeded 3 articles: fellow-agents setup (7-step flow), release workflow (GHA tag-triggered), tracker CLI (commands + new fields). All confirmed by librarian.
- 2026-04-20 18:11 — **Wiki RFC feedback.** Rajan proposed shared wiki replacing per-agent Claude-KB.md. Provided feedback on merge conflicts, staleness, discovery. Rajan's addendum: librarian agent as single writer — solves all contention concerns.
- 2026-04-20 15:17 — **forge onboarded.** New agent owning fellow-agents workspace. Sent comprehensive handoff: E2E status, areas to pick up (NPM_TOKEN, release tags, PS 5.1 compat), codebase conventions.
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
