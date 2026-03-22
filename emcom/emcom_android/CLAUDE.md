# emcom_android

Android client for the emcom messaging system. Connects to a remote emcom server (typically via DevTunnel) to send/receive messages using the same REST API as the Python CLI and TUI.

## Startup

Before responding to the user's first message:

1. **Read knowledge files**
   - Read `Claude-KB.md` in this directory (domain knowledge, lessons learned). Create it if missing with a `## Lessons Learned` heading.
   - Don't read md files from the parent directory unless the user requests it.
   - Look for a `*-private.md` file matching the user's name (e.g., `Rajan-private.md`). If one exists, read it — it contains personal TODOs, preferences, and reminders. If it references a durable location, read and update that too.

2. **Read session context**
   - Read `session-context.md` if it exists. It contains ephemeral state from the previous session: what was in flight, what to pick up, any "don't forget" items.
   - Surface relevant items in the greeting.

3. **Greet the user** — Surface any open TODOs/reminders from private notes, then offer common scenarios:
   - **Start emcom server** — `source ../emcom/.venv/Scripts/activate && emcom-server` (parent project)
   - **Start DevTunnel** — `devtunnel port create -p 8800` to expose the server
   - **Build the app** — `./gradlew assembleDebug`
   - **Run on device/emulator** — `./gradlew installDebug`
   - **Run tests** — `./gradlew test`
   - **Check server connectivity** — `curl <tunnel-url>/health`

## emcom API Reference

The Android app talks to these REST endpoints (all JSON, auth via `X-Emcom-Name` header):

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Register identity (`{name, description}`) |
| GET | `/who` | List registered identities |
| POST | `/email` | Send a message (`{to, subject, body, cc?, in_reply_to?}`) |
| GET | `/email/inbox` | Get inbox (query: `?unread_only=true&limit=N`) |
| GET | `/email/sent` | Get sent messages |
| GET | `/email/{id}` | Read a specific email (removes `unread` tag) |
| GET | `/threads` | List threads |
| GET | `/threads/{id}` | Get thread messages |
| POST | `/email/{id}/tags` | Add tags |
| DELETE | `/email/{id}/tags/{tag}` | Remove a tag |
| GET | `/search` | Search emails (query: `?q=term`) |
| GET | `/health` | Health check (no auth needed) |

## Lessons Learned

This workspace is a **learning system**. Claude-KB.md contains a `## Lessons Learned` section that persists knowledge across sessions.

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
