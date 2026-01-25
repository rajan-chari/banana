"""Tests for Phase 2 features."""

import pytest
import tempfile
import os
from datetime import datetime, timezone

from agcom import init, AgentIdentity


@pytest.fixture
def session():
    """Create a session for testing."""
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    identity = AgentIdentity(handle="alice", display_name="Alice Smith")
    sess = init(path, identity)
    yield sess
    sess.conn.close()
    os.unlink(path)


class TestEnhancedSearch:
    """Tests for enhanced search_messages() API."""

    def test_search_in_subject_only(self, session):
        """Test searching only in subject."""
        session.send(["bob"], "Python Tutorial", "Learn JavaScript")
        session.send(["bob"], "JavaScript Guide", "Learn Python")

        # Search only in subject
        results = session.search_messages("Python", in_subject=True, in_body=False)
        assert len(results) == 1
        assert "Python Tutorial" in results[0].subject

    def test_search_in_body_only(self, session):
        """Test searching only in body."""
        session.send(["bob"], "Python Tutorial", "Learn JavaScript")
        session.send(["bob"], "JavaScript Guide", "Learn Python")

        # Search only in body
        results = session.search_messages("Python", in_subject=False, in_body=True)
        assert len(results) == 1
        assert "JavaScript Guide" in results[0].subject

    def test_search_by_from_handle(self, session):
        """Test filtering by sender."""
        msg1 = session.send(["bob"], "Test 1", "From alice")

        # For this test, we'll just search all messages and verify from_handle filter works
        # (In a real scenario, bob would reply, but for testing the filter we can use alice's messages)
        results = session.search_messages("Test", from_handle="alice")
        assert len(results) == 1
        assert results[0].from_handle == "alice"

        # Test filtering for non-existent sender returns empty
        results = session.search_messages("Test", from_handle="nonexistent")
        assert len(results) == 0

    def test_search_by_to_handle(self, session):
        """Test filtering by recipient."""
        session.send(["bob"], "To Bob", "Message")
        session.send(["charlie"], "To Charlie", "Message")

        # Search messages to bob
        results = session.search_messages("To", to_handle="bob")
        assert len(results) == 1
        assert "bob" in results[0].to_handles


class TestAddressBookTags:
    """Tests for address book tags support."""

    def test_add_entry_with_tags(self, session):
        """Test adding entry with tags."""
        entry = session.address_book_add(
            "bob",
            "Bob Jones",
            "Backend developer",
            tags=["python", "backend", "devops"]
        )

        assert entry.tags == ["python", "backend", "devops"]

    def test_update_entry_tags(self, session):
        """Test updating entry tags."""
        session.address_book_add("bob", "Bob", "Dev")

        updated = session.address_book_update(
            "bob",
            "Bob Updated",
            "Senior Dev",
            tags=["python", "senior"]
        )

        assert updated.tags == ["python", "senior"]

    def test_search_by_tags(self, session):
        """Test searching by tags."""
        session.address_book_add("bob", "Bob", "Dev", tags=["python", "backend"])
        session.address_book_add("charlie", "Charlie", "Dev", tags=["javascript", "frontend"])
        session.address_book_add("dave", "Dave", "Dev", tags=["python", "frontend"])

        # Search for python devs
        results = session.address_book_search(tags=["python"])
        assert len(results) == 2
        assert all("python" in (entry.tags or []) for entry in results)

    def test_search_by_text_and_tags(self, session):
        """Test searching by both text and tags."""
        session.address_book_add("bob", "Bob Jones", "Dev", tags=["python"])
        session.address_book_add("alice-dev", "Alice", "Dev", tags=["python"])
        session.address_book_add("charlie", "Charlie Brown", "Dev", tags=["java"])

        # Search for "bob" with python tag
        results = session.address_book_search(query="bob", tags=["python"])
        assert len(results) == 1
        assert results[0].handle == "bob"


