# Claude-KB

Domain knowledge and lessons learned for emcom.

**Note:** Build/deploy/server-ops knowledge has been migrated to the team wiki (`team-wiki/tooling/`). This file retains emcom-specific implementation details and process lessons not covered by the wiki.

## Lessons Learned

### 2026-03-10: Textual TabbedContent doesn't respect fr height constraints
TabbedContent's internal ContentSwitcher doesn't propagate height constraints to TabPane children. DataTable inside grows to full content height, pushing widgets below it off-screen. Fix: wrap TabbedContent + preview in a `Container` with `layout: grid; grid-size: 1 2; grid-rows: 3fr 2fr;`. Grid layout explicitly allocates row heights. Don't try `overflow: hidden` on Screen or `fr` units on TabbedContent directly — neither works reliably.

### 2026-03-10: Auto-focus DataTable on mount for immediate keyboard nav
Textual doesn't auto-focus the first focusable widget. Call `self.query_one("#table-inbox", DataTable).focus()` at end of `on_mount()`, and also after tab switches, so arrow keys work without clicking first.

### 2026-03-11: emcom server returns `active` as integer, not boolean
The `/who` endpoint returns `"active": 1` (SQLite integer), not `"active": true`. System.Text.Json's default bool deserializer rejects this. Fix: custom `BoolFromIntConverter` on the `Identity.Active` property that handles both `JsonTokenType.Number` and `JsonTokenType.True/False`.

### 2026-03-11: Skill Bash commands must be simple for permission auto-approve
Variable assignment + chaining (`EMCOM=$HOME/... && $EMCOM inbox && $EMCOM read ...`) triggers manual permission prompts because the permission model can't parse what's being executed. Fix: one simple command per Bash call, use the bare command name or literal path, and use parallel Bash tool calls for independent operations. Sequential dependencies (register→retry) must be separate calls in order.

### 2026-03-11: TUI preview must not trigger read side-effects
`client.read()` now auto-tags `pending` by default (for CLI workflow). But the TUI calls `read()` on every row highlight for preview, which would tag everything as `pending` just from scrolling. Fix: pass `tags=[]` explicitly in TUI preview and reply-fetch calls. Design: server is side-effect-free by default (`add_tags` param opt-in), clients choose what tags to apply. Python CLI passes `["pending"]` explicitly; C# CLI does the same.

### 2026-03-11: SQLite perf — connection reuse and N+1 elimination give 5-30x speedup
Thread-local connection reuse (`threading.local()`) eliminates per-call `sqlite3.connect()` + 3 PRAGMAs overhead — this alone gives ~7x on writes. For reads, the N+1 tag query pattern (1 query per email to fetch tags) was the main bottleneck. Fix: batch-fetch all tags in one `WHERE owner=? AND email_id IN (...)` query via `_attach_tags()` helper. Also: filter in SQL (WHERE clause with LIKE on JSON fields) instead of loading all rows and filtering in Python. Added `idx_tags_email_owner` index for the batch tag lookups.

### 2026-03-11: Linters/hooks can silently revert uncommitted edits
A pre-commit hook or linter modifying `db.py` reverted feature changes (new methods + modified `inbox()`) while I was still editing. Always re-read files after a linter runs and before building/testing. Don't assume your edits survived.

### 2026-03-11: Skill instructions shape agent behavior — avoid prescriptive ordering
Writing "every message you process follows this pattern: 1, 2, 3, 4" caused agents to process messages strictly sequentially. Changing to "any order is fine, batch your work, tag handled in parallel" let agents show good judgment (read all, batch process, parallel tag). Skill wording directly controls whether agents act rigidly or adaptively.

### 2026-03-11: Repo ownership — emcom is ours, skills repo is sage's
The emcom repo (`banana/emcom/`) is ours to commit and push directly. The skills repo (`~/.claude/skills/`) is managed by sage (fellow_scholars workspace) — send sage a message via emcom with what changed and let them handle commits there.

### 2026-04-14: PRINCIPLE — External quality bar
Two rules for all external-facing work: (1) Startup journeys must be super smooth — npm packages, setup scripts, binaries must work on first run across all target platforms. Test end-to-end on clean machines. First impressions matter; people drop out if setup fails. (2) External comments/PRs must have very high fact confirmation — verify claims against current code before posting on GitHub. Don't post based on stale analysis. For emcom/tracker: any binary shipping in fellow-agents must work on first run. The AppLocker issue was a good example of catching this in testing.

### 2026-04-10: RULE — Independent verification for community-facing content
All community-facing content (GitHub comments, PRs, docs, samples) must be independently verified before posting. Author prepares, a different agent tests/reviews. No self-verification. Two tiers: Code (PRs, samples) must compile+run and be tested by a different agent. Non-code (comments, recommendations) must be fact-checked by a different agent. Exception: low-risk responses (ack issues, asking for repro) are exempt. Scope: GitHub/public only — internal emcom/tracker/briefing excluded. Reference: team-manual.md commit `d83df24`.

### 2026-04-07: Team convention — tracker-based reminders
Reminders use the tracker with a `reminder` label: `tracker create --repo reminders --title 'Do X' --labels 'reminder'`. Sub-labels for scheduling: `standup` (daily), `once` (one-time), `weekly`. Query with `tracker list --label reminder`.

### 2026-03-25: Use `git commit -F -` with heredoc instead of `$(cat <<'EOF')`
`git commit -m "$(cat <<'EOF'...EOF)"` triggers a permission prompt every time due to the `$()` command substitution. Use `git commit -F - <<'EOF'` instead — `-F -` reads the message from stdin, heredoc provides it, no subshell needed. No more permission interruptions.

### 2026-04-24: Never run destructive curl tests on the production server
While shipping a guardrail for emcom purge, I ran a curl POST to /admin/purge on the running (old-code) server to verify the guardrail, forgetting that the guardrail was in source but not yet deployed. Wiped the live DB. Rule: ANY test of a destructive endpoint must target a dev instance (port 8801+) OR happen after the fix is deployed and verified via status check. Don't test the thing you're fixing against the thing you haven't fixed yet.

### 2026-04-17: CLI flag aliases prevent silent data loss
Rajan used `--message` instead of `--body` when sending emcom messages. The CLI silently ignored the unknown flag, read empty stdin (in non-redirected context, errored — but in redirected/piped contexts, sent empty body). Users and LLM agents naturally guess plausible flag names. Lesson: for critical data-carrying flags, add common aliases (--message/--msg/--text for --body). Also consider erroring on unrecognized flags rather than silently ignoring them — the `--help` system (commit `7f5ed7b`) already exists but unknown flags in send/reply still pass silently.
