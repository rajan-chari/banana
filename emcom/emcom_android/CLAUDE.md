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
   - **Build the app** — see Build section below
   - **Start DevTunnel** — `devtunnel host -p 8800 --allow-anonymous`
   - **Connect phone** — pair via WiFi ADB (see Device Connection below)
   - **Install on device** — `adb -s <device> install -r app/build/outputs/apk/debug/app-debug.apk`
   - **Check server connectivity** — `curl <tunnel-url>/health`

## Environment

These must be set for every Bash call that runs Gradle or adb:

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-17.0.18.8-hotspot"
export ANDROID_HOME="/c/Users/ranaras/Android/Sdk"
```

- **JDK 17**: `/c/Program Files/Microsoft/jdk-17.0.18.8-hotspot` (system default is JDK 8 — won't work)
- **Android SDK**: `/c/Users/ranaras/Android/Sdk` (platform 35, build-tools 35.0.0)
- **`local.properties`**: already has `sdk.dir` for Gradle, but `JAVA_HOME` must be set in shell
- **adb**: `$ANDROID_HOME/platform-tools/adb.exe`

## Build

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-17.0.18.8-hotspot"
export ANDROID_HOME="/c/Users/ranaras/Android/Sdk"
./gradlew.bat -p . assembleDebug
```

APK output: `app/build/outputs/apk/debug/app-debug.apk`

## Device Connection

WiFi ADB (Android 11+). Port changes every session — user must provide it.

1. Phone: **Settings > Developer Options > Wireless debugging > Pair device with pairing code**
2. **Disable VPN first** — VPN IPs (e.g., `100.67.x.x`) block ADB pairing
3. `adb pair <phone-wifi-ip>:<pairing-port> <code>`
4. `adb connect <phone-wifi-ip>:<connect-port>` (different port shown on main wireless debugging screen)
5. `adb -s <phone-wifi-ip>:<connect-port> install -r app/build/outputs/apk/debug/app-debug.apk`

Phone WiFi IP: `10.0.0.78` (same subnet as PC `10.0.0.232`)

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
