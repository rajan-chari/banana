# AgCom Console - Guided Tour 🚀

## Overview
A friendly walkthrough of the AgCom Console application to see how it works. This tour explores all key features interactively with real examples and results.

## Prerequisites
- Python 3.10+
- AgCom library installed (`pip install -e .`)
- Terminal or command prompt
- Fresh database file (we'll create one during the tour)

---

## Tour Stops

### 🏁 Stop 1: Installation Check ✅

**What to verify:**
```bash
# Verify Python version
python --version

# Check agcom installation
python -m agcom.console --help
```

**Expected output:**
```
usage: agcom.console [-h] --store STORE --me ME [--watch] [command] ...

AgCom Console - Multi-agent communication system
...
```

**Result:**
```
[To be filled during tour]
```

---

### 🗄️ Stop 2: Initialize Database

Create a fresh database for our tour.

**Command:**
```bash
python -m agcom.console --store tour.db --me alice init
```

**What happens:**
- Creates `tour.db` file in current directory
- Initializes SQLite schema with tables (threads, messages, address_book, audit_log)
- Enables WAL mode for concurrent access
- Sets up indexes for performance

**Expected output:**
```
Database initialized successfully at tour.db
```

**Result:**
```
[To be filled during tour]
```

---

### 👋 Stop 3: Interactive Mode Basics

Start the console in interactive mode as Alice.

**Command:**
```bash
python -m agcom.console --store tour.db --me alice
```

**What happens:**
- Opens interactive prompt
- You're now Alice (the authenticated agent)
- All commands run as Alice
- Type `help` to see available commands

**Expected output:**
```
AgCom Console - Connected as alice
Type 'help' for commands, 'exit' to quit

>
```

**Try these basic commands:**
```bash
> help
> screen
```

**Expected screen output:**
```
INBOX
================================================================================

No threads yet. Send a message to get started!
```

**Note:** When you have threads, the screen displays them in a table with these columns:
- **THREAD ID** - Unique identifier for the thread
- **DATE** - When the most recent message was sent (format: MM/DD/YY HH:MM)
- **FROM** - Who started the conversation
- **TO** - Who received the message (or "X recipients" for groups)
- **SUBJECT** - Thread subject line

**Result:**
```
[To be filled during tour]
```

---

### 📇 Stop 4: Build Your Address Book

Add some contacts before sending messages.

**In the interactive prompt, run:**

```bash
> ab add bob --display-name "Bob Wilson" --desc "Python Developer"
```

**Expected:**
```
Added bob to address book
```

**Add more contacts:**
```bash
> ab add charlie --display-name "Charlie Chen" --desc "Backend Engineer" --tags python backend senior

> ab add dave --display-name "Dave Martinez" --desc "Frontend Developer" --tags javascript react frontend
```

**List your contacts:**
```bash
> ab list
```

**Expected output:**
```
ADDRESS BOOK
================================================================================
bob          | Bob Wilson          | Python Developer
charlie      | Charlie Chen        | Backend Engineer | Tags: python, backend, senior
dave         | Dave Martinez       | Frontend Developer | Tags: javascript, react, frontend

Total: 3 contacts
```

**View detailed contact info:**
```bash
> ab show charlie
```

**Expected:**
```
CONTACT: charlie
================================================================================
Handle:       charlie
Display Name: Charlie Chen
Description:  Backend Engineer
Tags:         python, backend, senior
Status:       Active
Created:      2026-01-24 10:30:00
Updated:      2026-01-24 10:30:00
Updated By:   alice
Version:      1
```

**Search contacts:**
```bash
> ab search backend
```

**Result:**
```
[To be filled during tour]
```

---

### 📨 Stop 5: Send Your First Message

Send a message to Bob.

**Command:**
```bash
> send bob --subject "Welcome to AgCom!" --body "Hi Bob, this is Alice. Let me show you how AgCom works!"
```

**Expected output:**
```
Message sent successfully!
Thread ID: 01HZXY...
Message ID: 01HZXZ...
```

**What happened:**
- Created a new thread with subject "Welcome to AgCom!"
- Alice is the sender
- Bob is the recipient
- Generated unique ULID identifiers for thread and message

**Send another message:**
```bash
> send charlie --subject "Project Discussion" --body "Charlie, can we discuss the new Python project tomorrow?" --tags urgent project
```

**Save the thread IDs for later:**
```
Thread 1 (Bob): [To be filled]
Thread 2 (Charlie): [To be filled]
```

**Result:**
```
[To be filled during tour]
```

---

### 📥 Stop 6: View Your Inbox

Check what messages you have.

**Command:**
```bash
> screen
```

**Expected output:**
```
INBOX
================================================================================

Thread ID         Created              From     Subject
--------------------------------------------------------------------------------
01HZXY...        2026-01-24 10:35:00   alice    Project Discussion
01HZXZ...        2026-01-24 10:34:00   alice    Welcome to AgCom!

Total: 2 threads
```

**What you see:**
- Threads sorted by most recent activity
- Thread ID (first few characters)
- Creation timestamp
- Sender handle
- Subject line

**Result:**
```
[To be filled during tour]
```

---

### 🧵 Stop 7: View a Thread

Look at the full conversation in a thread.

**Command (use your Thread ID from Bob message):**
```bash
> view 01HZXZ...
```

**Expected output:**
```
THREAD: Welcome to AgCom!
ID: 01HZXZ...
Participants: alice, bob
Created: 2026-01-24 10:34:00
Last Activity: 2026-01-24 10:34:00
================================================================================

Message ID: 01HZXZ...
From: alice
To: bob
Date: 2026-01-24 10:34:00

Hi Bob, this is Alice. Let me show you how AgCom works!

--------------------------------------------------------------------------------
```

**List all threads:**
```bash
> threads
```

**Result:**
```
[To be filled during tour]
```

---

### 💬 Stop 8: Open Another Terminal as Bob

Now let's simulate Bob receiving and replying to messages.

**In a NEW terminal window:**
```bash
python -m agcom.console --store tour.db --me bob
```

**Bob's prompt:**
```
AgCom Console - Connected as bob
Type 'help' for commands, 'exit' to quit

>
```

**Bob checks his inbox:**
```bash
> screen
```

**Expected output:**
```
INBOX
================================================================================

Thread ID         Created              From     Subject
--------------------------------------------------------------------------------
01HZXZ...        2026-01-24 10:34:00   alice    Welcome to AgCom!

Total: 1 thread
```

**Bob views the thread:**
```bash
> view 01HZXZ...
```

**Result:**
```
[To be filled during tour]
```

---

### ↩️ Stop 9: Bob Replies to Alice

Bob sends a reply in the same thread.

**In Bob's terminal:**
```bash
> reply 01HZXZ... --body "Hi Alice! This is great! Thanks for showing me AgCom." --tags reply
```

**Expected output:**
```
Reply sent successfully!
Message ID: 01HZXZ... (new ID)
```

**What happened:**
- Reply added to the same thread
- Subject is automatically "Re: Welcome to AgCom!"
- `in_reply_to` field links to Alice's message
- Thread's `last_activity_at` is updated

**Bob views the updated thread:**
```bash
> view 01HZXZ...
```

**Expected output:**
```
THREAD: Welcome to AgCom!
ID: 01HZXZ...
Participants: alice, bob
Created: 2026-01-24 10:34:00
Last Activity: 2026-01-24 10:40:00
================================================================================

Message ID: 01HZXZ...
From: alice
To: bob
Date: 2026-01-24 10:34:00

Hi Bob, this is Alice. Let me show you how AgCom works!

--------------------------------------------------------------------------------

Message ID: 01HZXZ... (new)
From: bob
To: alice
Date: 2026-01-24 10:40:00
In Reply To: 01HZXZ... (alice's message)
Tags: reply

Hi Alice! This is great! Thanks for showing me AgCom.

--------------------------------------------------------------------------------
```

**Result:**
```
[To be filled during tour]
```

---

### 🔄 Stop 10: Alice Sees the Reply

Switch back to Alice's terminal.

**In Alice's terminal:**
```bash
> screen
```

**Expected output:**
```
INBOX
================================================================================

Thread ID         Created              From     Subject
--------------------------------------------------------------------------------
01HZXZ...        2026-01-24 10:34:00   bob      Re: Welcome to AgCom!
01HZXY...        2026-01-24 10:35:00   alice    Project Discussion

Total: 2 threads
```

**Notice:**
- Bob's thread is now at the top (most recent activity)
- Sender shows "bob" (last person to write)
- Subject shows "Re: ..."

**Alice views the conversation:**
```bash
> view 01HZXZ...
```

**Alice replies back:**
```bash
> reply-thread 01HZXZ... --body "Glad you like it! Let me know if you have questions."
```

**What's the difference?**
- `reply <message-id>` - Reply to a specific message
- `reply-thread <thread-id>` - Reply to the latest message in thread

**Result:**
```
[To be filled during tour]
```

---

### 🔍 Stop 11: Search Messages

Find messages by content.

**In Alice's terminal:**

**Search in subject lines:**
```bash
> search "welcome" --in-subject
```

**Expected output:**
```
SEARCH RESULTS: "welcome"
================================================================================

Thread: 01HZXZ... | Welcome to AgCom!
Message: 01HZXZ... | alice → bob | 2026-01-24 10:34:00
Subject: Welcome to AgCom!
Body: Hi Bob, this is Alice. Let me show you how AgCom works!

Total: 1 result
```

**Search in message bodies:**
```bash
> search "Python" --in-body
```

**Search everywhere:**
```bash
> search "AgCom" --in-subject --in-body
```

**Filter by sender:**
```bash
> search "Alice" --from bob
```

**Result:**
```
[To be filled during tour]
```

---

### 📢 Stop 12: Broadcast Messages

Send the same message to multiple people (creates separate threads).

**In Alice's terminal:**
```bash
> broadcast bob,charlie,dave --subject "Team Meeting" --body "Team meeting tomorrow at 2pm. Please confirm attendance." --tags meeting urgent
```

**Expected output:**
```
Broadcasting to 3 recipients...
✓ Sent to bob (Thread: 01HZXY..., Message: 01HZXZ...)
✓ Sent to charlie (Thread: 01HZXY..., Message: 01HZXZ...)
✓ Sent to dave (Thread: 01HZXY..., Message: 01HZXZ...)

Broadcast complete: 3 messages sent
```

**What happened:**
- Created 3 separate threads (one with each recipient)
- Same subject and body in each
- Each thread has only 2 participants (alice + recipient)

**Check inbox:**
```bash
> screen
```

**Expected:**
```
INBOX
================================================================================

Thread ID         Created              From     Subject
--------------------------------------------------------------------------------
01HZXY...        2026-01-24 10:50:00   alice    Team Meeting (to dave)
01HZXY...        2026-01-24 10:50:00   alice    Team Meeting (to charlie)
01HZXY...        2026-01-24 10:50:00   alice    Team Meeting (to bob)
01HZXZ...        2026-01-24 10:34:00   bob      Re: Welcome to AgCom!
01HZXY...        2026-01-24 10:35:00   alice    Project Discussion

Total: 5 threads
```

**Result:**
```
[To be filled during tour]
```

---

### 👥 Stop 13: Group Messages

Send one message to multiple people (creates single thread with all participants).

**In Alice's terminal:**
```bash
> send bob,charlie --subject "Team Sync" --body "Let's sync on the project status. Both of you please share updates." --tags team sync
```

**Expected output:**
```
Message sent successfully!
Thread ID: 01HZXY...
Message ID: 01HZXZ...
Recipients: bob, charlie
```

**What's different from broadcast:**
- Only 1 thread created
- Thread has 3 participants: alice, bob, charlie
- When anyone replies, all participants see it

**Result:**
```
[To be filled during tour]
```

---

### 👁️ Stop 14: Watch Mode (Live Updates)

Monitor your inbox for new messages in real-time.

**In Alice's terminal:**
```bash
> exit
```

**Then start watch mode:**
```bash
python -m agcom.console --store tour.db --me alice screen --watch
```

**Expected output:**
```
AgCom Console - Watch Mode
Connected as alice | Refreshing every 2 seconds
Press Ctrl+C to exit

INBOX
================================================================================

Thread ID         Created              From     Subject
--------------------------------------------------------------------------------
01HZXY...        2026-01-24 10:50:00   alice    Team Sync
[... more threads ...]

Total: 6 threads

Last updated: 2026-01-24 10:55:00
```

**What happens:**
- Screen refreshes every 2 seconds
- Shows live updates as new messages arrive
- Press Ctrl+C to exit

**Test it:**
- In Bob's terminal, send a new message to Alice
- Watch Alice's terminal update automatically

**Result:**
```
[To be filled during tour]
```

---

### 🗃️ Stop 15: Thread Metadata

Add custom metadata to organize threads.

**In Alice's terminal (exit watch mode with Ctrl+C first):**
```bash
python -m agcom.console --store tour.db --me alice
```

**Add metadata to a thread:**
```bash
> thread-meta 01HZXZ... set priority high
```

**Expected output:**
```
Metadata updated for thread 01HZXZ...
Key: priority
Value: high
```

**Add more metadata:**
```bash
> thread-meta 01HZXZ... set category onboarding
> thread-meta 01HZXZ... set status active
```

**View all metadata for a thread:**
```bash
> thread-meta 01HZXZ... list
```

**Expected output:**
```
METADATA for Thread 01HZXZ...
================================================================================
priority:  high
category:  onboarding
status:    active
```

**Get specific metadata value:**
```bash
> thread-meta 01HZXZ... get priority
```

**Result:**
```
[To be filled during tour]
```

---

### 📦 Stop 16: Archive Threads

Clean up your inbox by archiving completed conversations.

**Archive a thread:**
```bash
> archive 01HZXZ...
```

**Expected output:**
```
Thread 01HZXZ... archived successfully
```

**Check inbox (archived threads hidden by default):**
```bash
> screen
```

**View archived threads:**
```bash
> threads --archived
```

**Unarchive a thread:**
```bash
> unarchive 01HZXZ...
```

**Result:**
```
[To be filled during tour]
```

---

### 📝 Stop 17: Multi-line Messages

Send longer messages using different methods.

**Method 1: Read from stdin**
```bash
python -m agcom.console --store tour.db --me alice send bob --subject "Long Message" --body @-
```

**Then type (press Ctrl+D or Ctrl+Z when done):**
```
This is a multi-line message.

I can write as much as I want here.
- Point 1
- Point 2
- Point 3

Just press Ctrl+D when finished!
^D
```

**Method 2: Read from file**
```bash
# First create a file
echo "This is message content from a file" > message.txt

# Then send it
python -m agcom.console --store tour.db --me alice send bob --subject "From File" --body-file message.txt
```

**Result:**
```
[To be filled during tour]
```

---

### 🔧 Stop 18: Address Book Management

Advanced address book operations.

**In Alice's terminal:**

**Update contact information:**
```bash
> ab update bob --display-name "Bob Wilson Sr." --desc "Senior Python Developer" --tags python senior mentor
```

**Expected output:**
```
Updated bob in address book
```

**Note about versioning:**
- Address book uses optimistic locking
- Each update increments the version number
- Prevents concurrent update conflicts

**Deactivate a contact (soft delete):**
```bash
> ab delete charlie
```

**Expected output:**
```
Deactivated charlie in address book
```

**View audit history:**
```bash
> ab history charlie
```

**Expected output:**
```
AUDIT HISTORY for charlie
================================================================================

Event ID: 01HZXY...
Type:     address_book_delete
Actor:    alice
Target:   charlie
Time:     2026-01-24 11:05:00
Details:  Set is_active to false

Event ID: 01HZXY...
Type:     address_book_add
Actor:    alice
Target:   charlie
Time:     2026-01-24 10:30:00
Details:  Created contact
```

**Search contacts by tags:**
```bash
> ab search python
```

**Result:**
```
[To be filled during tour]
```

---

### 🎯 Stop 19: Single Command Mode

Execute commands without entering interactive mode (great for scripting).

**Exit interactive mode:**
```bash
> exit
```

**Run commands directly:**

**Check inbox:**
```bash
python -m agcom.console --store tour.db --me alice screen
```

**Send message:**
```bash
python -m agcom.console --store tour.db --me alice send bob --subject "Quick message" --body "Sent from command line!"
```

**View specific thread:**
```bash
python -m agcom.console --store tour.db --me alice view 01HZXZ...
```

**List threads:**
```bash
python -m agcom.console --store tour.db --me alice threads
```

**Search messages:**
```bash
python -m agcom.console --store tour.db --me alice search "meeting"
```

**Use in scripts:**
```bash
#!/bin/bash
# Example: Send daily standup reminder

python -m agcom.console --store team.db --me standup-bot broadcast alice,bob,charlie \
  --subject "Daily Standup Reminder" \
  --body "Standup in 15 minutes! Please prepare your updates." \
  --tags standup reminder
```

**Result:**
```
[To be filled during tour]
```

---

### 🔄 Stop 20: Multi-Agent Concurrent Access

See multiple agents working with the same database simultaneously.

**Open 3 terminal windows side by side:**

**Terminal 1 (Alice):**
```bash
python -m agcom.console --store tour.db --me alice screen --watch
```

**Terminal 2 (Bob):**
```bash
python -m agcom.console --store tour.db --me bob screen --watch
```

**Terminal 3 (Charlie - commands):**
```bash
python -m agcom.console --store tour.db --me charlie
```

**In Charlie's terminal:**
```bash
> send alice,bob --subject "Multi-Agent Demo" --body "Testing concurrent access with SQLite WAL mode!"
```

**Watch the updates:**
- Alice's terminal updates automatically
- Bob's terminal updates automatically
- All three agents access the same database
- No conflicts due to WAL mode and connection management

**Result:**
```
[To be filled during tour]
```

---

## Additional Experiments

### Filter and Sort Threads
```bash
# List threads with pagination
> threads --limit 5 --offset 0

# View only unread threads (threads where last message is from someone else)
> screen --unread-only
```

### Advanced Search
```bash
# Search with multiple filters
> search "project" --in-subject --from alice --tags urgent

# Search specific thread
> search "meeting" --thread-id 01HZXY...

# Limit results
> search "python" --limit 10
```

### Bulk Operations
```bash
# Archive multiple threads (in script)
for thread_id in 01HZXY... 01HZXZ... 01HZYX...; do
  python -m agcom.console --store tour.db --me alice archive $thread_id
done
```

### Export Thread to File
```bash
# View thread and save to file
python -m agcom.console --store tour.db --me alice view 01HZXY... > thread_export.txt
```

---

### 🔒 Stop 17: Privacy & Participant Filtering (NEW!)

Explore how AgCom provides email-like privacy - users only see their own conversations.

**1. Open a terminal as Charlie (a new user):**
```bash
python -m agcom.console --store tour.db --me charlie
```

**2. Charlie views his inbox:**
```bash
> screen
```

**Expected output:**
```
INBOX
================================================================================

No threads yet. Send a message to get started!
```

**Why?** Charlie isn't a participant in any threads yet, so he doesn't see Alice-Bob conversations!

**3. Charlie tries to view Alice-Bob's thread:**
```bash
> view 01HZXY...  # Use the thread ID from Alice-Bob conversation
```

**Expected output:**
```
Error: Thread 01HZXY... not found
```

**Note:** Returns "not found" (not "access denied") - the thread appears to not exist for privacy.

**4. Alice sends a message to Charlie:**

Open another terminal as Alice:
```bash
python -m agcom.console --store tour.db --me alice send charlie --subject "Hi Charlie" --body "Welcome to the team!"
```

**5. Now Charlie can see his thread with Alice:**

Back in Charlie's terminal:
```bash
> screen
```

**Expected output:**
```
INBOX
================================================================================

01HZXZ...  2026-01-24 11:00:00  alice  Hi Charlie

Total: 1 thread
```

**6. But Charlie still can't see Alice-Bob thread:**
```bash
> threads
```

**Expected:** Only shows Charlie-Alice thread, not Alice-Bob thread

**Key takeaway:** Each user has a private inbox showing only their conversations!

**Result:**
```
[To be filled during tour]
```

---

### 👨‍💼 Stop 18: Admin User (NEW!)

Set up an admin user who can see all conversations for system oversight.

**Quick Setup (if starting fresh):**

If you're initializing a new database, you can make yourself the admin in one step:
```bash
python -m agcom.console --store tour.db --me alice init --as-admin
```

This creates the database AND adds Alice as an admin user automatically!

**Manual Setup (for existing databases):**

**1. Alice creates an admin user:**

In Alice's terminal:
```bash
> ab add admin --display-name "System Administrator" --desc "Full system access" --tags admin
```

**Expected:**
```
Added admin to address book
```

**Note:** The "admin" tag grants special privileges!

**2. Open a terminal as the admin user:**
```bash
python -m agcom.console --store tour.db --me admin
```

**3. Admin views ALL threads (including Alice-Bob and Alice-Charlie):**
```bash
> threads
```

**Expected output:**
```
Thread ID: 01HZXY...
Subject: Welcome to AgCom!
Participants: alice, bob
Last Activity: 2026-01-24 10:45:00
--------------------------------------------------------------------------------
Thread ID: 01HZXZ...
Subject: Hi Charlie
Participants: alice, charlie
Last Activity: 2026-01-24 11:00:00
--------------------------------------------------------------------------------

Total: 2 threads
```

**Key observation:** Admin sees ALL threads, even though admin isn't a participant in any!

**4. Admin can view any thread:**
```bash
> view 01HZXY...  # Alice-Bob thread
```

**Expected:** Shows full conversation, even though admin isn't a participant

**5. Admin search sees everything:**
```bash
> search "Welcome"
```

**Expected:** Returns messages from ALL threads containing "Welcome"

**6. Promote a user to admin:**
```bash
> ab edit bob --tags admin python-dev
```

**Now Bob will have admin privileges in his next session!**

**7. Demote a user (remove admin privileges):**
```bash
> ab edit bob --tags python-dev  # Remove "admin" tag
```

**Admin use cases:**
- System monitoring and oversight
- Debugging conversations
- Content moderation
- Compliance auditing

**Security note:** Only grant admin privileges to trusted users. All admin actions are logged in the audit trail.

**Result:**
```
[To be filled during tour]
```

---

## Key Features Demonstrated

✅ **Interactive Mode** - Full-featured command prompt
✅ **Single Command Mode** - Direct command execution for scripting
✅ **Watch Mode** - Real-time inbox monitoring
✅ **Messaging** - Send, reply, broadcast, and group messages
✅ **Threading** - Automatic conversation threading with reply chains
✅ **Participant Filtering** - Email-like privacy (users only see their conversations) **NEW!**
✅ **Admin Role** - System admins can see all threads for oversight **NEW!**
✅ **Address Book** - Contact management with tags and search
✅ **Audit Trail** - Complete history of address book changes
✅ **Search** - Full-text search in subjects and bodies
✅ **Metadata** - Flexible key-value data on threads
✅ **Archive** - Hide completed conversations
✅ **Multi-Agent** - Concurrent access with SQLite WAL mode
✅ **Multi-line Input** - Stdin and file input for long messages
✅ **Pagination** - Handle large message volumes

---

## Command Reference

### Main Commands

| Command | Description |
|---------|-------------|
| `help` | Show all commands |
| `screen` | View inbox |
| `screen --watch` | Monitor inbox in real-time |
| `send <handles> --subject "..." --body "..."` | Send message |
| `reply <msg-id> --body "..."` | Reply to message |
| `reply-thread <thread-id> --body "..."` | Reply to thread |
| `broadcast <handles> --subject "..." --body "..."` | Send to multiple recipients |
| `view <thread-id>` | View thread |
| `threads` | List all threads |
| `search <query>` | Search messages |
| `archive <thread-id>` | Archive thread |
| `unarchive <thread-id>` | Unarchive thread |
| `exit` | Quit interactive mode |

### Address Book Commands

| Command | Description |
|---------|-------------|
| `ab list` | List all contacts |
| `ab add <handle>` | Add contact |
| `ab show <handle>` | View contact details |
| `ab update <handle>` | Update contact |
| `ab delete <handle>` | Deactivate contact |
| `ab search <query>` | Search contacts |
| `ab history <handle>` | View audit history |

### Thread Metadata Commands

| Command | Description |
|---------|-------------|
| `thread-meta <thread-id> set <key> <value>` | Set metadata |
| `thread-meta <thread-id> get <key>` | Get metadata value |
| `thread-meta <thread-id> list` | List all metadata |

---

## Options and Flags

### Global Options
```bash
--store <path>     # Database file path (required)
--me <handle>      # Your agent handle (required)
--watch            # Watch mode for screen command
```

### Message Options
```bash
--subject "..."    # Message subject
--body "..."       # Message body
--body @-          # Read body from stdin
--body-file <path> # Read body from file
--tags tag1 tag2   # Space-separated tags
```

### Search Options
```bash
--in-subject       # Search in subjects
--in-body          # Search in message bodies
--from <handle>    # Filter by sender
--tags tag1 tag2   # Space-separated tags filter
--limit <n>        # Limit results
```

### Address Book Options
```bash
--display-name "..." # Contact's display name
--desc "..."         # Contact description
--tags tag1 tag2     # Space-separated tags
--expected-version N # Optimistic locking version
```

---

## Tips for Effective Use

1. **Use Tab Completion**: Most terminals support tab completion for file paths
2. **Save Thread IDs**: Keep track of important thread IDs in a notes file
3. **Watch Mode for Monitoring**: Use `screen --watch` when waiting for replies
4. **Broadcast vs Group**: Broadcast for announcements (separate threads), group for discussions (shared thread)
5. **Tags for Organization**: Use consistent tags (e.g., "urgent", "project-x", "bug") for easy filtering
6. **Archive Regularly**: Keep inbox clean by archiving completed conversations
7. **Search is Powerful**: Combine `--in-subject`, `--in-body`, and `--from` for precise searches
8. **Metadata for Workflow**: Use thread metadata for priority, status, category, etc.
9. **Single Command for Scripts**: Automate repetitive tasks with single command mode
10. **Multi-line for Long Messages**: Use `--body @-` or `--body-file` for detailed messages

---

## Architecture Notes

**Design:**
- Built on Python argparse for command parsing
- Uses rich text rendering for formatted output
- Direct integration with AgCom session API
- No server required - direct SQLite access

**Database:**
- SQLite with WAL mode enabled
- Concurrent reads from multiple agents
- Single writer at a time (automatic handling)
- 5000ms busy timeout for contention

**Suitable For:**
- Development and testing
- Small teams (<50 agents)
- Automation and scripting
- Command-line workflows

**When to Use REST API Instead:**
- Web/mobile applications
- Authentication requirements
- Rate limiting needed
- Remote access required
- Centralized deployment

---

## Troubleshooting

### Database Locked Error
```
Error: database is locked
```
**Solution**: Wait a moment and retry. WAL mode allows concurrent reads, but only one write at a time.

### Invalid Handle Error
```
Error: Handle must contain only lowercase letters...
```
**Solution**: Handles must be 2-64 chars, lowercase alphanumeric + `.` `-` `_`

### Thread Not Found
```
Error: Thread 01HZXY... not found
```
**Solution**: Verify the thread ID. Use `threads` to list all threads.

### Watch Mode Not Updating
**Solution**: Press Ctrl+C to exit and restart. Check database file permissions.

---

## Next Steps

1. **Integrate with Scripts**: Use single command mode in bash/python scripts
2. **Set Up Aliases**: Create shell aliases for common commands
3. **Build Workflows**: Use metadata and tags to implement custom workflows
4. **Try REST API**: For web/mobile access, see `TOUR.md` for REST API tour
5. **Production Use**: Review security and backup considerations in `README.md`

---

## Documentation References

- **Main README**: README.md - Complete usage guide
- **Library Spec**: LIBRARY_SPEC.md - API documentation
- **REST API Tour**: TOUR.md - REST API guided tour
- **REST API Spec**: REST_API_SPEC.md - Full API specification

---

## Tour Complete! 🎉

You've now explored all major features of the AgCom Console:
- Interactive and single command modes
- Watch mode for real-time monitoring
- Messaging with threading and replies
- Broadcast and group messages
- Participant filtering and privacy **NEW!**
- Admin role for system oversight **NEW!**
- Address book management
- Search and metadata
- Multi-agent concurrent access
- Scripting and automation

**Feedback?** Try creating your own workflows, building automation scripts, and exploring advanced use cases!

---

**Last Updated**: 2026-01-25
**Console Version**: 0.1.0
**Status**: Ready for exploration ✅

**New in v1.1:**
- 🔒 Participant-based filtering (email-like privacy)
- 👨‍💼 Admin role support for system oversight
