# Briefing
Last updated: 2026-04-02 11:49

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
- 2026-04-02 11:47 — PR testing workflow + checkbox responsibility added to team-manual.md (3fb3950, 7299ef2). Agents message bolt for integration testing, update PR checkboxes.
- 2026-04-02 10:28 — Claude-KB.md expanded to 4 sections in team-manual.md (095864c). Sent to sam.
- 2026-04-02 10:03 — Context-independence reminder added to checkpoint/shutdown prompts by moss. Needs restart.
- 2026-04-01 13:36 — Unfocused pane border #505050, merged dashboard+diag, cost regex scraping (reverted hook), 3 cost bugs fixed.
- 2026-04-01 11:20 — Jade onboarded + status bar analysis complete. Findings in Claude-KB.md.

## Next Up
- Server restart needed by Rajan: cost regex, merged dashboard, unfocused border, hook revert, checkpoint prompt update. All TS changes requiring rebuild.
- Detach/reattach feature ideated (close pane but keep process alive, pty-cld as remote client). Rajan hasn't confirmed — waiting.
- Jade: available for next investigation (resume behavior, idle detection, hook system).
- pty-cld: force-idle subcommand (pending Rajan).
