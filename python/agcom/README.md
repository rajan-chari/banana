# agcom - Agent Communication Library

A multi-agent communication system with email-like messaging, threaded conversations, and address book management.

## Features

- **Email-style messaging** - Send/receive messages between agents
- **Threaded conversations** - Automatic threading with reply-to support
- **Address book** - Manage contacts with roles and metadata
- **Admin system** - Role-based permissions
- **SQLite persistence** - Local-first data storage
- **Console interface** - Full-featured CLI for message management

## Quick Start

### 1. Install

```bash
cd python
pip install -e .
```

### 2. Initialize

```bash
# One command to set everything up
agcom init --store mydb.db --me alice

# This will:
# - Create the database
# - Add you as admin
# - Save config for future commands
```

### 3. Start Messaging

```bash
# Send a message (simple syntax)
agcom send bob "Meeting tomorrow" "Can you meet at 2pm?"

# View inbox
agcom screen

# View a thread by number
agcom view 1

# Reply by number
agcom reply 1 "Yes, I'll be there!"
```

## Console Commands

### Configuration

Once you run `init`, config is saved to a platform-specific location and you don't need `--store` or `--me` flags anymore:
- **Windows:** `%APPDATA%\agcom\config.json`
- **macOS:** `~/Library/Application Support/agcom/config.json`
- **Linux:** `~/.config/agcom/config.json`

```bash
# Show current config
agcom config show

# Update config
agcom config set --store newdb.db --me bob

# Clear config
agcom config clear
```

### Messaging

**Send messages:**
```bash
# Simple syntax
agcom send alice "Subject" "Body text"

# Multiple recipients
agcom send alice bob charlie "Team update" "Meeting at 3pm"

# With tags
agcom send alice "Urgent" "Need help" --tags urgent priority

# Read body from file
agcom send alice "Report" --body-file report.txt

# Read body from stdin
agcom send alice "Report" --body @-
```

**View messages:**
```bash
# Inbox view with numbered threads
agcom screen

# List all threads
agcom threads

# View specific thread (by number or ID)
agcom view 1
agcom view 01KFV9RKBB4PXSQZPXE3W260NE

# Search messages
agcom search "keyword" --limit 10
```

**Reply to messages:**
```bash
# Reply by message number (from view command)
agcom reply 1 "Thanks for the update!"

# Reply to latest message in thread
agcom reply-thread 01KFV9RKBB4PXSQZPXE3W260NE --body "Sounds good"

# Reply with stdin
agcom reply 1 --body @-
```

### Address Book

**Add contacts:**
```bash
# Add regular user
agcom ab add bob --display-name "Bob Smith" --desc "Developer"

# Add admin user
agcom ab add alice --display-name "Alice Johnson" --admin

# Add with tags
agcom ab add charlie --tags team lead
```

**Manage contacts:**
```bash
# List all contacts
agcom ab list

# Show specific contact
agcom ab show alice

# Search contacts
agcom ab search "smith"

# Edit contact
agcom ab edit bob --display-name "Robert Smith"

# Promote to admin
agcom ab edit bob --admin

# Demote from admin
agcom ab edit bob --no-admin

# Deactivate contact
agcom ab deactivate charlie
```

**View history:**
```bash
# Show audit history for a contact
agcom ab history alice --limit 10
```

### Thread Management

```bash
# Archive thread
agcom thread-archive 01KFV9RKBB4PXSQZPXE3W260NE

# Unarchive thread
agcom thread-unarchive 01KFV9RKBB4PXSQZPXE3W260NE

# Set thread metadata
agcom thread-meta-set 01KFV9RKBB4PXSQZPXE3W260NE status "closed"

# Get thread metadata
agcom thread-meta-get 01KFV9RKBB4PXSQZPXE3W260NE status
```

## Interactive Mode

Start an interactive session:

```bash
agcom
```

Then use commands without the `agcom` prefix:

```
> screen
> view 1
> reply 1 "Thanks!"
> send bob "Quick message" "Hey there"
> exit
```

## Quick Workflow Example

```bash
# One-time setup
agcom init --store team.db --me alice --display-name "Alice (Team Lead)"

# Add team members
agcom ab add bob --display-name "Bob Smith" --admin
agcom ab add charlie --display-name "Charlie Lee"
agcom ab add eve --display-name "Eve Martinez"

# Send team announcement
agcom send bob charlie eve "Sprint Planning" "Let's meet Monday at 10am to plan the next sprint."

# View inbox
agcom screen
# Output:
# #   DATE        FROM    TO          SUBJECT
# 1   just now    Alice   3 people    Sprint Planning

# View thread
agcom view 1

# Reply
agcom reply 1 "I'll prepare the backlog review."

# Check thread again
agcom view 1
```

