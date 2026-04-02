"""SQLite database for emcom-server. All SQL centralized here."""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

SEED_NAMES = [
    "alice", "bob", "carol", "dave", "eve", "frank", "grace", "heidi",
    "ivan", "judy", "karl", "lara", "milo", "nina", "oscar", "petra",
    "quinn", "rosa", "sam", "tara", "uma", "vera", "walt", "xena",
    "yuri", "zara", "amber", "blake", "cedar", "delta", "ember", "frost",
    "gale", "haze", "iris", "jade", "kite", "lux", "moss", "nyx",
    "opal", "pine", "rain", "sage", "thorn", "vale", "wren", "ash",
    "cleo", "dune",
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS identities (
    name TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    registered_at TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS name_pool (
    name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    recipients TEXT NOT NULL,  -- JSON list
    cc TEXT NOT NULL DEFAULT '[]',  -- JSON list
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    in_reply_to TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
    email_id TEXT NOT NULL,
    owner TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (email_id, owner, tag)
);

CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender);
CREATE INDEX IF NOT EXISTS idx_emails_created ON emails(created_at);
CREATE INDEX IF NOT EXISTS idx_tags_owner_tag ON tags(owner, tag);
CREATE INDEX IF NOT EXISTS idx_tags_email_owner ON tags(email_id, owner);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_email(row: sqlite3.Row) -> dict:
    """Convert a raw email row to API dict (parse JSON fields)."""
    email = dict(row)
    email["to"] = json.loads(email.pop("recipients"))
    email["cc"] = json.loads(email["cc"])
    return email


def _attach_tags(conn: sqlite3.Connection, emails: list[dict], owner: str) -> list[dict]:
    """Batch-fetch tags for a list of emails in a single query (eliminates N+1)."""
    if not emails:
        return emails
    ids = [e["id"] for e in emails]
    placeholders = ",".join("?" * len(ids))
    tag_rows = conn.execute(
        f"SELECT email_id, tag FROM tags WHERE owner=? AND email_id IN ({placeholders})",
        [owner] + ids,
    ).fetchall()
    tag_map: dict[str, list[str]] = {}
    for r in tag_rows:
        tag_map.setdefault(r["email_id"], []).append(r["tag"])
    for e in emails:
        e["tags"] = tag_map.get(e["id"], [])
    return emails


class Database:
    def __init__(self, db_path: str | Path):
        self.db_path = str(db_path)
        self._local = threading.local()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        """Return a thread-local reusable connection (avoids per-call overhead)."""
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            return conn
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys=ON")
        self._local.conn = conn
        return conn

    def _init_db(self):
        conn = self._connect()
        conn.executescript(SCHEMA)
        # Migration: add location column if missing
        cols = [r[1] for r in conn.execute("PRAGMA table_info(identities)").fetchall()]
        if "location" not in cols:
            conn.execute("ALTER TABLE identities ADD COLUMN location TEXT NOT NULL DEFAULT ''")
            conn.commit()
        # Seed name pool if empty
        count = conn.execute("SELECT COUNT(*) FROM name_pool").fetchone()[0]
        if count == 0:
            conn.executemany(
                "INSERT OR IGNORE INTO name_pool (name) VALUES (?)",
                [(n,) for n in SEED_NAMES],
            )
            conn.commit()

    # --- Identity ---

    def register(self, name: str, description: str, location: str = "") -> dict:
        now = _now()
        conn = self._connect()
        existing = conn.execute("SELECT active FROM identities WHERE name=?", (name,)).fetchone()
        if existing and existing["active"]:
            raise sqlite3.IntegrityError(f"Name '{name}' is already registered")
        if existing:
            conn.execute(
                "UPDATE identities SET description=?, location=?, last_seen=?, active=1 WHERE name=?",
                (description, location, now, name),
            )
        else:
            conn.execute(
                "INSERT INTO identities (name, description, location, registered_at, last_seen, active) VALUES (?, ?, ?, ?, ?, 1)",
                (name, description, location, now, now),
            )
        conn.commit()
        row = conn.execute("SELECT * FROM identities WHERE name=?", (name,)).fetchone()
        return dict(row)

    def force_register(self, name: str, description: str, location: str = "") -> dict:
        """Re-register an existing name (force reclaim)."""
        now = _now()
        conn = self._connect()
        conn.execute(
            "INSERT INTO identities (name, description, location, registered_at, last_seen, active) VALUES (?, ?, ?, ?, ?, 1) "
            "ON CONFLICT(name) DO UPDATE SET description=?, location=?, last_seen=?, active=1",
            (name, description, location, now, now, description, location, now),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM identities WHERE name=?", (name,)).fetchone()
        return dict(row)

    def unregister(self, name: str) -> bool:
        conn = self._connect()
        cur = conn.execute("UPDATE identities SET active=0 WHERE name=? AND active=1", (name,))
        conn.commit()
        return cur.rowcount > 0

    def get_identity(self, name: str) -> dict | None:
        conn = self._connect()
        row = conn.execute("SELECT * FROM identities WHERE name=?", (name,)).fetchone()
        return dict(row) if row else None

    def is_registered(self, name: str) -> bool:
        conn = self._connect()
        row = conn.execute("SELECT 1 FROM identities WHERE name=? COLLATE NOCASE AND active=1", (name,)).fetchone()
        return row is not None

    def resolve_identity_name(self, name: str) -> str | None:
        """Resolve a name case-insensitively. Returns the canonical name or None."""
        conn = self._connect()
        row = conn.execute("SELECT name FROM identities WHERE name=? COLLATE NOCASE AND active=1", (name,)).fetchone()
        return row["name"] if row else None

    def check_registered_and_touch(self, name: str) -> bool:
        """Check registration and update last_seen in one connection hit. Case-insensitive."""
        conn = self._connect()
        cur = conn.execute(
            "UPDATE identities SET last_seen=? WHERE name=? COLLATE NOCASE AND active=1",
            (_now(), name),
        )
        conn.commit()
        return cur.rowcount > 0

    def list_identities(self) -> list[dict]:
        conn = self._connect()
        rows = conn.execute("SELECT * FROM identities WHERE active=1 ORDER BY name").fetchall()
        return [dict(r) for r in rows]

    def update_description(self, name: str, description: str) -> dict | None:
        conn = self._connect()
        conn.execute("UPDATE identities SET description=? WHERE name=? AND active=1", (description, name))
        conn.commit()
        row = conn.execute("SELECT * FROM identities WHERE name=?", (name,)).fetchone()
        return dict(row) if row else None

    def touch_last_seen(self, name: str):
        conn = self._connect()
        conn.execute("UPDATE identities SET last_seen=? WHERE name=?", (_now(), name))
        conn.commit()

    # --- Name Pool ---

    def available_names(self) -> list[str]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT name FROM name_pool WHERE name NOT IN (SELECT name FROM identities WHERE active=1) ORDER BY name"
        ).fetchall()
        return [r["name"] for r in rows]

    def assign_name(self) -> str | None:
        """Pick a random unassigned name from pool."""
        conn = self._connect()
        row = conn.execute(
            "SELECT name FROM name_pool WHERE name NOT IN (SELECT name FROM identities WHERE active=1) ORDER BY RANDOM() LIMIT 1"
        ).fetchone()
        return row["name"] if row else None

    def add_names(self, names: list[str]) -> int:
        conn = self._connect()
        added = 0
        for n in names:
            try:
                conn.execute("INSERT INTO name_pool (name) VALUES (?)", (n,))
                added += 1
            except sqlite3.IntegrityError:
                pass
        conn.commit()
        return added

    # --- Email ---

    def resolve_email_id(self, prefix: str) -> str | None:
        """Resolve a full or prefix email ID to the full UUID. Returns None if not found or ambiguous."""
        return self._resolve_id("emails", "id", prefix)

    def resolve_thread_id(self, prefix: str) -> str | None:
        """Resolve a full or prefix thread ID to the full UUID."""
        return self._resolve_id("emails", "thread_id", prefix)

    def _resolve_id(self, table: str, column: str, prefix: str) -> str | None:
        conn = self._connect()
        row = conn.execute(f"SELECT DISTINCT {column} FROM {table} WHERE {column}=?", (prefix,)).fetchone()
        if row:
            return row[0]
        rows = conn.execute(f"SELECT DISTINCT {column} FROM {table} WHERE {column} LIKE ?", (prefix + "%",)).fetchall()
        if len(rows) == 1:
            return rows[0][0]
        return None

    def create_email(self, sender: str, recipients: list[str], cc: list[str],
                     subject: str, body: str, in_reply_to: str | None = None) -> dict:
        conn = self._connect()
        email_id = str(uuid.uuid4())
        now = _now()

        if in_reply_to:
            parent = conn.execute("SELECT thread_id, subject FROM emails WHERE id=?", (in_reply_to,)).fetchone()
            if parent:
                thread_id = parent["thread_id"]
                if not subject:
                    orig = parent["subject"]
                    subject = orig if orig.startswith("Re: ") else f"Re: {orig}"
            else:
                thread_id = str(uuid.uuid4())
        else:
            thread_id = str(uuid.uuid4())

        conn.execute(
            "INSERT INTO emails (id, thread_id, sender, recipients, cc, subject, body, in_reply_to, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (email_id, thread_id, sender, json.dumps(recipients), json.dumps(cc), subject, body, in_reply_to, now),
        )

        for name in set(recipients + cc):
            if name != sender:
                conn.execute("INSERT OR IGNORE INTO tags (email_id, owner, tag) VALUES (?, ?, 'unread')",
                             (email_id, name))

        conn.commit()
        return {
            "id": email_id, "thread_id": thread_id, "sender": sender,
            "to": recipients, "cc": cc, "subject": subject, "body": body,
            "in_reply_to": in_reply_to, "created_at": now, "tags": [],
        }

    def get_email(self, email_id: str, viewer: str | None = None) -> dict | None:
        conn = self._connect()
        row = conn.execute("SELECT * FROM emails WHERE id=?", (email_id,)).fetchone()
        if not row:
            return None
        email = _parse_email(row)
        tags = []
        if viewer:
            tag_rows = conn.execute(
                "SELECT tag FROM tags WHERE email_id=? AND owner=?", (email_id, viewer)
            ).fetchall()
            tags = [t["tag"] for t in tag_rows]
        email["tags"] = tags
        return email

    def inbox(self, name: str, include_all: bool = False) -> list[dict]:
        """Get received emails. Filters in SQL instead of loading all emails."""
        conn = self._connect()
        like = f'%"{name}"%'
        if include_all:
            rows = conn.execute(
                "SELECT * FROM emails WHERE (recipients LIKE ? OR cc LIKE ?) AND sender != ? "
                "ORDER BY created_at DESC",
                (like, like, name),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM emails WHERE (recipients LIKE ? OR cc LIKE ?) AND sender != ? "
                "AND id NOT IN (SELECT email_id FROM tags WHERE owner = ? AND tag = 'handled') "
                "ORDER BY created_at DESC",
                (like, like, name, name),
            ).fetchall()
        emails = [_parse_email(row) for row in rows]
        return _attach_tags(conn, emails, name)

    def sent(self, name: str) -> list[dict]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM emails WHERE sender=? ORDER BY created_at DESC", (name,)
        ).fetchall()
        emails = [_parse_email(row) for row in rows]
        return _attach_tags(conn, emails, name)

    def all_mail(self, name: str) -> list[dict]:
        """Return all sent and received emails for a user. Filters in SQL."""
        conn = self._connect()
        like = f'%"{name}"%'
        rows = conn.execute(
            "SELECT * FROM emails WHERE sender=? OR recipients LIKE ? OR cc LIKE ? "
            "ORDER BY created_at DESC",
            (name, like, like),
        ).fetchall()
        emails = [_parse_email(row) for row in rows]
        return _attach_tags(conn, emails, name)

    # --- Tags ---

    def add_tags(self, email_id: str, owner: str, tags: list[str]):
        conn = self._connect()
        for tag in tags:
            conn.execute("INSERT OR IGNORE INTO tags (email_id, owner, tag) VALUES (?, ?, ?)",
                         (email_id, owner, tag))
        # handled supersedes pending and unread
        if "handled" in tags:
            conn.execute("DELETE FROM tags WHERE email_id=? AND owner=? AND tag IN ('pending', 'unread')",
                         (email_id, owner))
        conn.commit()

    def remove_tag(self, email_id: str, owner: str, tag: str) -> bool:
        conn = self._connect()
        cur = conn.execute("DELETE FROM tags WHERE email_id=? AND owner=? AND tag=?",
                           (email_id, owner, tag))
        conn.commit()
        return cur.rowcount > 0

    def emails_by_tag(self, owner: str, tag: str) -> list[dict]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT e.* FROM emails e JOIN tags t ON e.id = t.email_id "
            "WHERE t.owner=? AND t.tag=? ORDER BY e.created_at DESC",
            (owner, tag),
        ).fetchall()
        emails = [_parse_email(row) for row in rows]
        return _attach_tags(conn, emails, owner)

    def mark_read(self, email_id: str, name: str):
        self.remove_tag(email_id, name, "unread")

    def mark_read_and_tag(self, email_id: str, name: str, tags: list[str] | None = None):
        """Atomically remove 'unread' and add tags (e.g. 'pending') in one commit."""
        conn = self._connect()
        conn.execute("DELETE FROM tags WHERE email_id=? AND owner=? AND tag='unread'",
                     (email_id, name))
        for tag in (tags or []):
            conn.execute("INSERT OR IGNORE INTO tags (email_id, owner, tag) VALUES (?, ?, ?)",
                         (email_id, name, tag))
        conn.commit()

    # --- Threads ---

    def list_threads(self, name: str) -> list[dict]:
        """List threads using SQL aggregation instead of loading all emails into Python."""
        conn = self._connect()
        like = f'%"{name}"%'
        rows = conn.execute(
            "SELECT thread_id, "
            "  MIN(subject) AS subject, "
            "  COUNT(*) AS email_count, "
            "  MAX(created_at) AS last_activity, "
            "  GROUP_CONCAT(DISTINCT sender) AS senders, "
            "  GROUP_CONCAT(DISTINCT recipients) AS all_recipients, "
            "  GROUP_CONCAT(DISTINCT cc) AS all_cc "
            "FROM emails "
            "WHERE sender=? OR recipients LIKE ? OR cc LIKE ? "
            "GROUP BY thread_id "
            "ORDER BY last_activity DESC",
            (name, like, like),
        ).fetchall()
        result = []
        for row in rows:
            participants = set()
            if row["senders"]:
                participants.update(row["senders"].split(","))
            for json_list in (row["all_recipients"] or "").split(","):
                json_list = json_list.strip()
                if json_list:
                    try:
                        participants.update(json.loads(json_list))
                    except json.JSONDecodeError:
                        pass
            for json_list in (row["all_cc"] or "").split(","):
                json_list = json_list.strip()
                if json_list:
                    try:
                        participants.update(json.loads(json_list))
                    except json.JSONDecodeError:
                        pass
            result.append({
                "thread_id": row["thread_id"],
                "subject": row["subject"],
                "participants": sorted(participants),
                "email_count": row["email_count"],
                "last_activity": row["last_activity"],
            })
        return result

    def get_thread(self, thread_id: str) -> list[dict]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM emails WHERE thread_id=? ORDER BY created_at", (thread_id,)
        ).fetchall()
        emails = [_parse_email(row) for row in rows]
        for e in emails:
            e["tags"] = []
        return emails

    # --- Admin ---

    def purge(self) -> dict:
        """Delete all emails, tags, and identities. Re-seed name pool. Returns counts deleted."""
        conn = self._connect()
        emails = conn.execute("SELECT COUNT(*) FROM emails").fetchone()[0]
        tags = conn.execute("SELECT COUNT(*) FROM tags").fetchone()[0]
        identities = conn.execute("SELECT COUNT(*) FROM identities").fetchone()[0]
        conn.execute("DELETE FROM tags")
        conn.execute("DELETE FROM emails")
        conn.execute("DELETE FROM identities")
        conn.commit()
        return {"emails": emails, "tags": tags, "identities": identities}

    # --- Search ---

    def search(self, from_: str | None = None, to: str | None = None,
               subject: str | None = None, tag: str | None = None,
               body: str | None = None, viewer: str | None = None) -> list[dict]:
        conn = self._connect()
        query = "SELECT DISTINCT e.* FROM emails e"
        conditions = []
        params: list = []

        if tag and viewer:
            query += " JOIN tags t ON e.id = t.email_id"
            conditions.append("t.owner = ? AND t.tag = ?")
            params.extend([viewer, tag])

        if from_:
            conditions.append("e.sender = ?")
            params.append(from_)
        if to:
            conditions.append("(e.recipients LIKE ? OR e.cc LIKE ?)")
            like = f'%"{to}"%'
            params.extend([like, like])
        if subject:
            conditions.append("e.subject LIKE ?")
            params.append(f"%{subject}%")
        if body:
            conditions.append("e.body LIKE ?")
            params.append(f"%{body}%")

        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY e.created_at DESC"

        rows = conn.execute(query, params).fetchall()
        emails = [_parse_email(row) for row in rows]
        if viewer:
            _attach_tags(conn, emails, viewer)
        else:
            for e in emails:
                e["tags"] = []
        return emails
