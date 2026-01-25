"""Command implementations for the console application."""

import sys
import time
from typing import Optional
from functools import wraps

from agcom import init, AgentIdentity
from agcom.models import ScreenOptions
from agcom.console.rendering import format_screen_output, format_thread_output


# Global session variable for interactive mode
_session = None


def requires_session(func):
    """Decorator to ensure a session is open before executing a command.

    Args:
        func: The command function to wrap

    Returns:
        Wrapped function that checks for active session
    """
    @wraps(func)
    def wrapper(args):
        if _session is None:
            print("No session open", file=sys.stderr)
            return 1
        return func(args)
    return wrapper


def read_body_input(args) -> tuple[Optional[str], Optional[str]]:
    """Read body input from various sources.

    Args:
        args: Parsed command arguments with body, body_file attributes

    Returns:
        Tuple of (body_text, error_message). If error_message is not None,
        body_text will be None.
    """
    # Try body file first
    if getattr(args, "body_file", None):
        try:
            with open(args.body_file, 'r') as f:
                return f.read(), None
        except Exception as e:
            return None, f"Error reading body file: {e}"

    # Try stdin
    if args.body == '@-':
        print("Enter message body (Ctrl+D or Ctrl+Z to finish):")
        return sys.stdin.read(), None

    # Direct body text
    return args.body, None


