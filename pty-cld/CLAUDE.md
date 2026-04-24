# CLAUDE.md — pty-cld

## Startup

Before responding to the user's first message:

1. Read `README.md` for project overview, architecture, and setup.
2. Read working-state: `C:\s\projects\work\teams\working\working-state\pine\briefing.md` (current focus, don't-forget, next up) and `field-notes.md` (tactical gotchas).
3. Read the team-wiki pages you own: `C:\s\projects\work\teams\working\team-wiki\tooling\pty-cld\index.md` (then follow links to architecture.md, idle-detection.md, state-machine.md). Keep current via emcom to `librarian`.
4. Run `tracker queue pine` for in-flight work items (tracker CLI is source of truth, no local mirror).
5. Don't read md files from the parent directory unless the user requests it.
6. Greet the user covering:
   - Open TODOs or Don't Forget items from briefing
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

- **Independent verification required** for all community-facing content (GitHub comments, PRs, docs, samples). Author prepares, a different agent tests/reviews. No self-verification. Low-risk responses (ack, asking for repro) exempt.

## Where things go

- **Tactical gotchas, tool quirks, env workarounds** → `working-state/pine/field-notes.md`
- **Stable cross-cutting knowledge** → team-wiki via `librarian` (emcom)
- **Sensitive content** (credentials, HR, 1:1 notes) → private-wiki via `private-librarian` (emcom)
- **In-flight work items** → `tracker` CLI (no local mirror)
- **Session narrative, costs, Don't Forget** → `working-state/pine/briefing.md`
