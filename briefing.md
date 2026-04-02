# Briefing
Last updated: 2026-04-02 13:10

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
- 2026-04-02 13:09 — PID file idle detection blocked: BG_SESSIONS compile-time flag is OFF in current builds. PID files exist (pid, cwd, sessionId) but lack status/waitingFor. Upgrade path: when Anthropic ships BG_SESSIONS, check for status field and switch to fs.watch. Heuristics work fine until then.
- 2026-04-02 12:49 — Jade delivered full PID file schema + idle detection internals. sessionStatus is explicit state machine (idle/busy/waiting) in REPL.tsx. Notification hook fires 60s after query completion. Idle-return dialog at 75min+100K tokens.
- 2026-04-02 12:30 — Restructured Claude-KB.md to 4 sections. Added CLAUDE.md debugging rule. Sent jade idle detection task.
- 2026-04-02 11:47 — PR testing workflow + checkbox responsibility in team-manual.md (3fb3950, 7299ef2).
- 2026-04-02 10:28 — Claude-KB.md 4-section format in team-manual.md (095864c). Organic rollout (no broadcast).
- 2026-04-01 13:36 — Unfocused pane border #505050, merged dashboard+diag, cost regex scraping (reverted hook), 3 cost bugs fixed.
- 2026-04-01 11:20 — Jade onboarded + status bar analysis complete. Findings in Claude-KB.md.

## Next Up
- Server restart needed by Rajan: cost regex, merged dashboard, unfocused border, hook revert, checkpoint prompt update. All TS changes requiring rebuild.
- Detach/reattach feature ideated (close pane but keep process alive, pty-cld as remote client). PID file cwd helps with session matching. Rajan hasn't confirmed — waiting.
- Jade: available for next investigation. Resume behavior is the remaining unexplored area.
- Session resilience rollout: organic via team-manual. Rajan said no broadcast.
- pty-cld: force-idle subcommand (pending Rajan).