def cmd_init(args) -> int:
    """Initialize a new database.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    store_path = args.store
    me_handle = args.me

    # Create identity
    identity = AgentIdentity(handle=me_handle)

    # Initialize database (this will create the schema)
    try:
        session = init(store_path, identity)
        print(f"Initialized database at {store_path}")

        # Optionally add current user as admin
        if hasattr(args, 'as_admin') and args.as_admin:
            try:
                session.address_book_add(
                    handle=me_handle,
                    display_name=f"{me_handle.title()} (Admin)",
                    description="System administrator with full access",
                    tags=["admin"]
                )
                print(f"Added {me_handle} as admin user")
            except Exception as e:
                session.conn.close()
                print(f"Warning: Failed to add admin privileges: {e}", file=sys.stderr)
                return 1

        session.conn.close()
        return 0
    except Exception as e:
        print(f"Error initializing database: {e}", file=sys.stderr)
        return 1


def cmd_open(args) -> int:
    """Open a session (for interactive mode).

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    global _session

    store_path = args.store
    me_handle = args.me

    # Create identity
    identity = AgentIdentity(handle=me_handle)

    try:
        _session = init(store_path, identity)
        print(f"Opened session as {me_handle}")
        return 0
    except Exception as e:
        print(f"Error opening session: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_whoami(args) -> int:
    """Display current user identity.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    print(f"Handle: {_session.self_identity.handle}")
    if _session.self_identity.display_name:
        print(f"Display Name: {_session.self_identity.display_name}")
    return 0


@requires_session
def cmd_screen(args) -> int:
    """Display the inbox/screen view.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    options = ScreenOptions()
    if hasattr(args, 'max_threads') and args.max_threads:
        options = ScreenOptions(max_threads=args.max_threads)

    # Handle watch mode
    if hasattr(args, 'watch') and args.watch:
        try:
            while True:
                # Clear screen (ANSI escape codes)
                print("\033[2J\033[H", end="")
                output = format_screen_output(_session, options)
                print(output)
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nExiting watch mode")
            return 0
    else:
        output = format_screen_output(_session, options)
        print(output)
        return 0


@requires_session
def cmd_send(args) -> int:
    """Send a new message.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    to_handles = args.to if isinstance(args.to, list) else [args.to]
    subject = args.subject

    # Handle body input
    body, error = read_body_input(args)
    if error:
        print(error, file=sys.stderr)
        return 1

    tags = getattr(args, "tags", None)

    try:
        message = _session.send(
            to_handles=to_handles,
            subject=subject,
            body=body,
            tags=tags
        )
        print(f"Message sent")
        print(f"Thread ID: {message.thread_id}")
        print(f"Message ID: {message.message_id}")
        return 0
    except Exception as e:
        print(f"Error sending message: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_threads(args) -> int:
    """List threads.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    limit = getattr(args, "limit", None)

    try:
        threads = _session.list_threads(limit=limit)
        if not threads:
            print("No threads found")
            return 0

        for thread in threads:
            print(f"Thread ID: {thread.thread_id}")
            print(f"Subject: {thread.subject}")
            print(f"Participants: {', '.join(thread.participant_handles)}")
            print(f"Last Activity: {thread.last_activity_at.strftime('%Y-%m-%d %H:%M:%S')}")
            print("-" * 80)

        return 0
    except Exception as e:
        print(f"Error listing threads: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_view(args) -> int:
    """View a thread.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    thread_id = args.thread_id

    try:
        output = format_thread_output(_session, thread_id)
        print(output)
        return 0
    except Exception as e:
        print(f"Error viewing thread: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_reply(args) -> int:
    """Reply to a message.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    message_id = args.message_id

    # Handle body input
    body, error = read_body_input(args)
    if error:
        print(error, file=sys.stderr)
        return 1

    tags = getattr(args, "tags", None)

    try:
        message = _session.reply(
            message_id=message_id,
            body=body,
            tags=tags
        )
        print(f"Reply sent")
        print(f"Message ID: {message.message_id}")
        return 0
    except Exception as e:
        print(f"Error sending reply: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_reply_thread(args) -> int:
    """Reply to the latest message in a thread.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    thread_id = args.thread_id

    # Handle body input
    body, error = read_body_input(args)
    if error:
        print(error, file=sys.stderr)
        return 1

    tags = getattr(args, "tags", None)

    try:
        message = _session.reply_thread(
            thread_id=thread_id,
            body=body,
            tags=tags
        )
        print(f"Reply sent")
        print(f"Message ID: {message.message_id}")
        return 0
    except Exception as e:
        print(f"Error sending reply: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_thread_meta_set(args) -> int:
    """Set thread metadata.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    thread_id = args.thread_id
    key = args.key
    value = None if args.value.lower() == 'null' else args.value

    try:
        _session.update_thread_metadata(thread_id, key, value)
        if value is None:
            print(f"Removed metadata key '{key}' from thread {thread_id}")
        else:
            print(f"Set metadata '{key}' = '{value}' for thread {thread_id}")
        return 0
    except Exception as e:
        print(f"Error setting thread metadata: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_thread_meta_get(args) -> int:
    """Get thread metadata.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    thread_id = args.thread_id
    key = args.key

    try:
        value = _session.get_thread_metadata(thread_id, key)
        if value is None:
            print(f"Metadata key '{key}' not found in thread {thread_id}")
        else:
            print(f"{key}: {value}")
        return 0
    except Exception as e:
        print(f"Error getting thread metadata: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_thread_archive(args) -> int:
    """Archive a thread.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    thread_id = args.thread_id

    try:
        _session.archive_thread(thread_id)
        print(f"Archived thread {thread_id}")
        return 0
    except Exception as e:
        print(f"Error archiving thread: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_thread_unarchive(args) -> int:
    """Unarchive a thread.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    thread_id = args.thread_id

    try:
        _session.unarchive_thread(thread_id)
        print(f"Unarchived thread {thread_id}")
        return 0
    except Exception as e:
        print(f"Error unarchiving thread: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_search(args) -> int:
    """Search messages.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    query = args.query
    limit = getattr(args, "limit", None)

    try:
        messages = _session.search_messages(query=query, limit=limit)
        if not messages:
            print("No messages found")
            return 0

        for msg in messages:
            print(f"Message ID: {msg.message_id}")
            print(f"Thread ID: {msg.thread_id}")
            print(f"From: {msg.from_handle}")
            print(f"Subject: {msg.subject}")
            print(f"Date: {msg.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
            print("-" * 80)

        return 0
    except Exception as e:
        print(f"Error searching messages: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_ab_add(args) -> int:
    """Add an address book entry.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    handle = args.handle
    display_name = getattr(args, "display_name", None)
    description = getattr(args, "desc", None)
    tags = getattr(args, "tags", None)

    try:
        _session.address_book_add(
            handle=handle,
            display_name=display_name,
            description=description,
            tags=tags
        )
        print(f"Added {handle} to address book")
        return 0
    except Exception as e:
        print(f"Error adding to address book: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_ab_edit(args) -> int:
    """Edit an address book entry.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    handle = args.handle
    display_name = getattr(args, "display_name", None)
    description = getattr(args, "desc", None)
    tags = getattr(args, "tags", None)
    is_active = not getattr(args, "deactivate", False)

    try:
        _session.address_book_update(
            handle=handle,
            display_name=display_name,
            description=description,
            tags=tags,
            is_active=is_active
        )
        print(f"Updated {handle} in address book")
        return 0
    except Exception as e:
        print(f"Error updating address book: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_ab_list(args) -> int:
    """List address book entries.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    active_only = not getattr(args, "all", False)

    try:
        entries = _session.address_book_list(active_only=active_only)
        if not entries:
            print("No entries found")
            return 0

        for entry in entries:
            status = "active" if entry.is_active else "inactive"
            print(f"Handle: {entry.handle} ({status})")
            if entry.display_name:
                print(f"  Display Name: {entry.display_name}")
            if entry.description:
                print(f"  Description: {entry.description}")
            if entry.tags:
                print(f"  Tags: {', '.join(entry.tags)}")
            print(f"  Version: {entry.version}")
            print()

        return 0
    except Exception as e:
        print(f"Error listing address book: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_ab_show(args) -> int:
    """Show an address book entry.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    handle = args.handle

    try:
        entry = _session.address_book_get(handle)
        if not entry:
            print(f"No entry found for {handle}")
            return 1

        status = "active" if entry.is_active else "inactive"
        print(f"Handle: {entry.handle}")
        print(f"Status: {status}")
        if entry.display_name:
            print(f"Display Name: {entry.display_name}")
        if entry.description:
            print(f"Description: {entry.description}")
        print(f"Created: {entry.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Updated: {entry.updated_at.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Version: {entry.version}")

        return 0
    except Exception as e:
        print(f"Error showing address book entry: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_ab_search(args) -> int:
    """Search address book entries.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    query = args.query
    active_only = not getattr(args, "all", False)

    try:
        entries = _session.address_book_search(query=query, active_only=active_only)
        if not entries:
            print("No entries found")
            return 0

        for entry in entries:
            status = "active" if entry.is_active else "inactive"
            print(f"Handle: {entry.handle} ({status})")
            if entry.display_name:
                print(f"  Display Name: {entry.display_name}")
            if entry.description:
                print(f"  Description: {entry.description}")
            print()

        return 0
    except Exception as e:
        print(f"Error searching address book: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_ab_deactivate(args) -> int:
    """Deactivate an address book entry.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    handle = args.handle

    try:
        # Get current entry
        entry = _session.address_book_get(handle)
        if not entry:
            print(f"No entry found for {handle}")
            return 1

        # Update with is_active=False
        _session.address_book_update(
            handle=handle,
            display_name=entry.display_name,
            description=entry.description,
            is_active=False
        )
        print(f"Deactivated {handle} in address book")
        return 0
    except Exception as e:
        print(f"Error deactivating address book entry: {e}", file=sys.stderr)
        return 1


@requires_session
def cmd_ab_history(args) -> int:
    """Show audit history for an address book entry.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """

    handle = args.handle
    limit = getattr(args, "limit", None)

    try:
        events = _session.audit_list(target_handle=handle, limit=limit)
        if not events:
            print(f"No history found for {handle}")
            return 0

        for event in events:
            print(f"Event ID: {event.event_id}")
            print(f"Type: {event.event_type}")
            print(f"Actor: {event.actor_handle}")
            print(f"Time: {event.timestamp.strftime('%Y-%m-%d %H:%M:%S')}")
            if event.details:
                print(f"Details: {event.details}")
            print("-" * 80)

        return 0
    except Exception as e:
        print(f"Error getting audit history: {e}", file=sys.stderr)
        return 1


def cmd_help(args) -> int:
    """Display help message.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    help_text = """
Agent Communication Console

Commands:
  init                  Initialize a new database
  open                  Open a session (for interactive mode)
  whoami                Display current user identity
  screen [--watch]      Display inbox (use --watch for continuous updates)
  send TO... --subject SUBJECT --body BODY
                        Send a new message
  threads [--limit N]   List threads
  view THREAD_ID        View a thread with all messages
  reply MESSAGE_ID --body BODY
                        Reply to a specific message
  reply-thread THREAD_ID --body BODY
                        Reply to the latest message in a thread
  search QUERY [--limit N]
                        Search messages
  ab add HANDLE [--display-name NAME] [--desc DESCRIPTION]
                        Add an address book entry
  ab edit HANDLE [--display-name NAME] [--desc DESCRIPTION] [--deactivate]
                        Edit an address book entry
  ab list [--all]       List address book entries
  ab show HANDLE        Show an address book entry
  ab search QUERY [--all]
                        Search address book entries
  ab deactivate HANDLE  Deactivate an address book entry
  ab history HANDLE [--limit N]
                        Show audit history for an address book entry
  help                  Display this help message
  exit                  Exit interactive mode

Body Input Options:
  --body TEXT           Provide body directly
  --body @-             Read body from stdin (end with Ctrl+D or Ctrl+Z)
  --body-file PATH      Read body from file
"""
    print(help_text)
    return 0


def cmd_exit(args) -> int:
    """Exit interactive mode.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    global _session
    if _session:
        _session.conn.close()
        _session = None
    return 0
