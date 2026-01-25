"""Tests for session functionality."""

import pytest
import tempfile
import os

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


class TestSendMessage:
    """Tests for sending messages."""

    def test_send_creates_thread_and_message(self, session):
        """Test that send creates a new thread and message."""
        message = session.send(
            to_handles=["bob"],
            subject="Hello",
            body="How are you?"
        )

        # Check message object returned
        assert message is not None
        assert message.from_handle == "alice"
        assert message.to_handles == ["bob"]
        assert message.subject == "Hello"
        assert message.body == "How are you?"

        # Check thread exists
        thread = session.get_thread(message.thread_id)
        assert thread is not None
        assert thread.subject == "Hello"
        assert sorted(thread.participant_handles) == ["alice", "bob"]

    def test_send_with_tags(self, session):
        """Test sending message with tags."""
        message = session.send(
            to_handles=["bob"],
            subject="Tagged message",
            body="Body",
            tags=["urgent", "project"]
        )

        assert message.tags == ["urgent", "project"]

    def test_send_to_multiple_recipients(self, session):
        """Test sending to multiple recipients."""
        message = session.send(
            to_handles=["bob", "charlie"],
            subject="Group message",
            body="Hello all"
        )

        thread = session.get_thread(message.thread_id)
        assert sorted(thread.participant_handles) == ["alice", "bob", "charlie"]

    def test_send_validates_inputs(self, session):
        """Test that send validates inputs."""
        with pytest.raises(ValueError):
            session.send(to_handles=["BOB"], subject="Test", body="Body")

        with pytest.raises(ValueError):
            session.send(to_handles=["bob"], subject="", body="Body")

        with pytest.raises(ValueError):
            session.send(to_handles=["bob"], subject="Test", body="")


class TestReplyMessage:
    """Tests for replying to messages."""

    def test_reply_to_message(self, session):
        """Test replying to a message."""
        # Send initial message
        msg1 = session.send(
            to_handles=["bob"],
            subject="Initial",
            body="First message"
        )

        # Reply to it
        reply = session.reply(msg1.message_id, body="My reply")

        # Check reply message
        assert reply.thread_id == msg1.thread_id
        assert reply.from_handle == "alice"
        assert reply.in_reply_to == msg1.message_id
        assert reply.body == "My reply"

        # Check thread was updated
        thread = session.get_thread(msg1.thread_id)
        assert thread.last_activity_at >= reply.created_at

    def test_reply_updates_participant_handles(self, session):
        """Test that reply updates participant handles if needed."""
        # Create a message as alice to bob
        msg1 = session.send(
            to_handles=["bob"],
            subject="Test",
            body="First"
        )

        thread = session.get_thread(msg1.thread_id)
        assert sorted(thread.participant_handles) == ["alice", "bob"]

        # Reply (still alice, so no change expected)
        session.reply(msg1.message_id, body="Reply")

        thread = session.get_thread(msg1.thread_id)
        assert sorted(thread.participant_handles) == ["alice", "bob"]


class TestReplyThread:
    """Tests for replying to threads."""

    def test_reply_thread_replies_to_latest(self, session):
        """Test that reply_thread replies to the latest message."""
        # Send initial message
        msg1 = session.send(
            to_handles=["bob"],
            subject="Thread",
            body="First"
        )

        # Reply to create second message
        msg2 = session.reply(msg1.message_id, body="Second")

        # Reply to thread (should reply to msg2)
        msg3 = session.reply_thread(msg1.thread_id, body="Third")

        assert msg3.in_reply_to == msg2.message_id

    def test_reply_thread_with_no_messages_fails(self, session):
        """Test that reply_thread fails if thread has no messages."""
        # This shouldn't happen in practice, but test the error handling
        # We can't easily create a thread without messages through the API,
        # so we'll just test with a non-existent thread
        with pytest.raises(ValueError):
            session.reply_thread("nonexistent", body="Test")


class TestViewingMethods:
    """Tests for viewing methods."""

    def test_current_screen_shows_threads(self, session):
        """Test that current_screen shows thread list."""
        # Send some messages
        session.send(["bob"], "Thread 1", "Body 1")
        session.send(["charlie"], "Thread 2", "Body 2")

        output = session.current_screen()
        assert "INBOX" in output
        assert "Thread 1" in output
        assert "Thread 2" in output

    def test_view_thread_shows_messages(self, session):
        """Test that view_thread shows all messages."""
        msg1 = session.send(["bob"], "Discussion", "First message")
        session.reply(msg1.message_id, body="Second message")

        output = session.view_thread(msg1.thread_id)
        assert "THREAD: Discussion" in output
        assert "First message" in output
        assert "Second message" in output

    def test_list_threads(self, session):
        """Test listing threads."""
        session.send(["bob"], "Thread 1", "Body")
        session.send(["charlie"], "Thread 2", "Body")

        threads = session.list_threads()
        assert len(threads) == 2

    def test_list_messages_in_thread(self, session):
        """Test listing messages in a specific thread."""
        msg1 = session.send(["bob"], "Test", "First")
        session.reply(msg1.message_id, body="Second")

        messages = session.list_messages(thread_id=msg1.thread_id)
        assert len(messages) == 2

    def test_search_messages(self, session):
        """Test searching messages."""
        session.send(["bob"], "Python help", "I need help with Python")
        session.send(["charlie"], "Java question", "What about Java?")

        results = session.search_messages("python")
        assert len(results) == 1
        assert "Python" in results[0].subject