## Admin System

### Admin Privileges

Admins can:
- See all threads (not just their own)
- See all messages
- Access full audit history

### Managing Admins

```bash
# First user is admin by default
agcom init --store db.db --me alice

# Add another admin
agcom ab add bob --admin

# Promote existing user
agcom ab edit charlie --admin

# Demote from admin
agcom ab edit charlie --no-admin

# Check admin status
agcom ab show alice
# Output shows: [ADMIN] badge
```

### Non-Admin Setup

```bash
# Skip admin during init
agcom init --store db.db --me alice --no-admin

# Later, another admin can promote you
agcom ab add alice --admin
```

## Features

### Smart Formatting

- **Colors** - Syntax highlighting and visual hierarchy
- **Relative timestamps** - "just now", "2h ago", "3d ago"
- **Smart truncation** - Long text truncates at word boundaries
- **Text wrapping** - Long messages wrap properly
- **Unicode support** - Falls back to ASCII on limited terminals

### Numbered Indices

No more copying/pasting ULIDs:

```bash
agcom screen          # Shows numbered threads
agcom view 1          # View thread #1
agcom reply 1 "Hi!"   # Reply to message #1
```

Indices persist between commands for easy navigation.

### Cross-Platform

- Works on Windows, macOS, Linux
- Handles Unicode gracefully with ASCII fallbacks
- Respects `NO_COLOR` environment variable

## Environment Variables

```bash
# Set defaults via environment
export AGCOM_STORE=/path/to/db.db
export AGCOM_ME=alice

# Now commands work without flags
agcom screen
agcom send bob "Test" "Hello"

# Disable colors
export NO_COLOR=1
agcom screen
```

## Python API

Use agcom programmatically:

```python
from agcom import init, AgentIdentity

# Initialize session
identity = AgentIdentity(handle="alice")
session = init("mydb.db", identity)

# Send message
message = session.send(
    to_handles=["bob"],
    subject="Hello",
    body="How are you?",
    tags=["greeting"]
)

# List threads
threads = session.list_threads(limit=10)

# View messages
messages = session.list_messages(thread_id=threads[0].thread_id)

# Reply
reply = session.reply(
    message_id=messages[0].message_id,
    body="I'm good, thanks!"
)

# Address book
session.address_book_add(
    handle="charlie",
    display_name="Charlie Lee",
    tags=["team"]
)

# Close
session.conn.close()
```

## Tips

### Aliases

Add shell aliases for common commands:

```bash
# In ~/.bashrc or ~/.zshrc
alias inbox='agcom screen'
alias send='agcom send'
alias view='agcom view'
alias reply='agcom reply'
```

Then:
```bash
inbox              # View inbox
view 1             # View thread
reply 1 "Hi!"      # Quick reply
```

### Multiple Databases

Use different databases for different contexts:

```bash
# Personal
agcom --store ~/personal.db --me alice send bob "Hi"

# Work
agcom --store ~/work.db --me alice.johnson send team "Update"

# Or use config
agcom config set --store ~/work.db --me alice.johnson
```

### Piping

```bash
# Pipe message content
cat report.txt | agcom send bob "Daily report" --body @-

# Search and grep
agcom search "urgent" | grep "from: bob"

# Export thread
agcom view 1 > thread-backup.txt
```

## Troubleshooting

**Command not found:**
```bash
# Reinstall to register command
cd python
pip install -e .
```

**Database locked:**
```bash
# Close other sessions
# SQLite only allows one writer at a time
```

**Config not working:**
```bash
# Check config location
agcom config show

# Clear and recreate
agcom config clear
agcom init --store db.db --me alice
```

**Unicode issues on Windows:**
```bash
# agcom auto-detects and falls back to ASCII
# Or force ASCII by setting encoding
chcp 65001  # Enable UTF-8 in Windows terminal
```

## Development

Run tests:
```bash
cd python
pytest agcom/tests/ -v
```

Check types:
```bash
mypy agcom/
```

Format code:
```bash
black agcom/
ruff check agcom/
```

## Architecture

```
agcom/
├── __init__.py           # Public API
├── models.py             # Data models (Message, Thread, etc.)
├── session.py            # Session management
├── storage.py            # SQLite operations
├── validation.py         # Input validation
├── ulid_gen.py          # ULID generation
└── console/             # CLI interface
    ├── cli.py           # Argument parsing
    ├── commands.py      # Command handlers
    ├── config.py        # Config management
    ├── formatting.py    # Output formatting
    └── rendering.py     # View rendering
```

## License

MIT
