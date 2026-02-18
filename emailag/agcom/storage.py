"""SQLite storage layer for the agcom library."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .models import AddressBookEntry, AuditEvent, Message, Thread

_SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    recipients TEXT NOT NULL,  -- JSON array
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
    reply_to TEXT,
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    participants TEXT NOT NULL,  -- JSON array
    created_at TEXT NOT NULL,
    last_activity TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',  -- JSON object
    archived INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_threads_last_activity ON threads(last_activity);

CREATE TABLE IF NOT EXISTS address_book_entries (
    handle TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
    active INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    target TEXT,
    details TEXT NOT NULL DEFAULT '{}',  -- JSON object
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);
"""


def _dt_to_str(dt: datetime) -> str:
    return dt.isoformat()


def _str_to_dt(s: str) -> datetime:
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class Storage:
    """SQLite-backed storage for agcom data."""

    def __init__(self, db_path: str | Path):
        self.db_path = str(db_path)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        conn = self._connect()
        try:
            conn.executescript(_SCHEMA)
            conn.commit()
        finally:
            conn.close()

    # -- Messages --

    def save_message(self, msg: Message) -> None:
        conn = self._connect()
        try:
            conn.execute(
                "INSERT INTO messages (id, thread_id, sender, recipients, subject, body, tags, reply_to, timestamp) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    msg.id,
                    msg.thread_id,
                    msg.sender,
                    msg.recipients_json(),
                    msg.subject,
                    msg.body,
                    msg.tags_json(),
                    msg.reply_to,
                    _dt_to_str(msg.timestamp),
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def get_message(self, message_id: str) -> Message | None:
        conn = self._connect()
        try:
            row = conn.execute("SELECT * FROM messages WHERE id = ?", (message_id,)).fetchone()
            return self._row_to_message(row) if row else None
        finally:
            conn.close()

    def list_messages(
        self, thread_id: str | None = None, limit: int = 50, offset: int = 0
    ) -> list[Message]:
        conn = self._connect()
        try:
            if thread_id:
                rows = conn.execute(
                    "SELECT * FROM messages WHERE thread_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?",
                    (thread_id, limit, offset),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM messages ORDER BY timestamp DESC LIMIT ? OFFSET ?",
                    (limit, offset),
                ).fetchall()
            return [self._row_to_message(r) for r in rows]
        finally:
            conn.close()

    def search_messages(
        self,
        query: str,
        sender: str | None = None,
        recipient: str | None = None,
        limit: int = 50,
    ) -> list[Message]:
        conn = self._connect()
        try:
            sql = "SELECT * FROM messages WHERE (subject LIKE ? OR body LIKE ?)"
            params: list = [f"%{query}%", f"%{query}%"]

            if sender:
                sql += " AND sender = ?"
                params.append(sender)
            if recipient:
                sql += " AND recipients LIKE ?"
                params.append(f'%"{recipient}"%')

            sql += " ORDER BY timestamp DESC LIMIT ?"
            params.append(limit)

            rows = conn.execute(sql, params).fetchall()
            return [self._row_to_message(r) for r in rows]
        finally:
            conn.close()

    def get_messages_since(self, since_id: str) -> list[Message]:
        """Get messages with IDs lexicographically greater than since_id (ULID ordering)."""
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT * FROM messages WHERE id > ? ORDER BY id ASC",
                (since_id,),
            ).fetchall()
            return [self._row_to_message(r) for r in rows]
        finally:
            conn.close()

    def _row_to_message(self, row: sqlite3.Row) -> Message:
        return Message(
            id=row["id"],
            thread_id=row["thread_id"],
            sender=row["sender"],
            recipients=json.loads(row["recipients"]),
            subject=row["subject"],
            body=row["body"],
            tags=json.loads(row["tags"]),
            reply_to=row["reply_to"],
            timestamp=_str_to_dt(row["timestamp"]),
        )

    # -- Threads --

    def save_thread(self, thread: Thread) -> None:
        conn = self._connect()
        try:
            conn.execute(
                "INSERT INTO threads (id, subject, participants, created_at, last_activity, metadata, archived) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    thread.id,
                    thread.subject,
                    thread.participants_json(),
                    _dt_to_str(thread.created_at),
                    _dt_to_str(thread.last_activity),
                    thread.metadata_json(),
                    1 if thread.archived else 0,
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def get_thread(self, thread_id: str) -> Thread | None:
        conn = self._connect()
        try:
            row = conn.execute("SELECT * FROM threads WHERE id = ?", (thread_id,)).fetchone()
            return self._row_to_thread(row) if row else None
        finally:
            conn.close()

    def list_threads(
        self,
        participant: str | None = None,
        limit: int = 50,
        offset: int = 0,
        include_archived: bool = False,
    ) -> list[Thread]:
        conn = self._connect()
        try:
            sql = "SELECT * FROM threads WHERE 1=1"
            params: list = []

            if not include_archived:
                sql += " AND archived = 0"

            if participant:
                sql += " AND participants LIKE ?"
                params.append(f'%"{participant}"%')

            sql += " ORDER BY last_activity DESC LIMIT ? OFFSET ?"
            params.extend([limit, offset])

            rows = conn.execute(sql, params).fetchall()
            return [self._row_to_thread(r) for r in rows]
        finally:
            conn.close()

    def update_thread(self, thread: Thread) -> None:
        """Update an existing thread (participants, last_activity, metadata, archived)."""
        conn = self._connect()
        try:
            conn.execute(
                "UPDATE threads SET participants = ?, last_activity = ?, metadata = ?, archived = ? WHERE id = ?",
                (
                    thread.participants_json(),
                    _dt_to_str(thread.last_activity),
                    thread.metadata_json(),
                    1 if thread.archived else 0,
                    thread.id,
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def update_thread_metadata(self, thread_id: str, key: str, value: str) -> None:
        conn = self._connect()
        try:
            row = conn.execute("SELECT metadata FROM threads WHERE id = ?", (thread_id,)).fetchone()
            if not row:
                raise ValueError(f"Thread not found: {thread_id}")
            metadata = json.loads(row["metadata"])
            metadata[key] = value
            conn.execute(
                "UPDATE threads SET metadata = ? WHERE id = ?",
                (json.dumps(metadata), thread_id),
            )
            conn.commit()
        finally:
            conn.close()

    def remove_thread_metadata(self, thread_id: str, key: str) -> None:
        conn = self._connect()
        try:
            row = conn.execute("SELECT metadata FROM threads WHERE id = ?", (thread_id,)).fetchone()
            if not row:
                raise ValueError(f"Thread not found: {thread_id}")
            metadata = json.loads(row["metadata"])
            metadata.pop(key, None)
            conn.execute(
                "UPDATE threads SET metadata = ? WHERE id = ?",
                (json.dumps(metadata), thread_id),
            )
            conn.commit()
        finally:
            conn.close()

    def archive_thread(self, thread_id: str) -> None:
        conn = self._connect()
        try:
            conn.execute("UPDATE threads SET archived = 1 WHERE id = ?", (thread_id,))
            conn.commit()
        finally:
            conn.close()

    def unarchive_thread(self, thread_id: str) -> None:
        conn = self._connect()
        try:
            conn.execute("UPDATE threads SET archived = 0 WHERE id = ?", (thread_id,))
            conn.commit()
        finally:
            conn.close()

    def _row_to_thread(self, row: sqlite3.Row) -> Thread:
        return Thread(
            id=row["id"],
            subject=row["subject"],
            participants=json.loads(row["participants"]),
            created_at=_str_to_dt(row["created_at"]),
            last_activity=_str_to_dt(row["last_activity"]),
            metadata=json.loads(row["metadata"]),
            archived=bool(row["archived"]),
        )

    # -- Address Book --

    def save_contact(self, entry: AddressBookEntry) -> None:
        conn = self._connect()
        try:
            conn.execute(
                "INSERT INTO address_book_entries (handle, display_name, description, tags, active, version, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    entry.handle,
                    entry.display_name,
                    entry.description,
                    entry.tags_json(),
                    1 if entry.active else 0,
                    entry.version,
                    _dt_to_str(entry.created_at),
                    _dt_to_str(entry.updated_at),
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def get_contact(self, handle: str) -> AddressBookEntry | None:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM address_book_entries WHERE handle = ?", (handle,)
            ).fetchone()
            return self._row_to_contact(row) if row else None
        finally:
            conn.close()

    def list_contacts(
        self,
        active_only: bool = True,
        search: str | None = None,
        tag: str | None = None,
    ) -> list[AddressBookEntry]:
        conn = self._connect()
        try:
            sql = "SELECT * FROM address_book_entries WHERE 1=1"
            params: list = []

            if active_only:
                sql += " AND active = 1"

            if search:
                sql += " AND (handle LIKE ? OR display_name LIKE ? OR description LIKE ?)"
                params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

            if tag:
                sql += " AND tags LIKE ?"
                params.append(f'%"{tag}"%')

            sql += " ORDER BY handle"
            rows = conn.execute(sql, params).fetchall()
            return [self._row_to_contact(r) for r in rows]
        finally:
            conn.close()

    def update_contact(self, handle: str, version: int, **fields) -> AddressBookEntry:
        """Update a contact with optimistic locking."""
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM address_book_entries WHERE handle = ?", (handle,)
            ).fetchone()
            if not row:
                raise ValueError(f"Contact not found: {handle}")

            current = self._row_to_contact(row)
            if current.version != version:
                raise ValueError(
                    f"Version conflict for '{handle}': expected {version}, got {current.version}"
                )

            for key, value in fields.items():
                if key == "tags":
                    current.tags = value
                elif key == "display_name":
                    current.display_name = value
                elif key == "description":
                    current.description = value
                elif key == "active":
                    current.active = value
                else:
                    raise ValueError(f"Unknown field: {key}")

            current.version += 1
            current.updated_at = datetime.now(timezone.utc)

            conn.execute(
                "UPDATE address_book_entries SET display_name = ?, description = ?, tags = ?, "
                "active = ?, version = ?, updated_at = ? WHERE handle = ? AND version = ?",
                (
                    current.display_name,
                    current.description,
                    current.tags_json(),
                    1 if current.active else 0,
                    current.version,
                    _dt_to_str(current.updated_at),
                    handle,
                    version,
                ),
            )
            conn.commit()
            return current
        finally:
            conn.close()

    def deactivate_contact(self, handle: str, version: int) -> AddressBookEntry:
        """Soft-delete a contact."""
        return self.update_contact(handle, version, active=False)

    def _row_to_contact(self, row: sqlite3.Row) -> AddressBookEntry:
        return AddressBookEntry(
            handle=row["handle"],
            display_name=row["display_name"],
            description=row["description"],
            tags=json.loads(row["tags"]),
            active=bool(row["active"]),
            version=row["version"],
            created_at=_str_to_dt(row["created_at"]),
            updated_at=_str_to_dt(row["updated_at"]),
        )

    # -- Audit Events --

    def save_audit_event(self, event: AuditEvent) -> None:
        conn = self._connect()
        try:
            conn.execute(
                "INSERT INTO audit_events (id, event_type, actor, target, details, timestamp) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    event.id,
                    event.event_type,
                    event.actor,
                    event.target,
                    event.details_json(),
                    _dt_to_str(event.timestamp),
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def list_audit_events(
        self,
        event_type: str | None = None,
        actor: str | None = None,
        target: str | None = None,
        limit: int = 50,
    ) -> list[AuditEvent]:
        conn = self._connect()
        try:
            sql = "SELECT * FROM audit_events WHERE 1=1"
            params: list = []

            if event_type:
                sql += " AND event_type = ?"
                params.append(event_type)
            if actor:
                sql += " AND actor = ?"
                params.append(actor)
            if target:
                sql += " AND target = ?"
                params.append(target)

            sql += " ORDER BY timestamp DESC LIMIT ?"
            params.append(limit)

            rows = conn.execute(sql, params).fetchall()
            return [self._row_to_audit_event(r) for r in rows]
        finally:
            conn.close()

    def _row_to_audit_event(self, row: sqlite3.Row) -> AuditEvent:
        return AuditEvent(
            id=row["id"],
            event_type=row["event_type"],
            actor=row["actor"],
            target=row["target"],
            details=json.loads(row["details"]),
            timestamp=_str_to_dt(row["timestamp"]),
        )

    # -- Stats --

    def get_stats(self) -> dict:
        conn = self._connect()
        try:
            thread_count = conn.execute("SELECT COUNT(*) FROM threads").fetchone()[0]
            message_count = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
            user_count = conn.execute(
                "SELECT COUNT(*) FROM address_book_entries WHERE active = 1"
            ).fetchone()[0]
            return {
                "thread_count": thread_count,
                "message_count": message_count,
                "user_count": user_count,
            }
        finally:
            conn.close()
