"""Admin endpoints for viewing all data (requires admin tag)."""

import sqlite3
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel

from agcom.models import AgentIdentity
from agcom.storage import (
    is_admin,
    list_threads as storage_list_threads,
    list_messages as storage_list_messages,
    list_address_book_entries,
    get_thread as storage_get_thread,
)
from agcom_api.dependencies import get_db_connection, get_current_identity
from agcom_api.models.responses import (
    ThreadResponse,
    MessageResponse,
    AddressBookEntryResponse,
    thread_to_response,
    message_to_response,
    address_book_entry_to_response,
)


router = APIRouter(prefix="/api/admin", tags=["Admin"])


# Response models

class AdminThreadListResponse(BaseModel):
    """Response for admin thread list."""
    threads: list[ThreadResponse]
    count: int


class AdminMessageListResponse(BaseModel):
    """Response for admin message list."""
    messages: list[MessageResponse]
    count: int


class AdminThreadMessagesResponse(BaseModel):
    """Response for thread with all messages."""
    thread: ThreadResponse
    messages: list[MessageResponse]


class AdminUserListResponse(BaseModel):
    """Response for admin user list."""
    users: list[AddressBookEntryResponse]
    count: int


class AdminStatsResponse(BaseModel):
    """Response for admin stats."""
    threads: int
    messages: int
    users: int


# Dependency to check admin status

def require_admin(
    conn: Annotated[sqlite3.Connection, Depends(get_db_connection)],
    identity: Annotated[AgentIdentity, Depends(get_current_identity)]
) -> tuple[sqlite3.Connection, AgentIdentity]:
    """Require admin privileges for the current user.

    Args:
        conn: Database connection
        identity: Authenticated agent identity

    Returns:
        Tuple of (conn, identity) if admin

    Raises:
        HTTPException: 403 if not admin
    """
    if not is_admin(conn, identity.handle):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "forbidden", "message": "Admin privileges required"}
        )
    return conn, identity


# Endpoints

@router.get("/threads", response_model=AdminThreadListResponse)
def admin_list_threads(
    admin_ctx: Annotated[tuple[sqlite3.Connection, AgentIdentity], Depends(require_admin)],
    limit: int = Query(50, description="Maximum threads to return"),
    offset: int = Query(0, description="Number of threads to skip")
):
    """List all threads (admin only).

    Args:
        admin_ctx: Admin context (conn, identity)
        limit: Max threads to return
        offset: Threads to skip

    Returns:
        All threads with count
    """
    conn, identity = admin_ctx

    # Admin sees all threads - use storage layer directly
    cursor = conn.execute(
        "SELECT * FROM threads ORDER BY last_activity_at DESC LIMIT ? OFFSET ?",
        (limit, offset)
    )

    from agcom.storage import _decode_list, _iso_to_datetime
    import json
    from agcom.models import Thread

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

    return AdminThreadListResponse(
        threads=[thread_to_response(t) for t in threads],
        count=len(threads)
    )


@router.get("/messages", response_model=AdminMessageListResponse)
def admin_list_messages(
    admin_ctx: Annotated[tuple[sqlite3.Connection, AgentIdentity], Depends(require_admin)],
    limit: int = Query(50, description="Maximum messages to return"),
    offset: int = Query(0, description="Number of messages to skip"),
    since_id: Optional[str] = Query(None, description="Only return messages after this ID")
):
    """List all messages (admin only).

    Args:
        admin_ctx: Admin context (conn, identity)
        limit: Max messages to return
        offset: Messages to skip
        since_id: Only return messages newer than this ID

    Returns:
        All messages with count
    """
    conn, identity = admin_ctx

    from agcom.storage import _decode_list, _iso_to_datetime
    from agcom.models import Message

    # Build query
    if since_id:
        # Get the created_at of the since_id message first
        cursor = conn.execute(
            "SELECT created_at FROM messages WHERE message_id = ?",
            (since_id,)
        )
        row = cursor.fetchone()
        if row:
            since_ts = row["created_at"]
            cursor = conn.execute(
                """SELECT * FROM messages
                   WHERE created_at > ?
                   ORDER BY created_at DESC
                   LIMIT ? OFFSET ?""",
                (since_ts, limit, offset)
            )
        else:
            # since_id not found, return empty
            return AdminMessageListResponse(messages=[], count=0)
    else:
        cursor = conn.execute(
            "SELECT * FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset)
        )

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

    return AdminMessageListResponse(
        messages=[message_to_response(m) for m in messages],
        count=len(messages)
    )


