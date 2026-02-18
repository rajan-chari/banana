"""Tests for the session manager."""

import os
import tempfile
import time
from datetime import datetime, timezone

import pytest

from agcom_api.auth import SessionManager


@pytest.fixture
def session_db(tmp_path):
    """Create a temporary session database."""
    return str(tmp_path / "test_sessions.db")


@pytest.fixture
def manager(session_db):
    """Create a session manager with short expiry for testing."""
    return SessionManager(db_path=session_db, expiry_seconds=3600)


class TestSessionManager:
    def test_login_creates_session(self, manager):
        session = manager.login("alice", "Alice Smith")
        assert session.handle == "alice"
        assert session.display_name == "Alice Smith"
        assert session.token
        assert session.expires_at > datetime.now(timezone.utc)
        assert session.is_admin is False

    def test_login_without_display_name(self, manager):
        session = manager.login("bob")
        assert session.handle == "bob"
        assert session.display_name is None

    def test_validate_returns_session(self, manager):
        session = manager.login("alice")
        validated = manager.validate(session.token)
        assert validated is not None
        assert validated.handle == "alice"

    def test_validate_invalid_token(self, manager):
        result = manager.validate("nonexistent-token")
        assert result is None

    def test_logout_invalidates_session(self, manager):
        session = manager.login("alice")
        assert manager.logout(session.token) is True
        assert manager.validate(session.token) is None

    def test_logout_nonexistent_token(self, manager):
        assert manager.logout("fake-token") is False

    def test_expired_session_returns_none(self, session_db):
        manager = SessionManager(db_path=session_db, expiry_seconds=0)
        session = manager.login("alice")
        time.sleep(0.01)  # Ensure expiry time is in the past
        result = manager.validate(session.token)
        assert result is None

    def test_set_admin(self, manager):
        session = manager.login("admin")
        assert session.is_admin is False
        manager.set_admin(session.token, True)
        validated = manager.validate(session.token)
        assert validated.is_admin is True

    def test_cleanup_expired(self, session_db):
        manager = SessionManager(db_path=session_db, expiry_seconds=0)
        manager.login("alice")
        manager.login("bob")
        time.sleep(0.01)  # Ensure sessions are expired
        count = manager.cleanup_expired()
        assert count == 2

    def test_session_persists_across_instances(self, session_db):
        manager1 = SessionManager(db_path=session_db, expiry_seconds=3600)
        session = manager1.login("alice")

        # New manager instance, same DB
        manager2 = SessionManager(db_path=session_db, expiry_seconds=3600)
        validated = manager2.validate(session.token)
        assert validated is not None
        assert validated.handle == "alice"

    def test_multiple_sessions_same_handle(self, manager):
        s1 = manager.login("alice")
        s2 = manager.login("alice")
        assert s1.token != s2.token
        assert manager.validate(s1.token) is not None
        assert manager.validate(s2.token) is not None
