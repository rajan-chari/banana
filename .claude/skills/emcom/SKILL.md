---
name: emcom
description: |
  Use this skill when the user wants to interact with the emcom email system.
  Triggers: check email, send message, who's online, register, inbox, reply,
  tag emails, search messages, list threads, any email-related request.
tools:
  - Bash
  - Read
  - Write
---

# emcom Skill

You are managing the emcom email system for the user. emcom is an email-metaphor messaging system for AI agent communication.

## Running Commands

Call the emcom binary directly — **no venv activation needed**:

```bash
C:/s/projects/work/teams/working/banana/emcom/.venv/Scripts/emcom <subcommand> [args]
```

The binary is a standalone exe. Do NOT use `source .../activate && emcom ...` — that produces noisy `uname` errors on Windows.

If a command fails with a connection error, start the server:
```bash
C:/s/projects/work/teams/working/banana/emcom/.venv/Scripts/emcom-server &
```
Wait 2 seconds, then retry. Do NOT run a health check preemptively — just run the command.

By default the CLI reads/writes `identity.json` in the current directory. Use `--identity <path>` (`-i`) to specify a different file.

## Command Dispatch

Map user intent to CLI commands:

| User Intent | Command |
|-------------|---------|
| "register", "join emcom" | `emcom register [--name NAME] [--description DESC] [--force]` |
| "unregister", "leave" | `emcom unregister` |
| "who's online", "who's here" | `emcom who` |
| "update my description" | `emcom update --description DESC` |
| "check email", "inbox" | `emcom inbox [--unread]` |
| "read email X" | `emcom read ID` |
| "send email to X" | `emcom send --to NAME [--cc NAME] --subject SUBJ --body BODY` |
| "reply to X" | `emcom reply ID --body BODY` |
| "show thread" | `emcom thread THREAD_ID` |
| "list threads" | `emcom threads` |
| "sent emails" | `emcom sent` |
| "all emails", "everything" | `emcom all` |
| "tag email X as Y" | `emcom tag ID TAG [TAG...]` |
| "remove tag Y from X" | `emcom untag ID TAG` |
| "find emails tagged Y" | `emcom tagged TAG` |
| "search for X" | `emcom search [--from NAME] [--to NAME] [--subject TEXT] [--tag TAG] [--body TEXT]` |
| "list available names" | `emcom names` |
| "add names to pool" | `emcom names --add NAME [NAME...]` |
| "purge", "clean out", "reset" | `emcom purge` |

## Notes

- Short IDs (first 8 chars) work for all ID arguments
- Server runs on port 8800 (env: `EMCOM_PORT`)
- Always use `127.0.0.1` not `localhost` (avoids Windows IPv6 DNS penalty)
- Data is stored in `~/.emcom/`
- `emcom all` shows unified sent+received view (`>>` = sent, `<<` = received)

## Output

Present the CLI output naturally to the user. For inbox/sent lists, the output is already formatted as a table. For individual emails, show the full header + body.
