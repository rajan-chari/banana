"""Tests for address book operations."""

import pytest
import tempfile
import os

from agcom import init, AgentIdentity


@pytest.fixture
def session():
    """Create a session for testing."""
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    sess = init(path, AgentIdentity(handle="alice"))
    yield sess, path
    sess.conn.close()
    os.unlink(path)


class TestAddressBookBasics:
    """Tests for basic address book operations."""

    def test_add_entry_minimal(self, session):
        """Test adding entry with just handle."""
        sess, _ = session

        sess.address_book_add("bob")

        entry = sess.address_book_get("bob")
        assert entry is not None
        assert entry.handle == "bob"
        assert entry.display_name is None
        assert entry.description is None
        assert entry.is_active is True
        assert entry.version == 1

    def test_add_entry_with_all_fields(self, session):
        """Test adding entry with all fields."""
        sess, _ = session

        sess.address_book_add(
            handle="bob",
            display_name="Bob Jones",
            description="Senior developer"
        )

        entry = sess.address_book_get("bob")
        assert entry.display_name == "Bob Jones"
        assert entry.description == "Senior developer"

    def test_add_duplicate_handle_fails(self, session):
        """Test that adding duplicate handle fails."""
        sess, _ = session

        sess.address_book_add("bob", "Bob", "Dev")

        with pytest.raises(ValueError, match="already exists"):
            sess.address_book_add("bob", "Bob Again", "Dev")

    def test_get_nonexistent_entry(self, session):
        """Test getting non-existent entry returns None."""
        sess, _ = session

        entry = sess.address_book_get("nonexistent")
        assert entry is None


class TestAddressBookUpdate:
    """Tests for updating address book entries."""

    def test_update_entry(self, session):
        """Test updating an entry."""
        sess, _ = session

        sess.address_book_add("bob", "Bob", "Dev")

        sess.address_book_update(
            handle="bob",
            display_name="Bob Updated",
            description="Senior Dev"
        )

        entry = sess.address_book_get("bob")
        assert entry.display_name == "Bob Updated"
        assert entry.description == "Senior Dev"
        assert entry.version == 2

    def test_update_increments_version(self, session):
        """Test that update increments version."""
        sess, _ = session

        sess.address_book_add("bob")
        assert sess.address_book_get("bob").version == 1

        sess.address_book_update("bob", "Bob 1", "Desc 1")
        assert sess.address_book_get("bob").version == 2

        sess.address_book_update("bob", "Bob 2", "Desc 2")
        assert sess.address_book_get("bob").version == 3

    def test_update_nonexistent_fails(self, session):
        """Test that updating non-existent entry fails."""
        sess, _ = session

        with pytest.raises(ValueError, match="not found"):
            sess.address_book_update("bob", "Bob", "Dev")

    def test_deactivate_entry(self, session):
        """Test deactivating an entry."""
        sess, _ = session

        sess.address_book_add("bob", "Bob", "Dev")
        assert sess.address_book_get("bob").is_active is True

        sess.address_book_update("bob", "Bob", "Dev", is_active=False)
        assert sess.address_book_get("bob").is_active is False


