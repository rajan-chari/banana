"""Tests for participant-based filtering and admin access control."""

import pytest
import tempfile
import os

from agcom import init, AgentIdentity


@pytest.fixture
def multi_user_db():
    """Create a database with multiple users and messages."""
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)

    # Alice sends to Bob
    with init(path, AgentIdentity(handle="alice")) as alice:
        alice.address_book_add("bob", display_name="Bob")
        alice.address_book_add("charlie", display_name="Charlie")
        msg1 = alice.send(["bob"], "Alice to Bob", "Private conversation between Alice and Bob")

    # Bob sends to Dave
    with init(path, AgentIdentity(handle="bob")) as bob:
        bob.address_book_add("dave", display_name="Dave")
        msg2 = bob.send(["dave"], "Bob to Dave", "Another private conversation between Bob and Dave")

    # Charlie sends to Alice
    with init(path, AgentIdentity(handle="charlie")) as charlie:
        msg3 = charlie.send(["alice"], "Charlie to Alice", "Yet another conversation between Charlie and Alice")

    yield path, msg1.thread_id, msg2.thread_id, msg3.thread_id

    os.unlink(path)


class TestNonParticipantAccess:
    """Tests that non-participants cannot access threads they're not part of."""

    def test_non_participant_cannot_list_others_threads(self, multi_user_db):
        """Test that a user only sees threads they participate in."""
        path, alice_bob_thread, bob_dave_thread, charlie_alice_thread = multi_user_db

        # Dave should only see the thread where he's a participant (Bob-Dave)
        with init(path, AgentIdentity(handle="dave")) as dave:
            threads = dave.list_threads()
            thread_ids = [t.thread_id for t in threads]

            assert len(threads) == 1, "Dave should only see 1 thread"
            assert bob_dave_thread in thread_ids, "Dave should see Bob-Dave thread"
            assert alice_bob_thread not in thread_ids, "Dave should NOT see Alice-Bob thread"
            assert charlie_alice_thread not in thread_ids, "Dave should NOT see Charlie-Alice thread"

    def test_non_participant_cannot_get_thread(self, multi_user_db):
        """Test that get_thread returns None for non-participants."""
        path, alice_bob_thread, bob_dave_thread, charlie_alice_thread = multi_user_db

        # Dave tries to get Alice-Bob thread
        with init(path, AgentIdentity(handle="dave")) as dave:
            thread = dave.get_thread(alice_bob_thread)
            assert thread is None, "Dave should not be able to get Alice-Bob thread"

            # Dave CAN get his own thread
            thread = dave.get_thread(bob_dave_thread)
            assert thread is not None, "Dave should be able to get Bob-Dave thread"

    def test_non_participant_cannot_list_thread_messages(self, multi_user_db):
        """Test that list_messages returns empty for non-participant thread."""
        path, alice_bob_thread, bob_dave_thread, charlie_alice_thread = multi_user_db

        # Dave tries to list messages in Alice-Bob thread
        with init(path, AgentIdentity(handle="dave")) as dave:
            messages = dave.list_messages(thread_id=alice_bob_thread)
            assert len(messages) == 0, "Dave should not see messages in Alice-Bob thread"

            # Dave CAN list messages in his own thread
            messages = dave.list_messages(thread_id=bob_dave_thread)
            assert len(messages) > 0, "Dave should see messages in Bob-Dave thread"

    def test_non_participant_cannot_get_message(self, multi_user_db):
        """Test that get_message returns None for non-participant."""
        path, alice_bob_thread, bob_dave_thread, charlie_alice_thread = multi_user_db

        # Get a message ID from Alice-Bob thread
        with init(path, AgentIdentity(handle="alice")) as alice:
            messages = alice.list_messages(thread_id=alice_bob_thread)
            message_id = messages[0].message_id

        # Dave tries to get that message
        with init(path, AgentIdentity(handle="dave")) as dave:
            message = dave.get_message(message_id)
            assert message is None, "Dave should not be able to get Alice-Bob message"

    def test_non_participant_cannot_reply(self, multi_user_db):
        """Test that reply fails for non-participants."""
        path, alice_bob_thread, bob_dave_thread, charlie_alice_thread = multi_user_db

        # Get a message ID from Alice-Bob thread
        with init(path, AgentIdentity(handle="alice")) as alice:
            messages = alice.list_messages(thread_id=alice_bob_thread)
            message_id = messages[0].message_id

        # Dave tries to reply
        with init(path, AgentIdentity(handle="dave")) as dave:
            with pytest.raises(ValueError, match="not found"):
                dave.reply(message_id, "Dave's unauthorized reply")

    def test_search_only_returns_participant_threads(self, multi_user_db):
        """Test that search only returns messages from threads user participates in."""
        path, alice_bob_thread, bob_dave_thread, charlie_alice_thread = multi_user_db

        # Dave searches for "conversation"
        with init(path, AgentIdentity(handle="dave")) as dave:
            results = dave.search_messages("conversation")

            # Dave should only see messages from Bob-Dave thread
            assert len(results) == 1, "Dave should only see 1 message"
            assert results[0].thread_id == bob_dave_thread, "Dave should only see Bob-Dave messages"

        # Alice searches for "conversation"
        with init(path, AgentIdentity(handle="alice")) as alice:
            results = alice.search_messages("conversation")

            # Alice should see messages from Alice-Bob and Charlie-Alice threads
            thread_ids = [m.thread_id for m in results]
            assert len(results) == 2, "Alice should see 2 messages"
            assert alice_bob_thread in thread_ids, "Alice should see Alice-Bob message"
            assert charlie_alice_thread in thread_ids, "Alice should see Charlie-Alice message"
            assert bob_dave_thread not in thread_ids, "Alice should NOT see Bob-Dave message"