@router.get("/threads/{thread_id}/messages", response_model=AdminThreadMessagesResponse)
def admin_get_thread_messages(
    thread_id: str,
    admin_ctx: Annotated[tuple[sqlite3.Connection, AgentIdentity], Depends(require_admin)]
):
    """Get a thread with all its messages (admin only).

    Args:
        thread_id: Thread identifier
        admin_ctx: Admin context (conn, identity)

    Returns:
        Thread with all messages
    """
    conn, identity = admin_ctx

    from agcom.storage import _decode_list, _iso_to_datetime
    from agcom.models import Thread, Message
    import json

    # Get thread
    cursor = conn.execute(
        "SELECT * FROM threads WHERE thread_id = ?",
        (thread_id,)
    )
    row = cursor.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "resource": f"thread {thread_id}"}
        )

    thread = Thread(
        thread_id=row["thread_id"],
        subject=row["subject"],
        participant_handles=_decode_list(row["participant_handles"]),
        created_at=_iso_to_datetime(row["created_at"]),
        last_activity_at=_iso_to_datetime(row["last_activity_at"]),
        metadata=json.loads(row["metadata"]) if row["metadata"] else None
    )

    # Get messages
    cursor = conn.execute(
        "SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC",
        (thread_id,)
    )

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

    return AdminThreadMessagesResponse(
        thread=thread_to_response(thread),
        messages=[message_to_response(m) for m in messages]
    )


@router.get("/users", response_model=AdminUserListResponse)
def admin_list_users(
    admin_ctx: Annotated[tuple[sqlite3.Connection, AgentIdentity], Depends(require_admin)]
):
    """List all users (from address book and message senders).

    Args:
        admin_ctx: Admin context (conn, identity)

    Returns:
        All users with count
    """
    conn, identity = admin_ctx

    # Get address book entries
    entries = list_address_book_entries(conn, active_only=False)
    known_handles = {e.handle for e in entries}

    # Also get unique handles from messages not in address book
    cursor = conn.execute(
        "SELECT DISTINCT from_handle FROM messages WHERE from_handle NOT IN ({})".format(
            ','.join('?' * len(known_handles)) if known_handles else "''"
        ),
        tuple(known_handles) if known_handles else ()
    )

    from agcom.models import AddressBookEntry
    from datetime import datetime

    # Add message senders as synthetic entries
    now = datetime.now()
    for row in cursor:
        handle = row["from_handle"]
        entries.append(AddressBookEntry(
            handle=handle,
            display_name=handle,
            description=None,
            tags=None,
            is_active=True,
            created_at=now,
            updated_at=now,
            updated_by="system",
            version=0
        ))

    # Sort by handle
    entries.sort(key=lambda e: e.handle.lower())

    return AdminUserListResponse(
        users=[address_book_entry_to_response(e) for e in entries],
        count=len(entries)
    )


@router.get("/stats", response_model=AdminStatsResponse)
def admin_stats(
    admin_ctx: Annotated[tuple[sqlite3.Connection, AgentIdentity], Depends(require_admin)]
):
    """Get system statistics (admin only).

    Args:
        admin_ctx: Admin context (conn, identity)

    Returns:
        Thread, message, and user counts
    """
    conn, identity = admin_ctx

    # Count threads
    cursor = conn.execute("SELECT COUNT(*) as count FROM threads")
    threads = cursor.fetchone()["count"]

    # Count messages
    cursor = conn.execute("SELECT COUNT(*) as count FROM messages")
    messages = cursor.fetchone()["count"]

    # Count users
    cursor = conn.execute("SELECT COUNT(*) as count FROM address_book WHERE is_active = 1")
    users = cursor.fetchone()["count"]

    return AdminStatsResponse(
        threads=threads,
        messages=messages,
        users=users
    )
