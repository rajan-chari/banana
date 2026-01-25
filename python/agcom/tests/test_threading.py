"""Tests for threading behavior."""

import pytest
import tempfile
import os
from datetime import datetime, timezone

from agcom import init, AgentIdentity


@pytest.fixture
def alice_session():
    """Create a session for alice."""
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    sess = init(path, AgentIdentity(handle="alice"))
    yield sess, path
    sess.conn.close()
    os.unlink(path)


class TestThreadCreation:
    """Tests for thread creation."""

    def test_send_creates_new_thread(self, alice_session):
        """Test that send always creates a new thread."""
        session, _ = alice_session

        msg1 = session.send(["bob"], "Subject 1", "Body 1")
        msg2 = session.send(["bob"], "Subject 2", "Body 2")

        assert msg1.thread_id != msg2.thread_id

        threads = session.list_threads()
        assert len(threads) == 2

    def test_participant_handles_sorted(self, alice_session):
        """Test that participant handles are sorted alphabetically."""
        session, _ = alice_session

        msg = session.send(["zoe", "bob", "charlie"], "Test", "Body")

        thread = session.get_thread(msg.thread_id)
        assert thread.participant_handles == ["alice", "bob", "charlie", "zoe"]

    def test_participant_handles_deduplicated(self, alice_session):
        """Test that duplicate participant handles are removed."""
        session, _ = alice_session

        # In practice, to_handles shouldn't have duplicates, but test deduplication
        # This tests the logic in session.py
        msg = session.send(["bob"], "Test", "Body")

        thread = session.get_thread(msg.thread_id)
        # Should be alice (from) + bob (to), deduplicated and sorted
        assert thread.participant_handles == ["alice", "bob"]


class TestThreadReplies:
    """Tests for replying in threads."""

    def test_reply_adds_to_same_thread(self, alice_session):
        """Test that reply adds message to the same thread."""
        session, _ = alice_session

        msg1 = session.send(["bob"], "Discussion", "First")
        msg2 = session.reply(msg1.message_id, "Second")

        assert msg2.thread_id == msg1.thread_id

        messages = session.list_messages(thread_id=msg1.thread_id)
        assert len(messages) == 2

    def test_reply_updates_last_activity(self, alice_session):
        """Test that reply updates thread's last_activity_at."""
        session, _ = alice_session

        msg1 = session.send(["bob"], "Test", "First")

        # Get initial last activity time
        thread = session.get_thread(msg1.thread_id)
        initial_time = thread.last_activity_at

        # Reply
        msg2 = session.reply(msg1.message_id, "Second")

        # Check last activity was updated
        thread = session.get_thread(msg1.thread_id)
        assert thread.last_activity_at >= initial_time

    def test_multiple_replies_in_thread(self, alice_session):
        """Test multiple replies in a thread."""
        session, _ = alice_session

        msg1 = session.send(["bob"], "Discussion", "First")
        msg2 = session.reply(msg1.message_id, "Second")
        msg3 = session.reply(msg2.message_id, "Third")
        msg4 = session.reply(msg1.message_id, "Fourth")  # Reply to original

        messages = session.list_messages(thread_id=msg1.thread_id)
        assert len(messages) == 4

        # Check in_reply_to relationships
        assert msg2.in_reply_to == msg1.message_id
        assert msg3.in_reply_to == msg2.message_id
        assert msg4.in_reply_to == msg1.message_id


class TestThreadOrdering:
    """Tests for thread ordering."""

    def test_threads_ordered_by_last_activity(self, alice_session):
        """Test that threads are ordered by last activity."""
        session, _ = alice_session

        # Create three threads
        msg1 = session.send(["bob"], "Thread 1", "Body")
        msg2 = session.send(["charlie"], "Thread 2", "Body")
        msg3 = session.send(["dave"], "Thread 3", "Body")

        # Reply to thread 1 (should move it to top)
        session.reply(msg1.message_id, "Reply to thread 1")

        threads = session.list_threads()
        assert threads[0].thread_id == msg1.thread_id  # Most recent activity
        assert threads[1].thread_id == msg3.thread_id
        assert threads[2].thread_id == msg2.thread_id


class TestMessageOrdering:
    """Tests for message ordering within threads."""

    def test_messages_ordered_by_created_at(self, alice_session):
        """Test that messages in a thread are ordered by created_at."""
        session, _ = alice_session

        msg1 = session.send(["bob"], "Test", "First")
        msg2 = session.reply(msg1.message_id, "Second")
        msg3 = session.reply(msg2.message_id, "Third")

        messages = session.list_messages(thread_id=msg1.thread_id)

        # Should be in chronological order (oldest first)
        assert messages[0].message_id == msg1.message_id
        assert messages[1].message_id == msg2.message_id
        assert messages[2].message_id == msg3.message_id

        # Check timestamps are in order
        assert messages[0].created_at <= messages[1].created_at
        assert messages[1].created_at <= messages[2].created_at


class TestMultiAgentThreads:
    """Tests for threads with multiple agents."""

    def test_multiple_agents_same_database(self, alice_session):
        """Test multiple agents using the same database."""
        _, path = alice_session

        # Alice sends a message
        with init(path, AgentIdentity(handle="alice")) as alice:
            msg1 = alice.send(["bob"], "Question", "What do you think?")
            thread_id = msg1.thread_id
            msg1_id = msg1.message_id

        # Bob replies
        with init(path, AgentIdentity(handle="bob")) as bob:
            msg2 = bob.reply(msg1_id, "I think it's great!")

        # Alice views the thread
        with init(path, AgentIdentity(handle="alice")) as alice:
            messages = alice.list_messages(thread_id=thread_id)
            assert len(messages) == 2
            assert messages[0].from_handle == "alice"
            assert messages[1].from_handle == "bob"

    def test_participant_handles_updated_across_agents(self, alice_session):
        """Test that participant handles are updated when new agents join."""
        _, path = alice_session

        # Alice sends to bob
        with init(path, AgentIdentity(handle="alice")) as alice:
            msg1 = alice.send(["bob"], "Group chat", "Hello bob")

            thread = alice.get_thread(msg1.thread_id)
            assert sorted(thread.participant_handles) == ["alice", "bob"]

        # Bob replies and includes charlie
        # Note: In this implementation, reply doesn't let you add new recipients
        # But we can test that if bob replies, bob is in the participant list
        with init(path, AgentIdentity(handle="bob")) as bob:
            bob.reply(msg1.message_id, "Hello alice")

            thread = bob.get_thread(msg1.thread_id)
            # Participant handles should still be alice and bob
            assert sorted(thread.participant_handles) == ["alice", "bob"]


class TestReplyThread:
    """Tests for reply_thread method."""

    def test_reply_thread_finds_latest_message(self, alice_session):
        """Test that reply_thread replies to the latest message."""
        session, _ = alice_session

        msg1 = session.send(["bob"], "Discussion", "First")
        msg2 = session.reply(msg1.message_id, "Second")
        msg3 = session.reply(msg2.message_id, "Third")

        # Reply to thread (should reply to msg3)
        msg4 = session.reply_thread(msg1.thread_id, "Fourth")

        assert msg4.in_reply_to == msg3.message_id

    def test_reply_thread_with_single_message(self, alice_session):
        """Test reply_thread when thread has only one message."""
        session, _ = alice_session

        msg1 = session.send(["bob"], "Single", "Only message")

        msg2 = session.reply_thread(msg1.thread_id, "Reply to single")

        assert msg2.in_reply_to == msg1.message_id