class TestAdminAccess:
    """Tests that admin users can see all threads and messages."""

    def test_admin_sees_all_threads(self, multi_user_db):
        """Test that admin user sees all threads in the system."""
        path, alice_bob_thread, bob_dave_thread, charlie_alice_thread = multi_user_db

        # Create admin user
        with init(path, AgentIdentity(handle="system")) as system:
            system.address_book_add("admin", display_name="System Admin", tags=["admin"])

        # Admin should see ALL threads
        with init(path, AgentIdentity(handle="admin")) as admin:
            threads = admin.list_threads()
            thread_ids = [t.thread_id for t in threads]

            assert len(threads) == 3, "Admin should see all 3 threads"
            assert alice_bob_thread in thread_ids, "Admin should see Alice-Bob thread"
            assert bob_dave_thread in thread_ids, "Admin should see Bob-Dave thread"
            assert charlie_alice_thread in thread_ids, "Admin should see Charlie-Alice thread"

    def test_admin_can_get_any_thread(self, multi_user_db):
        """Test that admin can get any thread."""
        path, alice_bob_thread, bob_dave_thread, charlie_alice_thread = multi_user_db

        # Create admin user
        with init(path, AgentIdentity(handle="system")) as system:
            system.address_book_add("admin", display_name="System Admin", tags=["admin"])

        # Admin can get all threads
        with init(path, AgentIdentity(handle="admin")) as admin:
            thread1 = admin.get_thread(alice_bob_thread)
            thread2 = admin.get_thread(bob_dave_thread)
            thread3 = admin.get_thread(charlie_alice_thread)

            assert thread1 is not None, "Admin should access Alice-Bob thread"
            assert thread2 is not None, "Admin should access Bob-Dave thread"
            assert thread3 is not None, "Admin should access Charlie-Alice thread"

    def test_admin_can_list_any_thread_messages(self, multi_user_db):
        """Test that admin can list messages in any thread."""
        path, alice_bob_thread, bob_dave_thread, charlie_alice_thread = multi_user_db

        # Create admin user
        with init(path, AgentIdentity(handle="system")) as system:
            system.address_book_add("admin", display_name="System Admin", tags=["admin"])

        # Admin can list messages in all threads
        with init(path, AgentIdentity(handle="admin")) as admin:
            messages1 = admin.list_messages(thread_id=alice_bob_thread)
            messages2 = admin.list_messages(thread_id=bob_dave_thread)
            messages3 = admin.list_messages(thread_id=charlie_alice_thread)

            assert len(messages1) > 0, "Admin should see Alice-Bob messages"
            assert len(messages2) > 0, "Admin should see Bob-Dave messages"
            assert len(messages3) > 0, "Admin should see Charlie-Alice messages"

    def test_admin_search_returns_all_messages(self, multi_user_db):
        """Test that admin search returns messages from all threads."""
        path, alice_bob_thread, bob_dave_thread, charlie_alice_thread = multi_user_db

        # Create admin user
        with init(path, AgentIdentity(handle="system")) as system:
            system.address_book_add("admin", display_name="System Admin", tags=["admin"])

        # Admin searches for "conversation"
        with init(path, AgentIdentity(handle="admin")) as admin:
            results = admin.search_messages("conversation")
            thread_ids = [m.thread_id for m in results]

            # Admin should see all messages containing "conversation"
            assert len(results) == 3, "Admin should see all 3 messages"
            assert alice_bob_thread in thread_ids, "Admin should see Alice-Bob message"
            assert bob_dave_thread in thread_ids, "Admin should see Bob-Dave message"
            assert charlie_alice_thread in thread_ids, "Admin should see Charlie-Alice message"

    def test_admin_status_is_dynamic(self, multi_user_db):
        """Test that admin status is checked dynamically from address book."""
        path, alice_bob_thread, bob_dave_thread, charlie_alice_thread = multi_user_db

        # Create user without admin tag
        with init(path, AgentIdentity(handle="system")) as system:
            system.address_book_add("newuser", display_name="New User", tags=["regular"])

        # User should not see all threads
        with init(path, AgentIdentity(handle="newuser")) as user:
            threads = user.list_threads()
            assert len(threads) == 0, "Regular user should not see any threads"

        # Promote to admin
        with init(path, AgentIdentity(handle="system")) as system:
            entry = system.address_book_get("newuser")
            system.address_book_update(
                "newuser",
                display_name="New User",
                tags=["regular", "admin"],
                expected_version=entry.version
            )

        # User should now see all threads (new session picks up admin status)
        with init(path, AgentIdentity(handle="newuser")) as user:
            threads = user.list_threads()
            assert len(threads) == 3, "Admin user should see all threads"

        # Demote from admin
        with init(path, AgentIdentity(handle="system")) as system:
            entry = system.address_book_get("newuser")
            system.address_book_update(
                "newuser",
                display_name="New User",
                tags=["regular"],  # Remove admin tag
                expected_version=entry.version
            )

        # User should no longer see all threads
        with init(path, AgentIdentity(handle="newuser")) as user:
            threads = user.list_threads()
            assert len(threads) == 0, "Non-admin user should not see threads"


