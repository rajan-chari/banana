#!/usr/bin/env python
"""Test script for participant-based filtering and admin user support."""

import tempfile
import os
from agcom import init, AgentIdentity

def test_basic_participant_filtering():
    """Test that users can only see threads they participate in."""
    print("Test 1: Basic Participant Filtering")
    print("=" * 60)

    # Create temporary database
    fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(fd)

    try:
        # Alice sends a message to Bob
        with init(db_path, AgentIdentity(handle="alice")) as session:
            session.address_book_add("bob", display_name="Bob Smith")
            msg = session.send(["bob"], "Secret Message", "This is between Alice and Bob")
            print(f"[OK] Alice sent message to Bob: {msg.message_id}")

        # Alice can see the thread
        with init(db_path, AgentIdentity(handle="alice")) as session:
            threads = session.list_threads()
            print(f"[OK] Alice sees {len(threads)} thread(s)")
            assert len(threads) == 1, "Alice should see the thread"

        # Charlie (not a participant) should not see the thread
        with init(db_path, AgentIdentity(handle="charlie")) as session:
            threads = session.list_threads()
            print(f"[OK] Charlie sees {len(threads)} thread(s)")
            assert len(threads) == 0, "Charlie should NOT see the thread"

        print("[PASS] Test 1: Participant filtering works correctly\n")

    finally:
        os.unlink(db_path)


def test_admin_user_sees_everything():
    """Test that admin users can see all threads."""
    print("Test 2: Admin User Can See Everything")
    print("=" * 60)

    # Create temporary database
    fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(fd)

    try:
        # Alice sends a message to Bob
        with init(db_path, AgentIdentity(handle="alice")) as session:
            session.address_book_add("bob", display_name="Bob Smith")
            session.send(["bob"], "Alice to Bob", "Private message")
            print("[OK] Alice sent message to Bob")

        # Create Charlie as a regular user (should not see Alice-Bob thread)
        with init(db_path, AgentIdentity(handle="charlie")) as session:
            threads = session.list_threads()
            print(f"[OK] Charlie (regular user) sees {len(threads)} thread(s)")
            assert len(threads) == 0, "Regular user should not see other threads"

        # Add Charlie to address book with admin tag
        with init(db_path, AgentIdentity(handle="alice")) as session:
            session.address_book_add("charlie", display_name="Charlie Admin", tags=["admin"])
            print("[OK] Charlie added to address book with 'admin' tag")

        # Now Charlie (as admin) should see all threads
        with init(db_path, AgentIdentity(handle="charlie")) as session:
            threads = session.list_threads()
            print(f"[OK] Charlie (admin) sees {len(threads)} thread(s)")
            assert len(threads) == 1, "Admin user should see all threads"
            assert threads[0].subject == "Alice to Bob"
            print(f"  - Thread subject: {threads[0].subject}")
            print(f"  - Participants: {threads[0].participant_handles}")

        print("[PASS] Test 2: Admin users can see all threads\n")

    finally:
        os.unlink(db_path)


def test_get_thread_returns_none_for_non_participant():
    """Test that get_thread returns None for non-participants (404 behavior)."""
    print("Test 3: Get Non-Participant Thread Returns None")
    print("=" * 60)

    # Create temporary database
    fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(fd)

    try:
        # Alice sends a message to Bob
        thread_id = None
        with init(db_path, AgentIdentity(handle="alice")) as session:
            session.address_book_add("bob", display_name="Bob Smith")
            msg = session.send(["bob"], "Private Thread", "Secret content")
            thread_id = msg.thread_id
            print(f"[OK] Alice created thread: {thread_id}")

        # Alice can get the thread
        with init(db_path, AgentIdentity(handle="alice")) as session:
            thread = session.get_thread(thread_id)
            assert thread is not None, "Alice should be able to get the thread"
            print(f"[OK] Alice can retrieve thread: {thread.subject}")

        # Charlie (not a participant) cannot get the thread
        with init(db_path, AgentIdentity(handle="charlie")) as session:
            thread = session.get_thread(thread_id)
            assert thread is None, "Charlie should NOT be able to get the thread"
            print("[OK] Charlie gets None when trying to access the thread")

        print("[PASS] Test 3: Non-participants cannot access threads\n")

    finally:
        os.unlink(db_path)


def test_search_filters_by_participant():
    """Test that search results are filtered by participant."""
    print("Test 4: Search Filters by Participant")
    print("=" * 60)

    # Create temporary database
    fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(fd)

    try:
        # Alice sends messages to Bob and Charlie
        with init(db_path, AgentIdentity(handle="alice")) as session:
            session.address_book_add("bob", display_name="Bob Smith")
            session.address_book_add("charlie", display_name="Charlie Brown")
            session.send(["bob"], "Project Update", "Important project information")
            session.send(["charlie"], "Meeting Notes", "Important meeting details")
            print("[OK] Alice sent 2 messages with 'Important' in body")

        # Alice searches for "Important" - should find 2 messages
        with init(db_path, AgentIdentity(handle="alice")) as session:
            results = session.search_messages("Important")
            print(f"[OK] Alice's search finds {len(results)} message(s)")
            assert len(results) == 2, "Alice should find both messages"

        # Bob searches for "Important" - should only find 1 message
        with init(db_path, AgentIdentity(handle="bob")) as session:
            results = session.search_messages("Important")
            print(f"[OK] Bob's search finds {len(results)} message(s)")
            assert len(results) == 1, "Bob should only find his message"
            assert results[0].subject == "Project Update"

        # Charlie searches for "Important" - should only find 1 message
        with init(db_path, AgentIdentity(handle="charlie")) as session:
            results = session.search_messages("Important")
            print(f"[OK] Charlie's search finds {len(results)} message(s)")
            assert len(results) == 1, "Charlie should only find his message"
            assert results[0].subject == "Meeting Notes"

        print("[PASS] Test 4: Search is filtered by participant\n")

    finally:
        os.unlink(db_path)


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("PARTICIPANT-BASED FILTERING & ADMIN USER TESTS")
    print("=" * 60 + "\n")

    test_basic_participant_filtering()
    test_admin_user_sees_everything()
    test_get_thread_returns_none_for_non_participant()
    test_search_filters_by_participant()

    print("=" * 60)
    print("ALL TESTS PASSED")
    print("=" * 60)