class TestBulkOperations:
    """Tests for bulk messaging operations."""

    def test_send_broadcast(self, session):
        """Test sending broadcast messages."""
        recipients = ["bob", "charlie", "dave"]
        messages = session.send_broadcast(recipients, "Announcement", "Team meeting at 3pm")

        assert len(messages) == 3
        # Each message should be in a different thread
        thread_ids = [msg.thread_id for msg in messages]
        assert len(set(thread_ids)) == 3

        # Each message should have only one recipient
        for msg in messages:
            assert len(msg.to_handles) == 1

    def test_send_group(self, session):
        """Test sending group messages."""
        recipients = ["bob", "charlie", "dave"]
        message = session.send_group(recipients, "Group Chat", "Hello team!")

        assert len(message.to_handles) == 3

        # Should create one thread with all participants
        thread = session.get_thread(message.thread_id)
        assert sorted(thread.participant_handles) == ["alice", "bob", "charlie", "dave"]


class TestThreadMetadata:
    """Tests for thread metadata support."""

    def test_update_thread_metadata(self, session):
        """Test updating thread metadata."""
        msg = session.send(["bob"], "Test", "Body")

        session.update_thread_metadata(msg.thread_id, "priority", "high")

        value = session.get_thread_metadata(msg.thread_id, "priority")
        assert value == "high"

    def test_remove_thread_metadata(self, session):
        """Test removing thread metadata key."""
        msg = session.send(["bob"], "Test", "Body")

        session.update_thread_metadata(msg.thread_id, "priority", "high")
        session.update_thread_metadata(msg.thread_id, "priority", None)

        value = session.get_thread_metadata(msg.thread_id, "priority")
        assert value is None

    def test_archive_thread(self, session):
        """Test archiving a thread."""
        msg = session.send(["bob"], "Test", "Body")

        session.archive_thread(msg.thread_id)

        archived = session.get_thread_metadata(msg.thread_id, "archived")
        assert archived == "true"

    def test_unarchive_thread(self, session):
        """Test unarchiving a thread."""
        msg = session.send(["bob"], "Test", "Body")

        session.archive_thread(msg.thread_id)
        session.unarchive_thread(msg.thread_id)

        archived = session.get_thread_metadata(msg.thread_id, "archived")
        assert archived is None

    def test_thread_metadata_persists(self, session):
        """Test that thread metadata persists across reads."""
        msg = session.send(["bob"], "Test", "Body")

        session.update_thread_metadata(msg.thread_id, "category", "work")

        # Read thread again
        thread = session.get_thread(msg.thread_id)
        assert thread.metadata is not None
        assert thread.metadata.get("category") == "work"


class TestMessageAuditLogging:
    """Tests for message audit logging."""

    def test_send_creates_audit_events(self, session):
        """Test that send() creates audit events."""
        session.send(["bob"], "Test", "Body")

        events = session.audit_list()

        # Should have thread_create and message_send events
        event_types = [e.event_type for e in events]
        assert "thread_create" in event_types
        assert "message_send" in event_types

    def test_reply_creates_audit_event(self, session):
        """Test that reply() creates audit event."""
        msg = session.send(["bob"], "Test", "Body")
        session.reply(msg.message_id, "Reply")

        events = session.audit_list()

        # Should have message_reply event
        event_types = [e.event_type for e in events]
        assert "message_reply" in event_types

    def test_audit_event_has_details(self, session):
        """Test that audit events contain structured details."""
        msg = session.send(["bob"], "Test", "Body", tags=["urgent"])

        events = session.audit_list()
        send_events = [e for e in events if e.event_type == "message_send"]

        assert len(send_events) >= 1
        # Details should be stored as JSON string
        import json
        details = json.loads(send_events[0].details) if send_events[0].details else {}
        assert "message_id" in details
        assert "thread_id" in details
        assert details.get("tags") == ["urgent"]
