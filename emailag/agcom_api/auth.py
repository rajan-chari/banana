"""Session-based authentication manager with SQLite persistence."""

from __future__ import annotations

import logging
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass

logger = logging.getLogger(__name__)

DEFAULT_SESSION_EXPIRY = 86400  # 24 hours


@dataclass
class SessionInfo:
    """Active session data."""

    token: str
    handle: str
    display_name: str | None
    expires_at: datetime
    is_admin: bool


class SessionManager:
    """Manages authentication sessions with SQLite persistence."""

    def __init__(self, db_path: str = "sessions.db", expiry_seconds: int | None = None):
        self._db_path = db_path
        self._expiry = (
            expiry_seconds
            if expiry_seconds is not None
            else int(os.environ.get("AGCOM_SESSION_EXPIRY", DEFAULT_SESSION_EXPIRY))
        )
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self) -> None:
        """Create sessions table if it doesn't exist."""
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    handle TEXT NOT NULL,
                    display_name TEXT,
                    expires_at TEXT NOT NULL,
                    is_admin INTEGER NOT NULL DEFAULT 0
                )
            """)
            conn.commit()

    def _get_conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path)

    def login(self, handle: str, display_name: str | None = None) -> SessionInfo:
        """Create a new session for the given handle."""
        token = uuid.uuid4().hex
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=self._expiry)

        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    "INSERT INTO sessions (token, handle, display_name, expires_at, is_admin) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (token, handle, display_name, expires_at.isoformat(), 0),
                )
                conn.commit()

        session = SessionInfo(
            token=token,
            handle=handle,
            display_name=display_name,
            expires_at=expires_at,
            is_admin=False,
        )
        logger.info("Login: handle=%s token=%s...%s", handle, token[:8], token[-4:])
        return session

    def logout(self, token: str) -> bool:
        """Invalidate a session. Returns True if session existed."""
        with self._lock:
            with self._get_conn() as conn:
                cursor = conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
                conn.commit()
                removed = cursor.rowcount > 0

        if removed:
            logger.info("Logout: token=%s...%s", token[:8], token[-4:])
        return removed

    def validate(self, token: str) -> SessionInfo | None:
        """Validate a token and return session info, or None if invalid/expired."""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT token, handle, display_name, expires_at, is_admin "
                "FROM sessions WHERE token = ?",
                (token,),
            ).fetchone()

        if row is None:
            return None

        expires_at = datetime.fromisoformat(row[3])
        if expires_at <= datetime.now(timezone.utc):
            # Expired — clean it up
            self.logout(token)
            return None

        return SessionInfo(
            token=row[0],
            handle=row[1],
            display_name=row[2],
            expires_at=expires_at,
            is_admin=bool(row[4]),
        )

    def set_admin(self, token: str, is_admin: bool = True) -> None:
        """Set or clear admin status for a session."""
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    "UPDATE sessions SET is_admin = ? WHERE token = ?",
                    (int(is_admin), token),
                )
                conn.commit()

    def cleanup_expired(self) -> int:
        """Remove expired sessions. Returns count of removed sessions."""
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            with self._get_conn() as conn:
                cursor = conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
                conn.commit()
                count = cursor.rowcount

        if count > 0:
            logger.info("Cleaned up %d expired sessions", count)
        return count