class TestAddressBook:
    """Tests for address book operations."""

    def test_add_entry(self, session):
        """Test adding an address book entry."""
        entry = session.address_book_add(
            handle="bob",
            display_name="Bob Jones",
            description="Developer"
        )

        assert entry is not None
        assert entry.handle == "bob"
        assert entry.display_name == "Bob Jones"
        assert entry.description == "Developer"
        assert entry.updated_by == "alice"  # Test new field

    def test_add_duplicate_fails(self, session):
        """Test that adding duplicate entry fails."""
        session.address_book_add("bob", "Bob", "Dev")

        with pytest.raises(ValueError, match="already exists"):
            session.address_book_add("bob", "Bob Again", "Dev")

    def test_update_entry(self, session):
        """Test updating an address book entry."""
        session.address_book_add("bob", "Bob", "Dev")

        updated_entry = session.address_book_update(
            handle="bob",
            display_name="Bob Updated",
            description="Senior Dev"
        )

        assert updated_entry.display_name == "Bob Updated"
        assert updated_entry.description == "Senior Dev"
        assert updated_entry.version == 2
        assert updated_entry.updated_by == "alice"  # Test new field

    def test_update_nonexistent_fails(self, session):
        """Test that updating non-existent entry fails."""
        with pytest.raises(ValueError, match="not found"):
            session.address_book_update("bob", "Bob", "Dev")

    def test_list_entries(self, session):
        """Test listing address book entries."""
        session.address_book_add("bob", "Bob", "Dev")
        session.address_book_add("charlie", "Charlie", "Manager")

        entries = session.address_book_list()
        assert len(entries) == 2

    def test_search_entries(self, session):
        """Test searching address book entries."""
        session.address_book_add("bob", "Bob Jones", "Developer")
        session.address_book_add("charlie", "Charlie Brown", "Manager")

        results = session.address_book_search("jones")
        assert len(results) == 1
        assert results[0].handle == "bob"

    def test_audit_events_created(self, session):
        """Test that audit events are created for address book operations."""
        session.address_book_add("bob", "Bob", "Dev")
        session.address_book_update("bob", "Bob Updated", "Senior Dev")

        events = session.audit_list(target_handle="bob")
        assert len(events) == 2
        assert any(e.event_type == "address_book_add" for e in events)
        assert any(e.event_type == "address_book_update" for e in events)


class TestDisplayNameResolution:
    """Tests for display name resolution."""

    def test_resolve_with_display_name(self, session):
        """Test resolving handle with display name."""
        session.address_book_add("bob", "Bob Jones", "Dev")

        # Send message and view thread
        msg = session.send(["bob"], "Test", "Body")
        output = session.view_thread(msg.thread_id)

        # Should show "alice" (no display name in address book)
        assert "alice" in output.lower()

    def test_resolve_without_display_name(self, session):
        """Test resolving handle without display name."""
        msg = session.send(["bob"], "Test", "Body")
        output = session.view_thread(msg.thread_id)

        # Should show just the handle
        assert "bob" in output


class TestTruncation:
    """Tests for text truncation."""

    def test_truncate_long_subject(self, session):
        """Test that long subjects are truncated in display."""
        # Use a subject that's valid (under 200 chars) but long enough to be truncated in display
        long_subject = "This is a very long subject line that will be truncated in the display output when shown in the inbox view"

        msg = session.send(["bob"], long_subject, "Body")
        # Use narrow subject width to force truncation
        from agcom.models import ScreenOptions
        output = session.current_screen(options=ScreenOptions(subject_width=30))

        # Should contain ellipsis
        assert "…" in output

    def test_truncate_at_word_boundary(self, session):
        """Test that truncation prefers word boundaries."""
        # Use a valid subject length
        subject = "Short words repeated many times in the subject line"

        msg = session.send(["bob"], subject, "Body")
        # Use narrow subject width to force truncation
        from agcom.models import ScreenOptions
        output = session.current_screen(options=ScreenOptions(subject_width=20))

        # Should be truncated
        assert "…" in output


class TestContextManager:
    """Tests for context manager support."""

    def test_context_manager(self):
        """Test using session as context manager."""
        fd, path = tempfile.mkstemp(suffix='.db')
        os.close(fd)

        try:
            with init(path, AgentIdentity(handle="alice")) as session:
                session.send(["bob"], "Test", "Body")

            # Should be able to open again
            with init(path, AgentIdentity(handle="alice")) as session:
                threads = session.list_threads()
                assert len(threads) == 1
        finally:
            os.unlink(path)
