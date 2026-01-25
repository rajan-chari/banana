"""Tests for storage layer."""

import pytest
import tempfile
import os
from datetime import datetime, timezone

from agcom.storage import (
    init_database,
    insert_thread,
    update_thread_last_activity,
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


@pytest.fixture
def db_conn():
    """Create a temporary database connection for testing."""
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    conn = init_database(path)
    yield conn
    conn.close()
    os.unlink(path)


class TestDatabaseInit:
    """Tests for database initialization."""

    def test_init_creates_tables(self):
        """Test that initialization creates all required tables."""
        fd, path = tempfile.mkstemp(suffix='.db')
        os.close(fd)
        try:
            conn = init_database(path)

            # Check tables exist
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
            tables = [row[0] for row in cursor.fetchall()]

            assert 'schema_metadata' in tables
            assert 'threads' in tables
            assert 'messages' in tables
            assert 'address_book' in tables
            assert 'audit_log' in tables

            conn.close()
        finally:
            os.unlink(path)

    def test_init_sets_pragmas(self, db_conn):
        """Test that pragmas are set correctly."""
        cursor = db_conn.execute("PRAGMA journal_mode")
        assert cursor.fetchone()[0] == 'wal'

        cursor = db_conn.execute("PRAGMA foreign_keys")
        assert cursor.fetchone()[0] == 1


class TestThreadOperations:
    """Tests for thread operations."""

    def test_insert_and_get_thread(self, db_conn):
        """Test inserting and retrieving a thread."""
        now = datetime.now(timezone.utc)
        insert_thread(
            db_conn,
            thread_id="01HZXYABC123",
            subject="Test thread",
            participant_handles=["alice", "bob"],
            created_at=now,
            last_activity_at=now
        )

        thread = get_thread(db_conn, "01HZXYABC123", "alice")
        assert thread is not None
        assert thread.thread_id == "01HZXYABC123"
        assert thread.subject == "Test thread"
        assert thread.participant_handles == ["alice", "bob"]

    def test_update_thread_last_activity(self, db_conn):
        """Test updating thread last activity time."""
        now = datetime.now(timezone.utc)
        insert_thread(
            db_conn,
            thread_id="01HZXYABC123",
            subject="Test thread",
            participant_handles=["alice", "bob"],
            created_at=now,
            last_activity_at=now
        )

        # Update last activity
        later = datetime(2024, 1, 2, 12, 0, 0, tzinfo=timezone.utc)
        update_thread_last_activity(
            db_conn,
            thread_id="01HZXYABC123",
            last_activity_at=later,
            participant_handles=["alice", "bob", "charlie"]
        )

        thread = get_thread(db_conn, "01HZXYABC123", "alice")
        assert thread.last_activity_at == later
        assert thread.participant_handles == ["alice", "bob", "charlie"]

    def test_list_threads_ordered_by_activity(self, db_conn):
        """Test that threads are listed in order of last activity."""
        time1 = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        time2 = datetime(2024, 1, 2, 12, 0, 0, tzinfo=timezone.utc)
        time3 = datetime(2024, 1, 3, 12, 0, 0, tzinfo=timezone.utc)

        # Create admin user to see all threads
        insert_address_book_entry(db_conn, "admin", "Admin", "Admin user", time1, "system", tags=["admin"])

        insert_thread(db_conn, "thread1", "Thread 1", ["alice"], time1, time1)
        insert_thread(db_conn, "thread2", "Thread 2", ["bob"], time2, time3)
        insert_thread(db_conn, "thread3", "Thread 3", ["charlie"], time3, time2)

        # Use admin user to see all threads
        threads = list_threads(db_conn, "admin")
        assert len(threads) == 3
        assert threads[0].thread_id == "thread2"  # Most recent activity
        assert threads[1].thread_id == "thread3"
        assert threads[2].thread_id == "thread1"  # Least recent


class TestMessageOperations:
    """Tests for message operations."""

    def test_insert_and_get_message(self, db_conn):
        """Test inserting and retrieving a message."""
        now = datetime.now(timezone.utc)

        # Insert thread first
        insert_thread(db_conn, "thread1", "Test", ["alice", "bob"], now, now)

        # Insert message
        insert_message(
            db_conn,
            message_id="msg1",
            thread_id="thread1",
            from_handle="alice",
            to_handles=["bob"],
            subject="Test",
            body="Hello world",
            created_at=now,
            tags=["urgent"]
        )

        msg = get_message(db_conn, "msg1", "alice")
        assert msg is not None
        assert msg.message_id == "msg1"
        assert msg.thread_id == "thread1"
        assert msg.from_handle == "alice"
        assert msg.to_handles == ["bob"]
        assert msg.subject == "Test"
        assert msg.body == "Hello world"
        assert msg.tags == ["urgent"]

    def test_list_messages_in_thread(self, db_conn):
        """Test listing messages in a thread ordered by created_at."""
        now = datetime.now(timezone.utc)
        time1 = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        time2 = datetime(2024, 1, 1, 13, 0, 0, tzinfo=timezone.utc)
        time3 = datetime(2024, 1, 1, 14, 0, 0, tzinfo=timezone.utc)

        insert_thread(db_conn, "thread1", "Test", ["alice", "bob"], now, now)

        insert_message(db_conn, "msg1", "thread1", "alice", ["bob"], "Test", "First", time1)
        insert_message(db_conn, "msg2", "thread1", "bob", ["alice"], "Test", "Second", time2)
        insert_message(db_conn, "msg3", "thread1", "alice", ["bob"], "Test", "Third", time3)

        messages = list_messages(db_conn, "alice", thread_id="thread1")
        assert len(messages) == 3
        assert messages[0].message_id == "msg1"  # Oldest first
        assert messages[1].message_id == "msg2"
        assert messages[2].message_id == "msg3"

    def test_search_messages(self, db_conn):
        """Test searching messages by subject or body."""
        now = datetime.now(timezone.utc)
        insert_thread(db_conn, "thread1", "Test", ["alice"], now, now)

        insert_message(db_conn, "msg1", "thread1", "alice", ["bob"], "Hello", "World", now)
        insert_message(db_conn, "msg2", "thread1", "alice", ["bob"], "Test", "Python code", now)
        insert_message(db_conn, "msg3", "thread1", "alice", ["bob"], "Other", "Something else", now)

        # Search by subject
        results = search_messages(db_conn, "alice", "hello")
        assert len(results) == 1
        assert results[0].message_id == "msg1"

        # Search by body (case-insensitive)
        results = search_messages(db_conn, "alice", "PYTHON")
        assert len(results) == 1
        assert results[0].message_id == "msg2"


class TestAddressBookOperations:
    """Tests for address book operations."""

    def test_insert_and_get_entry(self, db_conn):
        """Test inserting and retrieving an address book entry."""
        now = datetime.now(timezone.utc)
        insert_address_book_entry(
            db_conn,
            handle="alice",
            display_name="Alice Smith",
            description="Data analyst",
            created_at=now,
            updated_by="test_user"
        )

        entry = get_address_book_entry(db_conn, "alice")
        assert entry is not None
        assert entry.handle == "alice"
        assert entry.display_name == "Alice Smith"
        assert entry.description == "Data analyst"
        assert entry.is_active is True
        assert entry.version == 1

    def test_update_entry_with_version_check(self, db_conn):
        """Test updating entry with optimistic locking."""
        now = datetime.now(timezone.utc)
        insert_address_book_entry(db_conn, "alice", "Alice", "Desc", now, "test_user")

        # Successful update
        later = datetime(2024, 1, 2, 12, 0, 0, tzinfo=timezone.utc)
        success = update_address_book_entry(
            db_conn,
            handle="alice",
            display_name="Alice Updated",
            description="New desc",
            is_active=True,
            updated_at=later,
            updated_by="test_user",
            expected_version=1
        )
        assert success is True

        entry = get_address_book_entry(db_conn, "alice")
        assert entry.display_name == "Alice Updated"
        assert entry.version == 2

        # Failed update with wrong version
        success = update_address_book_entry(
            db_conn,
            handle="alice",
            display_name="Alice Wrong",
            description="New desc",
            is_active=True,
            updated_at=later,
            updated_by="test_user",
            expected_version=1  # Wrong version
        )
        assert success is False

    def test_list_entries_active_only(self, db_conn):
        """Test listing active entries only."""
        now = datetime.now(timezone.utc)
        insert_address_book_entry(db_conn, "alice", "Alice", "Active", now, "test_user")
        insert_address_book_entry(db_conn, "bob", "Bob", "Will be inactive", now, "test_user")

        # Deactivate bob
        update_address_book_entry(db_conn, "bob", "Bob", "Inactive", False, now, "test_user", 1)

        entries = list_address_book_entries(db_conn, active_only=True)
        assert len(entries) == 1
        assert entries[0].handle == "alice"

        entries = list_address_book_entries(db_conn, active_only=False)
        assert len(entries) == 2

    def test_search_entries(self, db_conn):
        """Test searching address book entries."""
        now = datetime.now(timezone.utc)
        insert_address_book_entry(db_conn, "alice", "Alice Smith", "Data analyst", now, "test_user")
        insert_address_book_entry(db_conn, "bob", "Bob Jones", "Developer", now, "test_user")
        insert_address_book_entry(db_conn, "charlie", "Charlie Brown", "Manager", now, "test_user")

        # Search by handle
        results = search_address_book_entries(db_conn, "alice")
        assert len(results) == 1
        assert results[0].handle == "alice"

        # Search by display name (case-insensitive)
        results = search_address_book_entries(db_conn, "jones")
        assert len(results) == 1
        assert results[0].handle == "bob"

        # Search by description
        results = search_address_book_entries(db_conn, "analyst")
        assert len(results) == 1
        assert results[0].handle == "alice"


class TestAuditLog:
    """Tests for audit log operations."""

    def test_insert_and_list_events(self, db_conn):
        """Test inserting and listing audit events."""
        time1 = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        time2 = datetime(2024, 1, 2, 12, 0, 0, tzinfo=timezone.utc)

        insert_audit_event(
            db_conn, "evt1", "address_book_add", "alice", "bob", '{"test": "data"}', time1
        )
        insert_audit_event(
            db_conn, "evt2", "address_book_update", "alice", "bob", None, time2
        )

        events = list_audit_events(db_conn)
        assert len(events) == 2
        assert events[0].event_id == "evt2"  # Most recent first
        assert events[1].event_id == "evt1"

    def test_list_events_by_target(self, db_conn):
        """Test filtering audit events by target handle."""
        now = datetime.now(timezone.utc)

        insert_audit_event(db_conn, "evt1", "test", "alice", "bob", None, now)
        insert_audit_event(db_conn, "evt2", "test", "alice", "charlie", None, now)
        insert_audit_event(db_conn, "evt3", "test", "bob", "bob", None, now)

        events = list_audit_events(db_conn, target_handle="bob")
        assert len(events) == 2
        assert all(e.target_handle == "bob" for e in events)