class TestVersionConflicts:
    """Tests for optimistic locking with version conflicts."""

    def test_concurrent_update_conflict(self, session):
        """Test that concurrent updates detect version conflict."""
        sess, path = session

        # Add entry
        sess.address_book_add("bob", "Bob", "Dev")

        # Open second session
        sess2 = init(path, AgentIdentity(handle="charlie"))

        try:
            # Both sessions read the entry (version 1)
            entry1 = sess.address_book_get("bob")
            entry2 = sess2.address_book_get("bob")
            assert entry1.version == 1
            assert entry2.version == 1

            # First session updates (version 1 -> 2)
            sess.address_book_update("bob", "Bob Updated 1", "Dev 1", expected_version=entry1.version)

            # Second session tries to update with stale version
            with pytest.raises(ValueError, match="Version conflict"):
                sess2.address_book_update("bob", "Bob Updated 2", "Dev 2", expected_version=entry2.version)

            # Verify first update succeeded
            entry = sess.address_book_get("bob")
            assert entry.display_name == "Bob Updated 1"
            assert entry.version == 2

        finally:
            sess2.conn.close()

    def test_retry_after_conflict(self, session):
        """Test retrying update after conflict."""
        sess, path = session

        sess.address_book_add("bob", "Bob", "Dev")
        entry_v1 = sess.address_book_get("bob")

        sess2 = init(path, AgentIdentity(handle="charlie"))

        try:
            # First session updates (v1 -> v2)
            sess.address_book_update("bob", "Bob 1", "Dev 1", expected_version=entry_v1.version)

            # Second session attempts update with stale version 1
            try:
                sess2.address_book_update("bob", "Bob 2", "Dev 2", expected_version=1)
                assert False, "Should have raised version conflict"
            except ValueError as e:
                assert "Version conflict" in str(e)

            # Retry with fresh read
            entry = sess2.address_book_get("bob")
            assert entry.version == 2

            # Now update with correct version
            sess2.address_book_update("bob", "Bob 2", "Dev 2", expected_version=entry.version)

            # Verify update succeeded
            entry = sess2.address_book_get("bob")
            assert entry.display_name == "Bob 2"
            assert entry.version == 3

        finally:
            sess2.conn.close()


class TestAddressBookListing:
    """Tests for listing and searching address book entries."""

    def test_list_entries(self, session):
        """Test listing all entries."""
        sess, _ = session

        sess.address_book_add("alice", "Alice", "Analyst")
        sess.address_book_add("bob", "Bob", "Developer")
        sess.address_book_add("charlie", "Charlie", "Manager")

        entries = sess.address_book_list()
        assert len(entries) == 3
        # Should be sorted by handle
        assert entries[0].handle == "alice"
        assert entries[1].handle == "bob"
        assert entries[2].handle == "charlie"

    def test_list_active_only(self, session):
        """Test listing only active entries."""
        sess, _ = session

        sess.address_book_add("alice", "Alice", "Analyst")
        sess.address_book_add("bob", "Bob", "Developer")
        sess.address_book_update("bob", "Bob", "Developer", is_active=False)

        entries = sess.address_book_list(active_only=True)
        assert len(entries) == 1
        assert entries[0].handle == "alice"

    def test_list_include_inactive(self, session):
        """Test listing all entries including inactive."""
        sess, _ = session

        sess.address_book_add("alice", "Alice", "Analyst")
        sess.address_book_add("bob", "Bob", "Developer")
        sess.address_book_update("bob", "Bob", "Developer", is_active=False)

        entries = sess.address_book_list(active_only=False)
        assert len(entries) == 2

    def test_search_by_handle(self, session):
        """Test searching by handle."""
        sess, _ = session

        sess.address_book_add("alice", "Alice Smith", "Analyst")
        sess.address_book_add("bob", "Bob Jones", "Developer")

        results = sess.address_book_search("alice")
        assert len(results) == 1
        assert results[0].handle == "alice"

    def test_search_by_display_name(self, session):
        """Test searching by display name."""
        sess, _ = session

        sess.address_book_add("alice", "Alice Smith", "Analyst")
        sess.address_book_add("bob", "Bob Jones", "Developer")

        results = sess.address_book_search("jones")
        assert len(results) == 1
        assert results[0].handle == "bob"

    def test_search_by_description(self, session):
        """Test searching by description."""
        sess, _ = session

        sess.address_book_add("alice", "Alice", "Data analyst")
        sess.address_book_add("bob", "Bob", "Software developer")

        results = sess.address_book_search("software")
        assert len(results) == 1
        assert results[0].handle == "bob"

    def test_search_case_insensitive(self, session):
        """Test that search is case-insensitive."""
        sess, _ = session

        sess.address_book_add("alice", "Alice Smith", "Analyst")

        results = sess.address_book_search("ALICE")
        assert len(results) == 1

        results = sess.address_book_search("smith")
        assert len(results) == 1

    def test_search_partial_match(self, session):
        """Test that search does partial matching."""
        sess, _ = session

        sess.address_book_add("alice", "Alice Smith", "Analyst")

        results = sess.address_book_search("ali")
        assert len(results) == 1

        results = sess.address_book_search("mit")
        assert len(results) == 1

    def test_search_active_only(self, session):
        """Test search with active_only filter."""
        sess, _ = session

        sess.address_book_add("alice", "Alice", "Analyst")
        sess.address_book_add("bob", "Bob", "Developer")
        sess.address_book_update("bob", "Bob", "Developer", is_active=False)

        results = sess.address_book_search("bob", active_only=True)
        assert len(results) == 0

        results = sess.address_book_search("bob", active_only=False)
        assert len(results) == 1