class TestParticipantFiltering:
    """Tests for various participant filtering scenarios."""

    def test_empty_inbox_for_new_user(self, multi_user_db):
        """Test that a new user with no threads sees empty inbox."""
        path, alice_bob_thread, bob_dave_thread, charlie_alice_thread = multi_user_db

        # Create new user Eve
        with init(path, AgentIdentity(handle="eve")) as eve:
            threads = eve.list_threads()
            assert len(threads) == 0, "New user should have empty inbox"

            messages = eve.list_messages()
            assert len(messages) == 0, "New user should have no messages"

    def test_user_sees_only_own_threads_after_reply(self, multi_user_db):
        """Test that after replying, both users see the same thread."""
        path, alice_bob_thread, bob_dave_thread, charlie_alice_thread = multi_user_db

        # Bob replies to Alice
        with init(path, AgentIdentity(handle="bob")) as bob:
            messages = bob.list_messages(thread_id=alice_bob_thread)
            bob.reply(messages[0].message_id, "Bob's reply")

        # Both Alice and Bob should see the thread
        with init(path, AgentIdentity(handle="alice")) as alice:
            threads = alice.list_threads()
            thread_ids = [t.thread_id for t in threads]
            assert alice_bob_thread in thread_ids, "Alice should see Alice-Bob thread"

        with init(path, AgentIdentity(handle="bob")) as bob:
            threads = bob.list_threads()
            thread_ids = [t.thread_id for t in threads]
            assert alice_bob_thread in thread_ids, "Bob should see Alice-Bob thread"

        # Charlie should NOT see it
        with init(path, AgentIdentity(handle="charlie")) as charlie:
            threads = charlie.list_threads()
            thread_ids = [t.thread_id for t in threads]
            assert alice_bob_thread not in thread_ids, "Charlie should NOT see Alice-Bob thread"

    def test_broadcast_creates_separate_filtered_threads(self):
        """Test that broadcast creates threads, each visible only to participants."""
        fd, path = tempfile.mkstemp(suffix='.db')
        os.close(fd)

        try:
            # Alice broadcasts to Bob, Charlie, and Dave
            with init(path, AgentIdentity(handle="alice")) as alice:
                messages = alice.send_broadcast(
                    ["bob", "charlie", "dave"],
                    "Broadcast",
                    "This is a broadcast message"
                )
                alice_threads = alice.list_threads()
                assert len(alice_threads) == 3, "Alice should see 3 threads"

            # Bob should only see Alice-Bob thread
            with init(path, AgentIdentity(handle="bob")) as bob:
                threads = bob.list_threads()
                assert len(threads) == 1, "Bob should see 1 thread"
                assert "bob" in threads[0].participant_handles
                assert "alice" in threads[0].participant_handles

            # Charlie should only see Alice-Charlie thread
            with init(path, AgentIdentity(handle="charlie")) as charlie:
                threads = charlie.list_threads()
                assert len(threads) == 1, "Charlie should see 1 thread"
                assert "charlie" in threads[0].participant_handles
                assert "alice" in threads[0].participant_handles

            # Dave should only see Alice-Dave thread
            with init(path, AgentIdentity(handle="dave")) as dave:
                threads = dave.list_threads()
                assert len(threads) == 1, "Dave should see 1 thread"
                assert "dave" in threads[0].participant_handles
                assert "alice" in threads[0].participant_handles

        finally:
            os.unlink(path)
