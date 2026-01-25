# agcom Quick Start

Get started with agcom in 60 seconds.

## Install

```bash
cd python
pip install -e .
```

## Setup (30 seconds)

```bash
# Initialize database and config
agcom init --store mydb.db --me alice

# Add contacts
agcom ab add bob --display-name "Bob Smith"
agcom ab add charlie --display-name "Charlie Lee" --admin
```

## Send & View (30 seconds)

```bash
# Send a message
agcom send bob "Quick question" "Can you review my PR?"

# View inbox
agcom screen

# View thread #1
agcom view 1

# Reply to message #1
agcom reply 1 "Sure, I'll take a look!"
```

## That's it!

You're now messaging. Here are more things you can do:

### Common Commands

```bash
# Group message
agcom send bob charlie "Team meeting" "Tomorrow at 10am"

# Search
agcom search "urgent"

# List all threads
agcom threads

# Check config
agcom config show

# Interactive mode
agcom
> screen
> view 1
> exit
```

### Tips

**No more flags needed:**
- Init saves config automatically
- Use numbers instead of IDs
- Simple send syntax

**Before:**
```bash
agcom --store db.db --me alice send bob --subject "Hi" --body "Hello"
```

**After:**
```bash
agcom send bob "Hi" "Hello"
```

### Getting Help

```bash
# Show all commands
agcom help

# Command-specific help
agcom init --help
agcom send --help
agcom ab --help
```

### Next Steps

- Read [README.md](./README.md) for full documentation
- Check [CHANGELOG.md](./CHANGELOG.md) for what's new
- Try interactive mode: `agcom`

## Cheat Sheet

| Task | Command |
|------|---------|
| Setup | `agcom init --store db.db --me alice` |
| Send | `agcom send bob "Subject" "Body"` |
| Inbox | `agcom screen` |
| View thread | `agcom view 1` |
| Reply | `agcom reply 1 "Message"` |
| Add contact | `agcom ab add bob` |
| List contacts | `agcom ab list` |
| Show config | `agcom config show` |
| Search | `agcom search "keyword"` |
| Help | `agcom help` |