class TestAuditLog:
    """Tests for audit logging of address book operations."""

    def test_add_creates_audit_event(self, session):
        """Test that adding entry creates audit event."""
        sess, _ = session

        sess.address_book_add("bob", "Bob", "Dev")

        events = sess.audit_list(target_handle="bob")
        assert len(events) == 1
        assert events[0].event_type == "address_book_add"
        assert events[0].actor_handle == "alice"
        assert events[0].target_handle == "bob"

    def test_update_creates_audit_event(self, session):
        """Test that updating entry creates audit event."""
        sess, _ = session

        sess.address_book_add("bob", "Bob", "Dev")
        sess.address_book_update("bob", "Bob Updated", "Senior Dev")

        events = sess.audit_list(target_handle="bob")
        assert len(events) == 2
        assert events[0].event_type == "address_book_update"  # Most recent
        assert events[1].event_type == "address_book_add"

    def test_audit_event_contains_details(self, session):
        """Test that audit events contain operation details."""
        sess, _ = session

        sess.address_book_add("bob", "Bob Jones", "Developer")

        events = sess.audit_list(target_handle="bob")
        event = events[0]

        assert event.details is not None
        # Details should be JSON with operation information
        assert "Bob Jones" in event.details
        assert "Developer" in event.details

    def test_audit_history_ordered(self, session):
        """Test that audit history is ordered by timestamp (newest first)."""
        sess, _ = session

        sess.address_book_add("bob", "Bob", "Dev")
        sess.address_book_update("bob", "Bob 1", "Dev 1")
        sess.address_book_update("bob", "Bob 2", "Dev 2")

        events = sess.audit_list(target_handle="bob")
        assert len(events) == 3

        # Should be in reverse chronological order
        assert events[0].event_type == "address_book_update"
        assert events[1].event_type == "address_book_update"
        assert events[2].event_type == "address_book_add"

        # Timestamps should be in descending order
        assert events[0].timestamp >= events[1].timestamp
        assert events[1].timestamp >= events[2].timestamp


class TestValidation:
    """Tests for validation in address book operations."""

    def test_add_invalid_handle(self, session):
        """Test that adding with invalid handle fails."""
        sess, _ = session

        with pytest.raises(ValueError):
            sess.address_book_add("ALICE", "Alice", "Dev")

        with pytest.raises(ValueError):
            sess.address_book_add("alice@example", "Alice", "Dev")

    def test_add_invalid_display_name(self, session):
        """Test that adding with invalid display name fails."""
        sess, _ = session

        with pytest.raises(ValueError):
            sess.address_book_add("alice", "", "Dev")

        with pytest.raises(ValueError):
            sess.address_book_add("alice", "a" * 101, "Dev")

    def test_add_invalid_description(self, session):
        """Test that adding with invalid description fails."""
        sess, _ = session

        with pytest.raises(ValueError):
            sess.address_book_add("alice", "Alice", "")

        with pytest.raises(ValueError):
            sess.address_book_add("alice", "Alice", "a" * 501)
