"""Session management for the Agent Communication system."""

import sqlite3
from datetime import datetime, timezone
from typing import Optional
import json

from agcom.models import (
    AgentIdentity,
    Message,
    Thread,
    AddressBookEntry,
    AuditEvent,
    ScreenOptions,
)
from agcom.storage import (
    init_database,
    insert_thread,
    update_thread_last_activity,
    update_thread_metadata,
    get_thread,
    list_threads,
    insert_message,
    get_message,
    list_messages,
    search_messages,
    insert_address_book_entry,
    update_address_book_entry,
    get_address_book_entry,
    list_address_book_entries,
    search_address_book_entries,
    insert_audit_event,
    list_audit_events,
)
from agcom.ulid_gen import generate_ulid
from agcom.validation import (
    validate_handle,
    validate_subject,
    validate_body,
    validate_tags,
    validate_description,
    validate_display_name,
)


class AgentCommsSession:
    """Main session class for agent communication.

    Provides methods for sending/receiving messages, managing threads,
    and maintaining an address book.
    """

    def __init__(self, conn: sqlite3.Connection, self_identity: AgentIdentity):
        """Initialize a session.

        Args:
            conn: Database connection
            self_identity: Identity of the agent using this session
        """
        self.conn = conn
        self.self_identity = self_identity

    @property
    def is_admin(self) -> bool:
        """Check if current user has admin privileges.

        Admin status is cached per session for performance.
        """
        if not hasattr(self, '_is_admin_cached'):
            from agcom.storage import is_admin
            self._is_admin_cached = is_admin(self.conn, self.self_identity.handle)
        return self._is_admin_cached

    def __enter__(self):
        """Enter context manager."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit context manager and close connection."""
        self.conn.close()
        return False

    # Messaging methods

    def send(
        self,
        to_handles: list[str],
        subject: str,
        body: str,
        tags: Optional[list[str]] = None
    ) -> Message:
        """Send a new message, creating a new thread.

        Args:
            to_handles: List of recipient handles
            subject: Message subject
            body: Message body
            tags: Optional list of tags

        Returns:
            The created Message object

        Raises:
            ValueError: If validation fails
        """
        # Validate inputs
        for handle in to_handles:
            validate_handle(handle)
        validate_subject(subject)
        validate_body(body)
        if tags:
            tags = validate_tags(tags)  # Returns deduplicated list

        # Generate IDs and timestamp
        thread_id = generate_ulid()
        message_id = generate_ulid()
        now = datetime.now(timezone.utc)

        # Compute participant handles (from + to, deduplicated and sorted)
        participant_set = set([self.self_identity.handle] + to_handles)
        participant_handles = sorted(participant_set)

        # Create thread
        insert_thread(
            self.conn,
            thread_id=thread_id,
            subject=subject,
            participant_handles=participant_handles,
            created_at=now,
            last_activity_at=now
        )

        # Create message
        insert_message(
            self.conn,
            message_id=message_id,
            thread_id=thread_id,
            from_handle=self.self_identity.handle,
            to_handles=to_handles,
            subject=subject,
            body=body,
            created_at=now,
            in_reply_to=None,
            tags=tags
        )

        # Log audit events
        # Thread creation event
        thread_event_id = generate_ulid()
        thread_details = json.dumps({
            "thread_id": thread_id,
            "subject": subject,
            "participant_handles": participant_handles
        })
        insert_audit_event(
            self.conn,
            event_id=thread_event_id,
            event_type="thread_create",
            actor_handle=self.self_identity.handle,
            target_handle=None,
            details=thread_details,
            timestamp=now
        )

        # Message send event
        message_event_id = generate_ulid()
        message_details = json.dumps({
            "message_id": message_id,
            "thread_id": thread_id,
            "to_handles": to_handles,
            "subject": subject,
            "tags": tags
        })
        insert_audit_event(
            self.conn,
            event_id=message_event_id,
            event_type="message_send",
            actor_handle=self.self_identity.handle,
            target_handle=to_handles[0] if len(to_handles) == 1 else None,
            details=message_details,
            timestamp=now
        )

        # Return the created message
        return Message(
            message_id=message_id,
            thread_id=thread_id,
            from_handle=self.self_identity.handle,
            to_handles=to_handles,
            subject=subject,
            body=body,
            created_at=now,
            in_reply_to=None,
            tags=tags
        )

    def send_broadcast(
        self,
        to_handles: list[str],
        subject: str,
        body: str,
        tags: Optional[list[str]] = None
    ) -> list[Message]:
        """Send the same message to multiple recipients, creating one thread per recipient.

        This is useful for sending announcements or notifications where you want
        separate one-on-one threads with each recipient.

        Args:
            to_handles: List of recipient handles
            subject: Message subject
            body: Message body
            tags: Optional list of tags

        Returns:
            List of created Message objects, one per recipient

        Raises:
            ValueError: If validation fails
        """
        messages = []
        for recipient in to_handles:
            message = self.send([recipient], subject, body, tags)
            messages.append(message)
        return messages

    def send_group(
        self,
        to_handles: list[str],
        subject: str,
        body: str,
        tags: Optional[list[str]] = None
    ) -> Message:
        """Send a message to multiple recipients in a single group thread.

        This creates one thread with all recipients as participants, allowing
        for group discussion.

        Args:
            to_handles: List of recipient handles
            subject: Message subject
            body: Message body
            tags: Optional list of tags

        Returns:
            The created Message object

        Raises:
            ValueError: If validation fails
        """
        # This is the same as send(), just clarifies the intent
        return self.send(to_handles, subject, body, tags)

    def reply(
        self,
        message_id: str,
        body: str,
        tags: Optional[list[str]] = None
    ) -> Message:
        """Reply to a specific message.

        Args:
            message_id: ID of the message to reply to
            body: Reply body
            tags: Optional list of tags

        Returns:
            The created reply Message object

        Raises:
            ValueError: If validation fails or message not found
        """
        # Validate inputs
        validate_body(body)
        if tags:
            tags = validate_tags(tags)  # Returns deduplicated list

        # Get the original message
        original_message = get_message(self.conn, message_id, self.self_identity.handle)
        if not original_message:
            raise ValueError(f"Message {message_id} not found")

        # Get the thread
        thread = get_thread(self.conn, original_message.thread_id, self.self_identity.handle)
        if not thread:
            raise ValueError(f"Thread {original_message.thread_id} not found")

        # Generate new message ID and timestamp
        new_message_id = generate_ulid()
        now = datetime.now(timezone.utc)

        # Compute to_handles (original from_handle if different from self)
        if original_message.from_handle != self.self_identity.handle:
            to_handles = [original_message.from_handle]
        else:
            # If replying to own message, use original to_handles
            to_handles = original_message.to_handles

        # Update participant handles if needed
        participant_set = set(thread.participant_handles)
        participant_set.add(self.self_identity.handle)
        for handle in to_handles:
            participant_set.add(handle)
        participant_handles = sorted(participant_set)

        # Update thread last activity
        update_thread_last_activity(
            self.conn,
            thread_id=thread.thread_id,
            last_activity_at=now,
            participant_handles=participant_handles
        )

        # Create reply message
        insert_message(
            self.conn,
            message_id=new_message_id,
            thread_id=thread.thread_id,
            from_handle=self.self_identity.handle,
            to_handles=to_handles,
            subject=thread.subject,
            body=body,
            created_at=now,
            in_reply_to=message_id,
            tags=tags
        )

        # Log audit event
        event_id = generate_ulid()
        details = json.dumps({
            "message_id": new_message_id,
            "thread_id": thread.thread_id,
            "in_reply_to": message_id,
            "to_handles": to_handles,
            "tags": tags
        })
        insert_audit_event(
            self.conn,
            event_id=event_id,
            event_type="message_reply",
            actor_handle=self.self_identity.handle,
            target_handle=to_handles[0] if len(to_handles) == 1 else None,
            details=details,
            timestamp=now
        )

        # Return the created message
        return Message(
            message_id=new_message_id,
            thread_id=thread.thread_id,
            from_handle=self.self_identity.handle,
            to_handles=to_handles,
            subject=thread.subject,
            body=body,
            created_at=now,
            in_reply_to=message_id,
            tags=tags
        )

    def reply_thread(
        self,
        thread_id: str,
        body: str,
        tags: Optional[list[str]] = None
    ) -> Message:
        """Reply to the latest message in a thread.

        Args:
            thread_id: ID of the thread to reply to
            body: Reply body
            tags: Optional list of tags

        Returns:
            The created reply Message object

        Raises:
            ValueError: If validation fails or thread not found or has no messages
        """
        # Get messages in thread
        messages = list_messages(self.conn, self.self_identity.handle, thread_id=thread_id)
        if not messages:
            raise ValueError(f"Thread {thread_id} has no messages")

        # Get the latest message (last in the list since ordered by created_at ASC)
        latest_message = messages[-1]

        # Reply to that message
        return self.reply(latest_message.message_id, body, tags)

    # Viewing methods

    def current_screen(self, options: Optional[ScreenOptions] = None) -> str:
        """Get formatted inbox view with thread list.

        Args:
            options: Optional screen rendering options

        Returns:
            Formatted string showing inbox
        """
        if options is None:
            options = ScreenOptions()

        threads = list_threads(self.conn, self.self_identity.handle, limit=options.max_threads)

        if not threads:
            return "No threads found."

        lines = []
        lines.append("INBOX")
        lines.append("=" * 80)
        lines.append("")

        # Add column headers
        thread_id_width = 26
        timestamp_width = 14
        from_width = options.from_width
        to_width = options.from_width

        header = f"{'THREAD ID':<{thread_id_width}}  {'DATE':<{timestamp_width}}  {'FROM':<{from_width}}  {'TO':<{to_width}}  SUBJECT"
        lines.append(header)
        lines.append("-" * 80)

        for thread in threads:
            # Get first message to find original sender and recipients
            messages = list_messages(self.conn, self.self_identity.handle, thread_id=thread.thread_id, limit=1)
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
                to_display = self._resolve_display_name_short(from_handle)  # Self-message
            elif len(participants) == 1:
                to_display = self._resolve_display_name_short(participants[0])
            else:
                # Multiple recipients
                to_display = f"{len(participants)} recipients"

            # Truncate "to" if needed
            if len(to_display) > to_width:
                to_display = self._truncate(to_display, to_width)

            # Resolve display name for sender
            display_from = self._resolve_display_name_short(from_handle)
            if len(display_from) > from_width:
                display_from = self._truncate(display_from, from_width)

            # Truncate subject
            subject = self._truncate(thread.subject, options.subject_width)

            # Format timestamp
            timestamp = self._format_timestamp(thread.last_activity_at)

            # Format line with proper spacing
            line = f"{thread.thread_id:<{thread_id_width}}  {timestamp:<{timestamp_width}}  {display_from:<{from_width}}  {to_display:<{to_width}}  {subject}"
            lines.append(line)

        return "\n".join(lines)

    def view_thread(self, thread_id: str) -> str:
        """Get formatted thread view with all messages.

        Args:
            thread_id: ID of the thread to view

        Returns:
            Formatted string showing thread and all messages

        Raises:
            ValueError: If thread not found
        """
        thread = get_thread(self.conn, thread_id, self.self_identity.handle)
        if not thread:
            raise ValueError(f"Thread {thread_id} not found")

        messages = list_messages(self.conn, self.self_identity.handle, thread_id=thread_id)

        lines = []
        lines.append(f"THREAD: {thread.subject}")
        lines.append(f"ID: {thread.thread_id}")
        lines.append(f"Participants: {', '.join(thread.participant_handles)}")
        lines.append("=" * 80)
        lines.append("")

        for msg in messages:
            display_from = self._resolve_display_name(msg.from_handle)
            timestamp = self._format_timestamp(msg.created_at)

            lines.append(f"Message ID: {msg.message_id}")
            lines.append(f"From: {display_from}")
            lines.append(f"To: {', '.join(msg.to_handles)}")
            lines.append(f"Date: {timestamp}")
            if msg.in_reply_to:
                lines.append(f"In reply to: {msg.in_reply_to}")
            if msg.tags:
                lines.append(f"Tags: {', '.join(msg.tags)}")
            lines.append("")
            lines.append(msg.body)
            lines.append("-" * 80)
            lines.append("")

        return "\n".join(lines)

    def list_threads(
        self,
        limit: Optional[int] = None,
        offset: int = 0
    ) -> list[Thread]:
        """List threads ordered by last activity.

        Args:
            limit: Maximum number of threads to return
            offset: Number of threads to skip

        Returns:
            List of Thread objects
        """
        return list_threads(self.conn, self.self_identity.handle, limit=limit, offset=offset)

    def list_messages(
        self,
        thread_id: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0
    ) -> list[Message]:
        """List messages, optionally filtered by thread.

        Args:
            thread_id: Optional thread ID to filter by
            limit: Maximum number of messages to return
            offset: Number of messages to skip

        Returns:
            List of Message objects
        """
        return list_messages(self.conn, self.self_identity.handle, thread_id=thread_id, limit=limit, offset=offset)

    def get_thread(self, thread_id: str) -> Optional[Thread]:
        """Get a thread by ID.

        Args:
            thread_id: Thread identifier

        Returns:
            Thread object or None if not found
        """
        return get_thread(self.conn, thread_id, self.self_identity.handle)

    def update_thread_metadata(
        self,
        thread_id: str,
        key: str,
        value: Optional[str]
    ) -> None:
        """Update a single metadata key for a thread.

        Args:
            thread_id: Thread identifier
            key: Metadata key
            value: Metadata value (None to remove key)

        Raises:
            ValueError: If thread not found
        """
        # Get current thread
        thread = get_thread(self.conn, thread_id, self.self_identity.handle)
        if not thread:
            raise ValueError(f"Thread {thread_id} not found")

        # Update metadata
        metadata = thread.metadata.copy() if thread.metadata else {}
        if value is None:
            metadata.pop(key, None)
        else:
            metadata[key] = value

        # Save updated metadata
        update_thread_metadata(self.conn, thread_id, metadata)

    def get_thread_metadata(self, thread_id: str, key: str) -> Optional[str]:
        """Get a metadata value for a thread.

        Args:
            thread_id: Thread identifier
            key: Metadata key

        Returns:
            Metadata value or None if key not found

        Raises:
            ValueError: If thread not found
        """
        thread = get_thread(self.conn, thread_id, self.self_identity.handle)
        if not thread:
            raise ValueError(f"Thread {thread_id} not found")

        return thread.metadata.get(key) if thread.metadata else None

    def archive_thread(self, thread_id: str) -> None:
        """Mark a thread as archived.

        Args:
            thread_id: Thread identifier

        Raises:
            ValueError: If thread not found
        """
        self.update_thread_metadata(thread_id, "archived", "true")

    def unarchive_thread(self, thread_id: str) -> None:
        """Remove archived status from a thread.

        Args:
            thread_id: Thread identifier

        Raises:
            ValueError: If thread not found
        """
        self.update_thread_metadata(thread_id, "archived", None)

    def get_message(self, message_id: str) -> Optional[Message]:
        """Get a message by ID.

        Args:
            message_id: Message identifier

        Returns:
            Message object or None if not found
        """
        return get_message(self.conn, message_id, self.self_identity.handle)

    def search_messages(
        self,
        query: str,
        in_subject: bool = True,
        in_body: bool = True,
        from_handle: Optional[str] = None,
        to_handle: Optional[str] = None,
        limit: Optional[int] = None
    ) -> list[Message]:
        """Search messages by subject and/or body with optional filters.

        Args:
            query: Search query string (case-insensitive)
            in_subject: Search in subject field (default True)
            in_body: Search in body field (default True)
            from_handle: Filter by sender handle (optional)
            to_handle: Filter by recipient handle (optional)
            limit: Maximum number of messages to return

        Returns:
            List of Message objects matching the query
        """
        return search_messages(
            self.conn,
            self.self_identity.handle,
            query=query,
            in_subject=in_subject,
            in_body=in_body,
            from_handle=from_handle,
            to_handle=to_handle,
            limit=limit
        )

    # Address book methods

    def address_book_add(
        self,
        handle: str,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[list[str]] = None
    ) -> AddressBookEntry:
        """Add an entry to the address book.

        Args:
            handle: Agent handle
            display_name: Optional display name
            description: Optional description
            tags: Optional list of tags for categorization

        Returns:
            The created AddressBookEntry object

        Raises:
            ValueError: If validation fails or entry already exists
        """
        # Validate inputs
        validate_handle(handle)
        if display_name is not None and display_name != "":
            validate_display_name(display_name)
        elif display_name == "":
            raise ValueError("Display name cannot be empty or only whitespace")
        if description is not None and description != "":
            validate_description(description)
        elif description == "":
            raise ValueError("Description cannot be empty or only whitespace")
        if tags:
            tags = validate_tags(tags)

        # Check if already exists
        existing = get_address_book_entry(self.conn, handle)
        if existing:
            raise ValueError(f"Address book entry for {handle} already exists")

        # Insert entry
        now = datetime.now(timezone.utc)
        insert_address_book_entry(
            self.conn,
            handle=handle,
            display_name=display_name,
            description=description,
            tags=tags,
            created_at=now,
            updated_by=self.self_identity.handle
        )

        # Log audit event
        event_id = generate_ulid()
        details = json.dumps({
            "handle": handle,
            "display_name": display_name,
            "description": description,
            "tags": tags
        })
        insert_audit_event(
            self.conn,
            event_id=event_id,
            event_type="address_book_add",
            actor_handle=self.self_identity.handle,
            target_handle=handle,
            details=details,
            timestamp=now
        )

        # Return the created entry
        entry = get_address_book_entry(self.conn, handle)
        if not entry:
            raise RuntimeError(f"Failed to retrieve newly created entry for {handle}")
        return entry

    def address_book_update(
        self,
        handle: str,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[list[str]] = None,
        is_active: bool = True,
        expected_version: Optional[int] = None
    ) -> AddressBookEntry:
        """Update an address book entry.

        Args:
            handle: Agent handle
            display_name: New display name
            description: New description
            tags: New list of tags
            is_active: Whether entry is active
            expected_version: Expected version for optimistic locking (optional)

        Returns:
            The updated AddressBookEntry object

        Raises:
            ValueError: If validation fails, entry not found, or version conflict
        """
        # Validate inputs
        validate_handle(handle)
        if display_name is not None and display_name != "":
            validate_display_name(display_name)
        if description is not None and description != "":
            validate_description(description)
        if tags:
            tags = validate_tags(tags)

        # Get current entry
        existing = get_address_book_entry(self.conn, handle)
        if not existing:
            raise ValueError(f"Address book entry for {handle} not found")

        # Use provided expected_version or read fresh
        version_to_check = expected_version if expected_version is not None else existing.version

        # Update entry
        now = datetime.now(timezone.utc)
        success = update_address_book_entry(
            self.conn,
            handle=handle,
            display_name=display_name,
            description=description,
            is_active=is_active,
            updated_at=now,
            updated_by=self.self_identity.handle,
            expected_version=version_to_check,
            tags=tags
        )

        if not success:
            raise ValueError(
                f"Version conflict: entry for {handle} was modified by another process"
            )

        # Create audit event
        event_id = generate_ulid()
        details = json.dumps({
            "display_name": display_name,
            "description": description,
            "tags": tags,
            "is_active": is_active,
            "old_version": existing.version,
            "new_version": existing.version + 1
        })
        insert_audit_event(
            self.conn,
            event_id=event_id,
            event_type="address_book_update",
            actor_handle=self.self_identity.handle,
            target_handle=handle,
            details=details,
            timestamp=now
        )

        # Return the updated entry
        updated_entry = get_address_book_entry(self.conn, handle)
        if not updated_entry:
            raise RuntimeError(f"Failed to retrieve updated entry for {handle}")
        return updated_entry

    def address_book_get(self, handle: str) -> Optional[AddressBookEntry]:
        """Get an address book entry.

        Args:
            handle: Agent handle

        Returns:
            AddressBookEntry or None if not found
        """
        return get_address_book_entry(self.conn, handle)

    def address_book_list(self, active_only: bool = True) -> list[AddressBookEntry]:
        """List address book entries.

        Args:
            active_only: If True, only return active entries

        Returns:
            List of AddressBookEntry objects
        """
        return list_address_book_entries(self.conn, active_only=active_only)

    def address_book_search(
        self,
        query: Optional[str] = None,
        tags: Optional[list[str]] = None,
        active_only: bool = True
    ) -> list[AddressBookEntry]:
        """Search address book entries by text or tags.

        Args:
            query: Search query string (case-insensitive, searches handle/display_name/description)
            tags: List of tags to filter by (matches if entry has ANY of these tags)
            active_only: If True, only search active entries

        Returns:
            List of AddressBookEntry objects matching the criteria
        """
        return search_address_book_entries(
            self.conn,
            query=query,
            tags=tags,
            active_only=active_only
        )

    # Audit methods

    def audit_list(
        self,
        event_type: Optional[str] = None,
        actor_handle: Optional[str] = None,
        target_handle: Optional[str] = None,
        limit: Optional[int] = None
    ) -> list[AuditEvent]:
        """List audit events.

        Args:
            event_type: Optional event type to filter by
            actor_handle: Optional actor handle to filter by
            target_handle: Optional target handle to filter by
            limit: Maximum number of events to return

        Returns:
            List of AuditEvent objects
        """
        return list_audit_events(
            self.conn,
            event_type=event_type,
            actor_handle=actor_handle,
            target_handle=target_handle,
            limit=limit
        )

    # Helper methods

    def _resolve_display_name(
        self,
        handle: str,
        max_width: Optional[int] = None
    ) -> str:
        """Resolve a handle to a display name.

        Format: "Display Name (handle)" or just "handle" if no display name.

        Args:
            handle: Agent handle
            max_width: Optional maximum width for truncation

        Returns:
            Formatted display string
        """
        entry = get_address_book_entry(self.conn, handle)
        if entry and entry.display_name:
            result = f"{entry.display_name} ({handle})"
        else:
            result = handle

        if max_width and len(result) > max_width:
            return self._truncate(result, max_width)

        return result

    def _resolve_display_name_short(self, handle: str) -> str:
        """Resolve a handle to display name without handle suffix.

        Format: "Display Name" or just "handle" if no display name.
        This is cleaner for columnar displays like screen view.

        Args:
            handle: Agent handle

        Returns:
            Display name or handle
        """
        entry = get_address_book_entry(self.conn, handle)
        if entry and entry.display_name:
            return entry.display_name
        else:
            return handle

    def _truncate(self, text: str, max_width: int) -> str:
        """Truncate text to fit within max_width, preferring word boundaries.

        Args:
            text: Text to truncate
            max_width: Maximum width

        Returns:
            Truncated text with … if truncated
        """
        if len(text) <= max_width:
            return text

        # Reserve space for ellipsis
        if max_width < 3:
            return "…"

        truncate_at = max_width - 1  # Leave space for …

        # Try to break at a word boundary
        last_space = text[:truncate_at].rfind(' ')
        if last_space > max_width // 2:  # Only use word boundary if it's not too early
            truncate_at = last_space

        return text[:truncate_at] + "…"

    def _format_timestamp(self, dt: datetime) -> str:
        """Format a timestamp for display.

        Format: MM/DD/YY HH:MM

        Args:
            dt: Datetime to format

        Returns:
            Formatted timestamp string
        """
        return dt.strftime("%m/%d/%y %H:%M")


def init(store_path: str, self_identity: AgentIdentity) -> AgentCommsSession:
    """Initialize a new agent communication session.

    Args:
        store_path: Path to the SQLite database file
        self_identity: Identity of the agent using this session

    Returns:
        AgentCommsSession instance

    Raises:
        ValueError: If self_identity.handle is invalid
    """
    # Validate self identity handle
    validate_handle(self_identity.handle)

    # Initialize database
    conn = init_database(store_path)

    # Create and return session
    return AgentCommsSession(conn, self_identity)
