"""Command implementations for the console application."""

import sys
import time
from typing import Optional
from functools import wraps

from agcom import init, AgentIdentity
from agcom.models import ScreenOptions
from agcom.console.rendering import format_screen_output, format_thread_output
from agcom.console import config as config_module
from agcom.console import formatting as fmt


# Global session variable for interactive mode
_session = None

# Index mappings for quick access (reply by index, view by index)
_thread_index = {}  # {index: thread_id}
_message_index = {}  # {index: message_id}


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

        # Add current user as admin by default (unless --no-admin specified)
        add_as_admin = not getattr(args, 'no_admin', False)
        if add_as_admin:
            try:
                display_name = getattr(args, 'display_name', None)
                if not display_name:
                    display_name = f"{me_handle.title()} (Admin)"

                session.address_book_add(
                    handle=me_handle,
                    display_name=display_name,
                    description="System administrator with full access",
                    tags=["admin"]
                )
                print(f"Added {me_handle} as admin user")
            except Exception as e:
                session.conn.close()
                print(f"Warning: Failed to add admin privileges: {e}", file=sys.stderr)
                return 1

        session.conn.close()

        # Auto-save config
        try:
            config_module.save_config(store=store_path, me=me_handle)
            print(f"Configuration saved to ~/.agcom/config.json")
        except Exception as e:
            print(f"Warning: Failed to save configuration: {e}", file=sys.stderr)

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
    global _session, _thread_index, _message_index

    store_path = args.store
    me_handle = args.me

    # Create identity
    identity = AgentIdentity(handle=me_handle)

    try:
        _session = init(store_path, identity)
        print(f"Opened session as {me_handle}")

        # Load index cache (for single-command mode)
        cache = config_module.load_index_cache()
        _thread_index = {int(k): v for k, v in cache.get('thread_index', {}).items()}
        _message_index = {int(k): v for k, v in cache.get('message_index', {}).items()}

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
    global _thread_index

    options = ScreenOptions()
    if hasattr(args, 'max_threads') and args.max_threads:
        options = ScreenOptions(max_threads=args.max_threads)

    # Get threads and build index
    from agcom.storage import list_threads
    threads = list_threads(_session.conn, _session.self_identity.handle, limit=options.max_threads)

    # Update thread index
    _thread_index.clear()
    for idx, thread in enumerate(threads, 1):
        _thread_index[idx] = thread.thread_id

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
        output = _format_screen_with_index(_session, options, threads)
        print(output)
        return 0


def _format_screen_with_index(session, options, threads) -> str:
    """Format screen output with index numbers.

    Args:
        session: AgentCommsSession instance
        options: Screen rendering options
        threads: List of threads

    Returns:
        Formatted screen output with index numbers
    """
    from agcom.storage import list_messages

    if not threads:
        return fmt.dim("No threads found.")

    lines = []

    # Header
    count_str = fmt.dim(f" ({len(threads)} thread{'s' if len(threads) != 1 else ''})")
    lines.append(fmt.format_header(f"INBOX{count_str}", 80))
    lines.append("")

    # Column configuration
    idx_width = 3
    timestamp_width = 12
    from_width = 15
    to_width = 15
    subject_width = 30

    # Table header
    columns = ["#", "DATE", "FROM", "TO", "SUBJECT"]
    widths = [idx_width, timestamp_width, from_width, to_width, subject_width]
    colors = [fmt.Colors.BRIGHT_BLACK] * len(columns)
    header_row = fmt.format_table_row(columns, widths, colors)
    lines.append(header_row)
    lines.append(fmt.format_separator(80))

    for idx, thread in enumerate(threads, 1):
        # Get first message to find original sender and recipients
        messages = list_messages(session.conn, session.self_identity.handle, thread_id=thread.thread_id, limit=1)
        if not messages:
            continue

        first_message = messages[0]
        from_handle = first_message.from_handle

        # Determine recipients (other participants excluding sender)
        participants = thread.participant_handles.copy()
        if from_handle in participants:
            participants.remove(from_handle)

        # Format "to" - show first recipient or "multiple"
        if len(participants) == 0:
            to_display = session._resolve_display_name_short(from_handle)  # Self-message
        elif len(participants) == 1:
            to_display = session._resolve_display_name_short(participants[0])
        else:
            # Multiple recipients
            to_display = fmt.dim(f"{len(participants)} people")

        # Resolve display name for sender
        display_from = session._resolve_display_name_short(from_handle)

        # Sanitize and truncate subject
        subject = fmt.sanitize_text(thread.subject, max_length=subject_width)

        # Format timestamp with relative time
        timestamp = fmt.format_timestamp(thread.last_activity_at)

        # Format row
        columns = [
            str(idx),
            timestamp,
            fmt.truncate_smart(display_from, from_width),
            fmt.truncate_smart(to_display, to_width),
            fmt.truncate_smart(subject, subject_width)
        ]
        widths_list = [idx_width, timestamp_width, from_width, to_width, subject_width]

        # Highlight current user's messages
        colors_list = [None, fmt.Colors.BRIGHT_BLACK, None, None, None]
        if from_handle == session.self_identity.handle:
            colors_list[2] = fmt.Colors.CYAN  # Highlight FROM when it's you

        line = fmt.format_table_row(columns, widths_list, colors_list)
        lines.append(line)

    lines.append("")
    lines.append(fmt.dim("Commands: ") + "view <#>  " + fmt.dim(fmt.get_separator()) + "  reply <#> \"message\"")

    return "\n".join(lines)


