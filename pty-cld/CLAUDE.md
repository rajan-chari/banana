# CLAUDE.md — pty-cld

## Startup

Before responding to the user's first message:

1. Read `README.md` for project overview, architecture, and setup.
2. Read `Claude-KB.md` for lessons learned and domain knowledge.
3. Read the team-wiki pages you own: `C:\s\projects\work\teams\working\team-wiki\tooling\pty-cld\index.md` (then follow links to architecture.md, idle-detection.md, state-machine.md). These contain shared knowledge about pty-cld's design — keep them current via emcom to the `librarian` agent.
4. Read `session-context.md` if it exists — ephemeral state from the previous session.
5. Look for a `*-private.md` file matching the user's name (e.g., `Rajan-private.md`). If found, read it for personal TODOs and preferences.
6. Don't read md files from the parent directory unless the user requests it.
7. Greet the user covering:
   - Open TODOs or reminders from private notes
   - Quick-start commands (see below)

### Common scenarios

- **Build** — `npm run build`
- **Setup hook** — `pty-cld setup`
- **Run CLI** — `cd /project/with/identity.json && pty-cld`
- **Run with args** — `pty-cld --resume <session-id>`
- **Watch build** — `npm run dev`
- **Tail logs** — `tail -f pty-cld.log`

## Claude-specific notes

Things README.md doesn't cover that you need to know:

### System prompt injection

Each Claude spawned by pty-cld gets `--append-system-prompt` telling it not to use `/loop`, `CronCreate`, or `emcom-monitor` for inbox polling — pty-cld handles it externally. This prevents double-polling when a project's CLAUDE.md instructs Claude to start emcom monitoring.

### Status

- **Working**: CLI mode, emcom polling, idle hook injection, screen-aware idle detection, checkpoint timers, dynamic emcom attach, multi-instance, system prompt suppression, `pty-cld setup`

## Guardrails

- **Independent verification required** for all community-facing content (GitHub comments, PRs, docs, samples). Author prepares, a different agent tests/reviews. No self-verification. Low-risk responses (ack, asking for repro) exempt. Details in `Claude-KB.md` under Guardrails.

## Lessons Learned

This workspace is a **learning system**. `Claude-KB.md` contains a `## Lessons Learned` section that persists knowledge across sessions.

### When to add an entry

Proactively add a lesson whenever you encounter:

- **Unexpected behavior** — an API, tool, or workflow didn't work as expected and you found the cause
- **Workarounds** — a problem required a non-obvious solution that future sessions should know about
- **User preferences** — the user corrects your approach or states a preference
- **Process discoveries** — you learn how something actually works vs. how it's documented
- **Pitfalls** — something that wasted time and could be avoided next time

### How to add an entry

Append to the `## Lessons Learned` section in `Claude-KB.md` using this format:

```markdown
### YYYY-MM-DD: Short descriptive title
Description of what happened and what to do differently. Keep it concise and actionable.
```

### Guidelines

- Write for your future self — assume no prior context from this session
- Be specific: include tool names, flag names, error messages, or exact steps
- Don't duplicate existing entries — read the section first
- One entry per distinct lesson; don't bundle unrelated things
- Ask the user before adding if you're unsure whether something qualifies
