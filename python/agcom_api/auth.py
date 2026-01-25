"""Session-based authentication for the API."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Tuple
import threading

from agcom.models import AgentIdentity


class SessionManager:
    """Manages authentication sessions with token-based access."""

    def __init__(self, session_expiry_hours: int = 24):
        """Initialize the session manager.

        Args:
            session_expiry_hours: Number of hours before a session expires
        """
        self.session_expiry_hours = session_expiry_hours
        self._sessions: Dict[str, Tuple[AgentIdentity, datetime]] = {}
        self._lock = threading.Lock()

    def create_session(self, identity: AgentIdentity) -> Tuple[str, datetime]:
        """Create a new session for an agent.

        Args:
            identity: Agent identity

        Returns:
            Tuple of (token, expires_at)
        """
        token = str(uuid.uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(hours=self.session_expiry_hours)

        with self._lock:
            self._sessions[token] = (identity, expires_at)

        return token, expires_at

    def get_session(self, token: str) -> Optional[AgentIdentity]:
        """Get the identity associated with a token.

        Args:
            token: Session token

        Returns:
            AgentIdentity if token is valid and not expired, None otherwise
        """
        with self._lock:
            if token not in self._sessions:
                return None

            identity, expires_at = self._sessions[token]

            # Check if expired
            if datetime.now(timezone.utc) > expires_at:
                del self._sessions[token]
                return None

            return identity

    def invalidate_session(self, token: str) -> bool:
        """Invalidate a session token.

        Args:
            token: Session token

        Returns:
            True if token was found and invalidated, False otherwise
        """
        with self._lock:
            if token in self._sessions:
                del self._sessions[token]
                return True
            return False

    def clean_expired_sessions(self) -> int:
        """Remove expired sessions from storage.

        Returns:
            Number of sessions cleaned
        """
        now = datetime.now(timezone.utc)
        with self._lock:
            expired_tokens = [
                token for token, (_, expires_at) in self._sessions.items()
                if now > expires_at
            ]
            for token in expired_tokens:
                del self._sessions[token]
            return len(expired_tokens)