@requires_session
def cmd_send(args) -> int:
    """Send a new message.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    # Parse positional arguments
    # Format: send RECIPIENT... [SUBJECT] [BODY]
    # If --subject and --body are provided, use those
    # Otherwise, parse from positional args

    positional_args = args.args
    to_handles = []
    subject = args.subject
    body_arg = args.body

    # If flags not provided, parse from positional arguments
    if not subject or not body_arg:
        if len(positional_args) < 1:
            print("Error: At least one recipient required", file=sys.stderr)
            return 1

        if len(positional_args) == 1:
            # Only recipient provided, need subject and body
            if not subject or not body_arg:
                print("Error: Subject and body required. Use: send RECIPIENT SUBJECT BODY", file=sys.stderr)
                print("   or: send RECIPIENT --subject SUBJECT --body BODY", file=sys.stderr)
                return 1
            to_handles = [positional_args[0]]
        elif len(positional_args) == 2:
            # Recipient + one more arg
            if subject and not body_arg:
                # --subject provided, second arg is body
                to_handles = [positional_args[0]]
                body_arg = positional_args[1]
            elif body_arg and not subject:
                # --body provided, second arg is subject
                to_handles = [positional_args[0]]
                subject = positional_args[1]
            else:
                # Neither flag provided, need both
                print("Error: Both subject and body required. Use: send RECIPIENT SUBJECT BODY", file=sys.stderr)
                return 1
        else:
            # 3+ args: last is body, second-to-last is subject, rest are recipients
            to_handles = positional_args[:-2]
            subject = subject or positional_args[-2]
            body_arg = body_arg or positional_args[-1]
    else:
        # Both flags provided, all positional args are recipients
        to_handles = positional_args

    # Validate we have everything
    if not to_handles:
        print("Error: At least one recipient required", file=sys.stderr)
        return 1
    if not subject:
        print("Error: Subject required", file=sys.stderr)
        return 1
    if not body_arg:
        print("Error: Body required", file=sys.stderr)
        return 1

    # Update args.body for read_body_input
    args.body = body_arg

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
    global _thread_index

    limit = getattr(args, "limit", None)

    try:
        threads = _session.list_threads(limit=limit)
        if not threads:
            print(fmt.dim("No threads found"))
            return 0

        # Update thread index
        _thread_index.clear()
        for idx, thread in enumerate(threads, 1):
            _thread_index[idx] = thread.thread_id

        # Header
        count_str = fmt.dim(f" ({len(threads)} thread{'s' if len(threads) != 1 else ''})")
        print(fmt.format_header(f"THREADS{count_str}", 80))
        print()

        for idx, thread in enumerate(threads, 1):
            # Thread number
            thread_num = fmt.colorize(f"[{idx}]", fmt.Colors.CYAN)

            # Subject
            subject = fmt.sanitize_text(thread.subject)
            print(f"{thread_num} {fmt.bold(subject)}")

            # Participants
            participant_names = [_session._resolve_display_name_short(h) for h in thread.participant_handles]
            participants_str = ", ".join(participant_names)
            print(f"    {fmt.dim('Participants:')} {participants_str}")

            # Last activity with relative time
            activity_time = fmt.format_timestamp(thread.last_activity_at)
            print(f"    {fmt.dim('Last activity:')} {activity_time}")

            # Thread ID (dimmed)
            print(f"    {fmt.dim(f'ID: {thread.thread_id}')}")

            print()

        print(fmt.dim("Commands: ") + "view <#>")

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
    global _message_index

    thread_id_or_index = args.thread_id

    # Try to resolve as index first
    try:
        index = int(thread_id_or_index)
        if index in _thread_index:
            thread_id = _thread_index[index]
        else:
            print(f"Error: Thread index {index} not found. Run 'screen' to see available threads.", file=sys.stderr)
            return 1
    except ValueError:
        # Not a number, use as thread_id directly
        thread_id = thread_id_or_index

    try:
        # Get thread and messages
        from agcom.storage import get_thread, list_messages
        thread = get_thread(_session.conn, thread_id, _session.self_identity.handle)
        if not thread:
            print(f"Thread {thread_id} not found", file=sys.stderr)
            return 1

        messages = list_messages(_session.conn, _session.self_identity.handle, thread_id=thread_id)

        # Update message index
        _message_index.clear()
        for idx, msg in enumerate(messages, 1):
            _message_index[idx] = msg.message_id

        # Format output with index numbers
        output = _format_thread_with_index(_session, thread, messages)
        print(output)
        return 0
    except Exception as e:
        print(f"Error viewing thread: {e}", file=sys.stderr)
        return 1


def _format_thread_with_index(session, thread, messages) -> str:
    """Format thread output with index numbers.

    Args:
        session: AgentCommsSession instance
        thread: Thread object
        messages: List of messages

    Returns:
        Formatted thread output with index numbers
    """
    lines = []

    # Thread header
    subject = fmt.sanitize_text(thread.subject)
    lines.append(fmt.format_header(subject, 80))
    lines.append("")

    # Thread metadata
    lines.append(fmt.format_label("Thread ID", fmt.dim(thread.thread_id)))

    # Participants list
    participant_names = [session._resolve_display_name_short(h) for h in thread.participant_handles]
    lines.append(fmt.format_label("Participants", ", ".join(participant_names)))
    lines.append("")

    # Messages
    for idx, msg in enumerate(messages, 1):
        # Message index
        msg_num = fmt.colorize(f"[{idx}]", fmt.Colors.CYAN)

        # Sender info
        display_from = session._resolve_display_name(msg.from_handle)
        if msg.from_handle == session.self_identity.handle:
            display_from = fmt.colorize(display_from, fmt.Colors.CYAN)

        # Timestamp with relative time
        timestamp = fmt.format_timestamp(msg.created_at)

        # Message header
        header_parts = []
        header_parts.append(f"{msg_num} {fmt.bold(display_from)}")
        header_parts.append(fmt.dim(fmt.get_arrow()))

        # Recipients
        to_names = [session._resolve_display_name_short(h) for h in msg.to_handles]
        header_parts.append(", ".join(to_names))

        header_parts.append(fmt.dim(fmt.get_bullet()))
        header_parts.append(fmt.dim(timestamp))

        lines.append(" ".join(header_parts))

        # Reply-to indicator
        if msg.in_reply_to:
            lines.append(fmt.dim(f"   {fmt.get_reply_arrow()} in reply to message"))

        # Tags
        if msg.tags:
            tag_str = " ".join([f"#{tag}" for tag in msg.tags])
            lines.append(fmt.dim(f"   Tags: {tag_str}"))

        # Message body
        lines.append("")

        # Wrap and indent body
        body = fmt.sanitize_text(msg.body)
        body_lines = fmt.wrap_text(body, width=76, indent="")

        for body_line in body_lines:
            lines.append(f"   {body_line}")

        lines.append("")
        lines.append(fmt.format_separator(80))

    lines.append("")
    lines.append(fmt.dim("Commands: ") + "reply <#> \"message\"")

    return "\n".join(lines)


@requires_session
def cmd_reply(args) -> int:
    """Reply to a message.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    # Parse positional arguments
    # Format: reply MESSAGE_ID_OR_INDEX [BODY]
    # If --body is provided, use that

    positional_args = args.args
    body_arg = args.body

    if len(positional_args) < 1:
        print("Error: Message ID or index required", file=sys.stderr)
        return 1

    message_id_or_index = positional_args[0]

    # If body not provided as flag, check positional
    if not body_arg:
        if len(positional_args) >= 2:
            # Second arg is body
            body_arg = positional_args[1]
        else:
            print("Error: Body required. Use: reply ID BODY or reply ID --body BODY", file=sys.stderr)
            return 1

    # Try to resolve as index first
    try:
        index = int(message_id_or_index)
        if index in _message_index:
            message_id = _message_index[index]
        else:
            print(f"Error: Message index {index} not found. Run 'view' to see messages.", file=sys.stderr)
            return 1
    except ValueError:
        # Not a number, use as message_id directly
        message_id = message_id_or_index

    # Update args.body for read_body_input
    args.body = body_arg

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
    tags = getattr(args, "tags", None) or []

    # Handle admin flags
    add_admin = getattr(args, "admin", False)
    remove_admin = getattr(args, "no_admin", False)

    if add_admin and remove_admin:
        print("Error: Cannot specify both --admin and --no-admin", file=sys.stderr)
        return 1

    # Ensure tags is a list
    if tags is None:
        tags = []
    elif not isinstance(tags, list):
        tags = [tags]

    # Modify tags based on admin flags
    if add_admin:
        if "admin" not in tags:
            tags.append("admin")
    elif remove_admin:
        if "admin" in tags:
            tags.remove("admin")

    try:
        _session.address_book_add(
            handle=handle,
            display_name=display_name,
            description=description,
            tags=tags if tags else None
        )

        admin_status = " (admin)" if "admin" in tags else ""
        print(f"Added {handle} to address book{admin_status}")
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

    # Handle admin flags
    add_admin = getattr(args, "admin", False)
    remove_admin = getattr(args, "no_admin", False)

    if add_admin and remove_admin:
        print("Error: Cannot specify both --admin and --no-admin", file=sys.stderr)
        return 1

    # If admin flags are used, need to fetch current entry to modify tags
    if add_admin or remove_admin:
        try:
            entry = _session.address_book_get(handle)
            if not entry:
                print(f"Error: No entry found for {handle}", file=sys.stderr)
                return 1

            # Start with explicitly provided tags, or current tags
            if tags is not None:
                current_tags = list(tags) if isinstance(tags, list) else [tags]
            else:
                current_tags = list(entry.tags) if entry.tags else []

            # Modify tags based on admin flags
            if add_admin:
                if "admin" not in current_tags:
                    current_tags.append("admin")
            elif remove_admin:
                if "admin" in current_tags:
                    current_tags.remove("admin")

            tags = current_tags

        except Exception as e:
            print(f"Error fetching current entry: {e}", file=sys.stderr)
            return 1

    try:
        _session.address_book_update(
            handle=handle,
            display_name=display_name,
            description=description,
            tags=tags,
            is_active=is_active
        )

        # Show admin status in output
        admin_msg = ""
        if add_admin:
            admin_msg = " (promoted to admin)"
        elif remove_admin:
            admin_msg = " (demoted from admin)"

        print(f"Updated {handle} in address book{admin_msg}")
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
            print(fmt.dim("No entries found"))
            return 0

        # Header
        filter_str = "" if active_only else fmt.dim(" (including inactive)")
        count_str = fmt.dim(f" ({len(entries)} {'entries' if len(entries) != 1 else 'entry'})")
        print(fmt.format_header(f"ADDRESS BOOK{count_str}{filter_str}", 80))
        print()

        for entry in entries:
            # Handle with status indicator
            if entry.is_active:
                handle_str = fmt.bold(entry.handle)
            else:
                handle_str = fmt.dim(f"{entry.handle} [inactive]")

            # Admin badge
            is_admin = entry.tags and "admin" in entry.tags
            if is_admin:
                admin_badge = fmt.colorize(" [ADMIN]", fmt.Colors.YELLOW)
                handle_str += admin_badge

            print(handle_str)

            # Display name
            if entry.display_name:
                print(f"  {fmt.dim('Name:')} {entry.display_name}")

            # Description
            if entry.description:
                desc = fmt.truncate_smart(entry.description, 60)
                print(f"  {fmt.dim('Desc:')} {desc}")

            # Tags (excluding admin since we show it as badge)
            if entry.tags:
                display_tags = [tag for tag in entry.tags if tag != "admin"]
                if display_tags:
                    tag_str = ", ".join(display_tags)
                    print(f"  {fmt.dim('Tags:')} {tag_str}")

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

        # Header with handle
        print(fmt.format_header(f"CONTACT: {handle}", 80))
        print()

        # Status indicator
        indicator = fmt.get_indicator()
        if entry.is_active:
            status_str = fmt.colorize(f"{indicator} Active", fmt.Colors.GREEN)
        else:
            status_str = fmt.colorize(f"{indicator} Inactive", fmt.Colors.RED)

        # Admin badge
        is_admin = entry.tags and "admin" in entry.tags
        if is_admin:
            status_str += "  " + fmt.colorize("[ADMIN]", fmt.Colors.YELLOW)

        print(status_str)
        print()

        # Display name
        if entry.display_name:
            print(fmt.format_label("Display Name", entry.display_name))

        # Description
        if entry.description:
            # Wrap description if long
            desc_lines = fmt.wrap_text(entry.description, width=60)
            for i, line in enumerate(desc_lines):
                if i == 0:
                    print(fmt.format_label("Description", line))
                else:
                    print(f"{' ' * 17}{line}")

        # Tags
        if entry.tags:
            tags_str = ", ".join(entry.tags)
            print(fmt.format_label("Tags", tags_str))

        print()
        print(fmt.dim(f"Created: {entry.created_at.strftime('%Y-%m-%d %H:%M:%S')}"))
        print(fmt.dim(f"Updated: {entry.updated_at.strftime('%Y-%m-%d %H:%M:%S')}"))
        print(fmt.dim(f"Version: {entry.version}"))

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

