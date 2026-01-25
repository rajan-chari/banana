"""SQLite storage layer for the Agent Communication system."""

import sqlite3
import json
from datetime import datetime, timezone
from typing import Optional
from contextlib import contextmanager

from agcom.models import Message, Thread, AddressBookEntry, AuditEvent


SCHEMA_VERSION = 1


def init_database(db_path: str) -> sqlite3.Connection:
    """Initialize the database with schema and return a connection.

    Args:
        db_path: Path to the SQLite database file

    Returns:
        sqlite3.Connection: Database connection with proper settings

    Raises:
        RuntimeError: If schema version mismatch or initialization fails
    """
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row

    # Set pragmas for optimal performance and correctness
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA foreign_keys=ON")

    # Check if database is already initialized
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_metadata'"
    )
    if cursor.fetchone():
        # Verify schema version
        cursor = conn.execute("SELECT version FROM schema_metadata LIMIT 1")
        row = cursor.fetchone()
        if row and row[0] != SCHEMA_VERSION:
            raise RuntimeError(
                f"Schema version mismatch: expected {SCHEMA_VERSION}, found {row[0]}"
            )
        return conn

    # Create schema
    with conn:
        # Schema metadata table
        conn.execute("""
            CREATE TABLE schema_metadata (
                version INTEGER PRIMARY KEY,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute(
            "INSERT INTO schema_metadata (version, created_at) VALUES (?, ?)",
            (SCHEMA_VERSION, datetime.now(timezone.utc).isoformat())
        )

        # Threads table
        conn.execute("""
            CREATE TABLE threads (
                thread_id TEXT PRIMARY KEY,
                subject TEXT NOT NULL,
                participant_handles TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_activity_at TEXT NOT NULL,
                metadata TEXT
            )
        """)
        conn.execute("CREATE INDEX idx_threads_last_activity ON threads(last_activity_at DESC)")

        # Messages table
        conn.execute("""
            CREATE TABLE messages (
                message_id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                from_handle TEXT NOT NULL,
                to_handles TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at TEXT NOT NULL,
                in_reply_to TEXT,
                tags TEXT,
                FOREIGN KEY (thread_id) REFERENCES threads(thread_id),
                FOREIGN KEY (in_reply_to) REFERENCES messages(message_id)
            )
        """)
        conn.execute("CREATE INDEX idx_messages_thread ON messages(thread_id, created_at ASC)")
        conn.execute("CREATE INDEX idx_messages_from ON messages(from_handle)")
        conn.execute("CREATE INDEX idx_messages_created_at ON messages(created_at DESC)")

        # Address book table
        conn.execute("""
            CREATE TABLE address_book (
                handle TEXT PRIMARY KEY,
                display_name TEXT,
                description TEXT,
                tags TEXT,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                updated_by TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1
            )
        """)
        conn.execute("CREATE INDEX idx_address_book_active ON address_book(is_active)")

        # Audit log table
        conn.execute("""
            CREATE TABLE audit_log (
                event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                actor_handle TEXT NOT NULL,
                target_handle TEXT,
                details TEXT,
                timestamp TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX idx_audit_timestamp ON audit_log(timestamp DESC)")
        conn.execute("CREATE INDEX idx_audit_target ON audit_log(target_handle)")

    return conn


@contextmanager
def transaction(conn: sqlite3.Connection):
    """Context manager for database transactions.

    Args:
        conn: Database connection

    Yields:
        Connection within a transaction
    """
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def _encode_list(items: Optional[list[str]]) -> str:
    """Encode a list of strings as JSON.

    Args:
        items: List of strings or None

    Returns:
        JSON string representation
    """
    if items is None:
        return json.dumps([])
    return json.dumps(items)


def _decode_list(json_str: str) -> list[str]:
    """Decode a JSON string to a list of strings.

    Args:
        json_str: JSON string

    Returns:
        List of strings
    """
    return json.loads(json_str)


def _datetime_to_iso(dt: datetime) -> str:
    """Convert datetime to ISO 8601 string.

    Args:
        dt: Datetime object (should be UTC)

    Returns:
        ISO 8601 formatted string
    """
    return dt.isoformat()


def _iso_to_datetime(iso_str: str) -> datetime:
    """Convert ISO 8601 string to datetime.

    Args:
        iso_str: ISO 8601 formatted string

    Returns:
        Datetime object in UTC
    """
    dt = datetime.fromisoformat(iso_str)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def is_admin(conn: sqlite3.Connection, handle: str) -> bool:
    """Check if a handle has admin privileges.

    Admin status is determined by presence of 'admin' tag in address book.

    Args:
        conn: Database connection
        handle: Agent handle to check

    Returns:
        True if handle has 'admin' tag in active address book entry
    """
    cursor = conn.execute(
        "SELECT tags FROM address_book WHERE handle = ? AND is_active = 1",
        (handle,)
    )
    row = cursor.fetchone()
    if not row or not row["tags"]:
        return False

    tags = _decode_list(row["tags"])
    return "admin" in tags


# Thread operations

def insert_thread(
    conn: sqlite3.Connection,
    thread_id: str,
    subject: str,
    participant_handles: list[str],
    created_at: datetime,
    last_activity_at: datetime
) -> None:
    """Insert a new thread.

    Args:
        conn: Database connection
        thread_id: Unique thread identifier
        subject: Thread subject
        participant_handles: List of participant handles (sorted)
        created_at: Thread creation timestamp
        last_activity_at: Last activity timestamp
    """
    with transaction(conn):
        conn.execute(
            """
            INSERT INTO threads (thread_id, subject, participant_handles, created_at, last_activity_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                thread_id,
                subject,
                _encode_list(participant_handles),
                _datetime_to_iso(created_at),
                _datetime_to_iso(last_activity_at)
            )
        )


def update_thread_last_activity(
    conn: sqlite3.Connection,
    thread_id: str,
    last_activity_at: datetime,
    participant_handles: list[str]
) -> None:
    """Update thread's last activity time and participant list.

    Args:
        conn: Database connection
        thread_id: Thread identifier
        last_activity_at: New last activity timestamp
        participant_handles: Updated list of participant handles (sorted)
    """
    with transaction(conn):
        conn.execute(
            """
            UPDATE threads
            SET last_activity_at = ?, participant_handles = ?
            WHERE thread_id = ?
            """,
            (
                _datetime_to_iso(last_activity_at),
                _encode_list(participant_handles),
                thread_id
            )
        )


def update_thread_metadata(
    conn: sqlite3.Connection,
    thread_id: str,
    metadata: dict[str, str]
) -> None:
    """Update thread metadata.

    Args:
        conn: Database connection
        thread_id: Thread identifier
        metadata: Metadata dictionary to set (replaces existing metadata)
    """
    with transaction(conn):
        conn.execute(
            """
            UPDATE threads
            SET metadata = ?
            WHERE thread_id = ?
            """,
            (
                json.dumps(metadata) if metadata else None,
                thread_id
            )
        )


def get_thread(conn: sqlite3.Connection, thread_id: str, for_handle: str) -> Optional[Thread]:
    """Get a thread by ID.

    Args:
        conn: Database connection
        thread_id: Thread identifier
        for_handle: Agent handle requesting access (for authorization check)

    Returns:
        Thread object or None if not found or access denied
    """
    cursor = conn.execute(
        "SELECT * FROM threads WHERE thread_id = ?",
        (thread_id,)
    )
    row = cursor.fetchone()
    if not row:
        return None

    # Check authorization: admin or participant
    if not is_admin(conn, for_handle):
        participant_handles = _decode_list(row["participant_handles"])
        if for_handle not in participant_handles:
            return None

    return Thread(
        thread_id=row["thread_id"],
        subject=row["subject"],
        participant_handles=_decode_list(row["participant_handles"]),
        created_at=_iso_to_datetime(row["created_at"]),
        last_activity_at=_iso_to_datetime(row["last_activity_at"]),
        metadata=json.loads(row["metadata"]) if row["metadata"] else None
    )


def list_threads(
    conn: sqlite3.Connection,
    for_handle: str,
    limit: Optional[int] = None,
    offset: int = 0
) -> list[Thread]:
    """List threads ordered by last activity (most recent first).

    Args:
        conn: Database connection
        for_handle: Agent handle requesting access (for filtering)
        limit: Maximum number of threads to return
        offset: Number of threads to skip

    Returns:
        List of Thread objects (filtered by participant or all if admin)
    """
    # Check if user is admin
    if is_admin(conn, for_handle):
        # Admin sees all threads
        query = "SELECT * FROM threads ORDER BY last_activity_at DESC"
        params = []
    else:
        # Non-admin sees only threads they participate in
        query = "SELECT * FROM threads WHERE participant_handles LIKE ? ORDER BY last_activity_at DESC"
        params = [f'%"{for_handle}"%']

    if limit is not None:
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    cursor = conn.execute(query, params)
    threads = []
    for row in cursor:
        threads.append(Thread(
            thread_id=row["thread_id"],
            subject=row["subject"],
            participant_handles=_decode_list(row["participant_handles"]),
            created_at=_iso_to_datetime(row["created_at"]),
            last_activity_at=_iso_to_datetime(row["last_activity_at"]),
            metadata=json.loads(row["metadata"]) if row["metadata"] else None
        ))
    return threads


# Message operations

def insert_message(
    conn: sqlite3.Connection,
    message_id: str,
    thread_id: str,
    from_handle: str,
    to_handles: list[str],
    subject: str,
    body: str,
    created_at: datetime,
    in_reply_to: Optional[str] = None,
    tags: Optional[list[str]] = None
) -> None:
    """Insert a new message.

    Args:
        conn: Database connection
        message_id: Unique message identifier
        thread_id: Thread this message belongs to
        from_handle: Sender's handle
        to_handles: List of recipient handles
        subject: Message subject
        body: Message body
        created_at: Message creation timestamp
        in_reply_to: Optional message ID this is replying to
        tags: Optional list of tags
    """
    with transaction(conn):
        conn.execute(
            """
            INSERT INTO messages
            (message_id, thread_id, from_handle, to_handles, subject, body, created_at, in_reply_to, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                message_id,
                thread_id,
                from_handle,
                _encode_list(to_handles),
                subject,
                body,
                _datetime_to_iso(created_at),
                in_reply_to,
                _encode_list(tags) if tags else None
            )
        )


def get_message(conn: sqlite3.Connection, message_id: str, for_handle: str) -> Optional[Message]:
    """Get a message by ID.

    Args:
        conn: Database connection
        message_id: Message identifier
        for_handle: Agent handle requesting access (for authorization check)

    Returns:
        Message object or None if not found or access denied
    """
    cursor = conn.execute(
        "SELECT * FROM messages WHERE message_id = ?",
        (message_id,)
    )
    row = cursor.fetchone()
    if not row:
        return None

    # Check thread access authorization
    thread = get_thread(conn, row["thread_id"], for_handle)
    if not thread:
        return None

    return Message(
        message_id=row["message_id"],
        thread_id=row["thread_id"],
        from_handle=row["from_handle"],
        to_handles=_decode_list(row["to_handles"]),
        subject=row["subject"],
        body=row["body"],
        created_at=_iso_to_datetime(row["created_at"]),
        in_reply_to=row["in_reply_to"],
        tags=_decode_list(row["tags"]) if row["tags"] else None
    )


def list_messages(
    conn: sqlite3.Connection,
    for_handle: str,
    thread_id: Optional[str] = None,
    limit: Optional[int] = None,
    offset: int = 0
) -> list[Message]:
    """List messages, optionally filtered by thread.

    Args:
        conn: Database connection
        for_handle: Agent handle requesting access (for authorization check)
        thread_id: Optional thread ID to filter by
        limit: Maximum number of messages to return
        offset: Number of messages to skip

    Returns:
        List of Message objects ordered by created_at ASC (oldest first) if thread_id provided,
        or DESC (newest first) otherwise. Filtered by participant access.
    """
    if thread_id:
        # When filtering by specific thread, verify access first
        thread = get_thread(conn, thread_id, for_handle)
        if not thread:
            return []

        query = "SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC"
        params = [thread_id]
    else:
        # When listing all messages, filter by threads user has access to
        if is_admin(conn, for_handle):
            # Admin sees all messages
            query = "SELECT * FROM messages ORDER BY created_at DESC"
            params = []
        else:
            # Non-admin sees only messages in threads they participate in
            query = """
                SELECT m.* FROM messages m
                JOIN threads t ON m.thread_id = t.thread_id
                WHERE t.participant_handles LIKE ?
                ORDER BY m.created_at DESC
            """
            params = [f'%"{for_handle}"%']

    if limit is not None:
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    cursor = conn.execute(query, params)
    messages = []
    for row in cursor:
        messages.append(Message(
            message_id=row["message_id"],
            thread_id=row["thread_id"],
            from_handle=row["from_handle"],
            to_handles=_decode_list(row["to_handles"]),
            subject=row["subject"],
            body=row["body"],
            created_at=_iso_to_datetime(row["created_at"]),
            in_reply_to=row["in_reply_to"],
            tags=_decode_list(row["tags"]) if row["tags"] else None
        ))
    return messages


def search_messages(
    conn: sqlite3.Connection,
    for_handle: str,
    query: str,
    in_subject: bool = True,
    in_body: bool = True,
    from_handle: Optional[str] = None,
    to_handle: Optional[str] = None,
    limit: Optional[int] = None
) -> list[Message]:
    """Search messages by subject and/or body with optional filters.

    Args:
        conn: Database connection
        for_handle: Agent handle requesting access (for filtering)
        query: Search query string
        in_subject: Search in subject field (default True)
        in_body: Search in body field (default True)
        from_handle: Filter by sender handle (optional)
        to_handle: Filter by recipient handle (optional)
        limit: Maximum number of messages to return

    Returns:
        List of Message objects matching the query (filtered by participant access)
    """
    search_pattern = f"%{query}%"

    # Build WHERE clause dynamically
    where_clauses = []
    params = []

    # Search text conditions
    if in_subject or in_body:
        text_conditions = []
        if in_subject:
            text_conditions.append("m.subject LIKE ?")
            params.append(search_pattern)
        if in_body:
            text_conditions.append("m.body LIKE ?")
            params.append(search_pattern)
        where_clauses.append(f"({' OR '.join(text_conditions)})")

    # Filter by sender
    if from_handle is not None:
        where_clauses.append("m.from_handle = ?")
        params.append(from_handle)

    # Filter by recipient (JSON array contains)
    if to_handle is not None:
        where_clauses.append("m.to_handles LIKE ?")
        params.append(f'%"{to_handle}"%')

    # Participant filtering (unless admin)
    if not is_admin(conn, for_handle):
        where_clauses.append("t.participant_handles LIKE ?")
        params.append(f'%"{for_handle}"%')

    # Construct SQL - JOIN with threads for participant filtering
    sql = """
        SELECT m.* FROM messages m
        JOIN threads t ON m.thread_id = t.thread_id
    """
    if where_clauses:
        sql += " WHERE " + " AND ".join(where_clauses)
    sql += " ORDER BY m.created_at DESC"

    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)

    cursor = conn.execute(sql, params)
    messages = []
    for row in cursor:
        messages.append(Message(
            message_id=row["message_id"],
            thread_id=row["thread_id"],
            from_handle=row["from_handle"],
            to_handles=_decode_list(row["to_handles"]),
            subject=row["subject"],
            body=row["body"],
            created_at=_iso_to_datetime(row["created_at"]),
            in_reply_to=row["in_reply_to"],
            tags=_decode_list(row["tags"]) if row["tags"] else None
        ))
    return messages


# Address book operations

def insert_address_book_entry(
    conn: sqlite3.Connection,
    handle: str,
    display_name: Optional[str],
    description: Optional[str],
    created_at: datetime,
    updated_by: str,
    tags: Optional[list[str]] = None
) -> None:
    """Insert a new address book entry.

    Args:
        conn: Database connection
        handle: Agent handle
        display_name: Optional display name
        description: Optional description
        tags: Optional list of tags for categorization
        created_at: Entry creation timestamp
        updated_by: Handle of agent creating this entry
    """
    with transaction(conn):
        conn.execute(
            """
            INSERT INTO address_book (handle, display_name, description, tags, is_active, created_at, updated_at, updated_by, version)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, 1)
            """,
            (handle, display_name, description, _encode_list(tags) if tags else None, _datetime_to_iso(created_at), _datetime_to_iso(created_at), updated_by)
        )


def update_address_book_entry(
    conn: sqlite3.Connection,
    handle: str,
    display_name: Optional[str],
    description: Optional[str],
    is_active: bool,
    updated_at: datetime,
    updated_by: str,
    expected_version: int,
    tags: Optional[list[str]] = None
) -> bool:
    """Update an address book entry with optimistic locking.

    Args:
        conn: Database connection
        handle: Agent handle
        display_name: New display name
        description: New description
        tags: New list of tags
        is_active: New active status
        updated_at: Update timestamp
        updated_by: Handle of agent updating this entry
        expected_version: Expected current version for optimistic locking

    Returns:
        True if update succeeded, False if version mismatch
    """
    with transaction(conn):
        cursor = conn.execute(
            """
            UPDATE address_book
            SET display_name = ?, description = ?, tags = ?, is_active = ?, updated_at = ?, updated_by = ?, version = version + 1
            WHERE handle = ? AND version = ?
            """,
            (display_name, description, _encode_list(tags) if tags else None, 1 if is_active else 0, _datetime_to_iso(updated_at), updated_by, handle, expected_version)
        )
        return cursor.rowcount > 0


def get_address_book_entry(
    conn: sqlite3.Connection,
    handle: str
) -> Optional[AddressBookEntry]:
    """Get an address book entry by handle.

    Args:
        conn: Database connection
        handle: Agent handle

    Returns:
        AddressBookEntry object or None if not found
    """
    cursor = conn.execute(
        "SELECT * FROM address_book WHERE handle = ?",
        (handle,)
    )
    row = cursor.fetchone()
    if not row:
        return None

    return AddressBookEntry(
        handle=row["handle"],
        display_name=row["display_name"],
        description=row["description"],
        tags=_decode_list(row["tags"]) if row["tags"] else None,
        is_active=bool(row["is_active"]),
        created_at=_iso_to_datetime(row["created_at"]),
        updated_at=_iso_to_datetime(row["updated_at"]),
        updated_by=row["updated_by"],
        version=row["version"]
    )


def list_address_book_entries(
    conn: sqlite3.Connection,
    active_only: bool = True
) -> list[AddressBookEntry]:
    """List address book entries.

    Args:
        conn: Database connection
        active_only: If True, only return active entries

    Returns:
        List of AddressBookEntry objects
    """
    if active_only:
        query = "SELECT * FROM address_book WHERE is_active = 1 ORDER BY handle"
    else:
        query = "SELECT * FROM address_book ORDER BY handle"

    cursor = conn.execute(query)
    entries = []
    for row in cursor:
        entries.append(AddressBookEntry(
            handle=row["handle"],
            display_name=row["display_name"],
            description=row["description"],
            tags=_decode_list(row["tags"]) if row["tags"] else None,
            is_active=bool(row["is_active"]),
            created_at=_iso_to_datetime(row["created_at"]),
            updated_at=_iso_to_datetime(row["updated_at"]),
            updated_by=row["updated_by"],
            version=row["version"]
        ))
    return entries


def search_address_book_entries(
    conn: sqlite3.Connection,
    query: Optional[str] = None,
    tags: Optional[list[str]] = None,
    active_only: bool = True
) -> list[AddressBookEntry]:
    """Search address book entries by handle, display name, description, or tags.

    Args:
        conn: Database connection
        query: Search query string (searches handle, display_name, description)
        tags: List of tags to filter by (matches if entry has ANY of these tags)
        active_only: If True, only search active entries

    Returns:
        List of AddressBookEntry objects matching the criteria
    """
    where_clauses = []
    params = []

    # Active filter
    if active_only:
        where_clauses.append("is_active = 1")

    # Text search
    if query:
        search_pattern = f"%{query}%"
        where_clauses.append("(handle LIKE ? OR display_name LIKE ? OR description LIKE ?)")
        params.extend([search_pattern, search_pattern, search_pattern])

    # Tag filter (match if entry has ANY of the specified tags)
    if tags:
        tag_conditions = []
        for tag in tags:
            tag_conditions.append("tags LIKE ?")
            params.append(f'%"{tag}"%')
        where_clauses.append(f"({' OR '.join(tag_conditions)})")

    # Construct SQL
    sql = "SELECT * FROM address_book"
    if where_clauses:
        sql += " WHERE " + " AND ".join(where_clauses)
    sql += " ORDER BY handle"

    cursor = conn.execute(sql, params)
    entries = []
    for row in cursor:
        entries.append(AddressBookEntry(
            handle=row["handle"],
            display_name=row["display_name"],
            description=row["description"],
            tags=_decode_list(row["tags"]) if row["tags"] else None,
            is_active=bool(row["is_active"]),
            created_at=_iso_to_datetime(row["created_at"]),
            updated_at=_iso_to_datetime(row["updated_at"]),
            updated_by=row["updated_by"],
            version=row["version"]
        ))
    return entries


# Audit log operations

def insert_audit_event(
    conn: sqlite3.Connection,
    event_id: str,
    event_type: str,
    actor_handle: str,
    target_handle: Optional[str],
    details: Optional[str],
    timestamp: datetime
) -> None:
    """Insert an audit log event.

    Args:
        conn: Database connection
        event_id: Unique event identifier
        event_type: Type of event
        actor_handle: Handle of the agent who performed the action
        target_handle: Optional handle of the target agent
        details: Optional JSON details
        timestamp: Event timestamp
    """
    with transaction(conn):
        conn.execute(
            """
            INSERT INTO audit_log (event_id, event_type, actor_handle, target_handle, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (event_id, event_type, actor_handle, target_handle, details, _datetime_to_iso(timestamp))
        )


def list_audit_events(
    conn: sqlite3.Connection,
    target_handle: Optional[str] = None,
    limit: Optional[int] = None
) -> list[AuditEvent]:
    """List audit events, optionally filtered by target handle.

    Args:
        conn: Database connection
        target_handle: Optional target handle to filter by
        limit: Maximum number of events to return

    Returns:
        List of AuditEvent objects ordered by timestamp DESC (most recent first)
    """
    if target_handle:
        query = "SELECT * FROM audit_log WHERE target_handle = ? ORDER BY timestamp DESC"
        params = [target_handle]
    else:
        query = "SELECT * FROM audit_log ORDER BY timestamp DESC"
        params = []

    if limit is not None:
        query += " LIMIT ?"
        params.append(limit)

    cursor = conn.execute(query, params)
    events = []
    for row in cursor:
        events.append(AuditEvent(
            event_id=row["event_id"],
            event_type=row["event_type"],
            actor_handle=row["actor_handle"],
            target_handle=row["target_handle"],
            details=row["details"],
            timestamp=_iso_to_datetime(row["timestamp"])
        ))
    return events