Setup (one-time):
  init --store PATH --me HANDLE
                        Initialize database, add as admin, save config
                        Use --no-admin to skip admin setup
                        Use --display-name to set friendly name

  Note: Flags go AFTER the command:
        ✓ agcom init --store db.db --me alice
        ✗ agcom --store db.db --me alice init

Configuration:
  config set [--store PATH] [--me HANDLE]
                        Save default store and identity to ~/.agcom/config.json
  config show           Show current configuration
  config clear          Clear configuration file

Commands:
  whoami                Display current user identity
  screen [--watch]      Display inbox with numbered threads
  send RECIPIENT... SUBJECT BODY
                        Send a new message (simple syntax)
  threads [--limit N]   List threads with numbers
  view THREAD_ID_OR_#   View a thread with all messages (use # from screen/threads)
  reply MESSAGE_ID_OR_# BODY
                        Reply to a message (simple syntax, use # from view)
  reply-thread THREAD_ID --body BODY
                        Reply to the latest message in a thread
  search QUERY [--limit N]
                        Search messages

Address Book:
  ab add HANDLE [--display-name NAME] [--desc DESCRIPTION] [--admin]
                        Add an address book entry (use --admin for admin user)
  ab edit HANDLE [--display-name NAME] [--admin] [--no-admin] [--deactivate]
                        Edit entry (use --admin to promote, --no-admin to demote)
  ab list [--all]       List address book entries
  ab show HANDLE        Show an address book entry
  ab search QUERY [--all]
                        Search address book entries
  ab deactivate HANDLE  Deactivate an address book entry
  ab history HANDLE [--limit N]
                        Show audit history for an address book entry

Admin Management:
  - First user is admin by default when running 'init'
  - Use 'ab add HANDLE --admin' to create additional admins
  - Use 'ab edit HANDLE --admin' to promote existing user
  - Use 'ab edit HANDLE --no-admin' to demote from admin

Body Input Options:
  --body TEXT           Provide body directly
  --body @-             Read body from stdin (end with Ctrl+D or Ctrl+Z)
  --body-file PATH      Read body from file

Quick Workflow:
  1. Initialize once: init --store mydb.db --me alice
  2. View inbox: screen
  3. View thread by number: view 1
  4. Reply by number: reply 2 "Thanks for the update!"
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
    global _session, _thread_index, _message_index
    if _session:
        # Save index cache before closing (for single-command mode)
        config_module.save_index_cache(_thread_index, _message_index)
        _session.conn.close()
        _session = None
    return 0


def cmd_config_set(args) -> int:
    """Set configuration values.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    store = getattr(args, 'store', None)
    me = getattr(args, 'me', None)

    if not store and not me:
        print("Error: Provide at least one value to set (--store or --me)", file=sys.stderr)
        return 1

    try:
        config_module.save_config(store=store, me=me)
        print("Configuration saved to ~/.agcom/config.json")
        if store:
            print(f"  store: {store}")
        if me:
            print(f"  me: {me}")
        return 0
    except Exception as e:
        print(f"Error saving configuration: {e}", file=sys.stderr)
        return 1


def cmd_config_show(args) -> int:
    """Show current configuration.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    try:
        config = config_module.load_config()
        if not config:
            print("No configuration found")
            print("Set defaults with: agcom config set --store PATH --me HANDLE")
            return 0

        print("Current configuration:")
        if 'store' in config:
            print(f"  store: {config['store']}")
        if 'me' in config:
            print(f"  me: {config['me']}")
        print("\nConfig file: ~/.agcom/config.json")
        print("Clear with: agcom config clear")
        return 0
    except Exception as e:
        print(f"Error loading configuration: {e}", file=sys.stderr)
        return 1


def cmd_config_clear(args) -> int:
    """Clear configuration file.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    try:
        config_module.clear_config()
        print("Configuration cleared")
        return 0
    except Exception as e:
        print(f"Error clearing configuration: {e}", file=sys.stderr)
        return 1
