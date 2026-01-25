"""Demo script for the Agent Communication system.

This script demonstrates the core features of the agcom library including:
- Sending messages
- Replying to messages
- Using the address book
- Viewing threads and inbox
- Multi-agent communication
"""

import os
import sys
import tempfile
from agcom import init, AgentIdentity

# Fix Windows console encoding
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def main():
    """Run the demo."""
    # Create a temporary database
    fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(fd)

    print("=" * 80)
    print("Agent Communication Demo")
    print("=" * 80)
    print()

    try:
        # Demo 1: Alice sends a message
        print("1. Alice sends a message to Bob")
        print("-" * 80)
        with init(db_path, AgentIdentity(handle="alice", display_name="Alice Smith")) as alice:
            # Add Bob to address book
            alice.address_book_add(
                handle="bob",
                display_name="Bob Jones",
                description="Senior Developer"
            )

            # Send a message
            thread_id, message_id = alice.send(
                to_handles=["bob"],
                subject="Project Discussion",
                body="Hi Bob, can we meet tomorrow to discuss the new project requirements?",
                tags=["meeting", "project"]
            )

            print(f"[OK] Message sent")
            print(f"  Thread ID: {thread_id}")
            print(f"  Message ID: {message_id}")
            print()

        # Demo 2: Bob replies
        print("2. Bob replies to Alice")
        print("-" * 80)
        with init(db_path, AgentIdentity(handle="bob", display_name="Bob Jones")) as bob:
            # Add Alice to address book
            bob.address_book_add(
                handle="alice",
                display_name="Alice Smith",
                description="Project Manager"
            )

            # Reply to the message
            reply_id = bob.reply(
                message_id=message_id,
                body="Sure! I'm available at 2pm. Let me know if that works for you."
            )

            print(f"[OK] Reply sent")
            print(f"  Message ID: {reply_id}")
            print()

        # Demo 3: Alice views the thread
        print("3. Alice views the thread")
        print("-" * 80)
        with init(db_path, AgentIdentity(handle="alice")) as alice:
            output = alice.view_thread(thread_id)
            print(output)
            print()

        # Demo 4: Alice views her inbox
        print("4. Alice views her inbox")
        print("-" * 80)
        with init(db_path, AgentIdentity(handle="alice")) as alice:
            output = alice.current_screen()
            print(output)
            print()

        # Demo 5: Charlie joins the conversation
        print("5. Charlie joins and sends a message")
        print("-" * 80)
        with init(db_path, AgentIdentity(handle="charlie", display_name="Charlie Brown")) as charlie:
            # Charlie sends a new message to both Alice and Bob
            thread_id2, message_id2 = charlie.send(
                to_handles=["alice", "bob"],
                subject="Team Lunch",
                body="Hey team! Want to grab lunch next Tuesday?",
                tags=["social"]
            )

            print(f"[OK] Message sent")
            print(f"  Thread ID: {thread_id2}")
            print(f"  Message ID: {message_id2}")
            print()

        # Demo 6: Alice views her updated inbox
        print("6. Alice's updated inbox")
        print("-" * 80)
        with init(db_path, AgentIdentity(handle="alice")) as alice:
            output = alice.current_screen()
            print(output)
            print()

        # Demo 7: Search messages
        print("7. Alice searches for 'project' messages")
        print("-" * 80)
        with init(db_path, AgentIdentity(handle="alice")) as alice:
            results = alice.search_messages("project")
            print(f"Found {len(results)} message(s):")
            for msg in results:
                print(f"  - [{msg.subject}] from {msg.from_handle}")
            print()

        # Demo 8: Address book operations
        print("8. Alice updates Bob's address book entry")
        print("-" * 80)
        with init(db_path, AgentIdentity(handle="alice")) as alice:
            # Get current entry
            entry = alice.address_book_get("bob")
            print(f"Current entry: {entry.display_name} - {entry.description} (version {entry.version})")

            # Update it
            alice.address_book_update(
                handle="bob",
                display_name="Bob Jones",
                description="Lead Developer"  # Updated description
            )

            # Get updated entry
            entry = alice.address_book_get("bob")
            print(f"Updated entry: {entry.display_name} - {entry.description} (version {entry.version})")
            print()

        # Demo 9: View audit log
        print("9. View audit log for Bob")
        print("-" * 80)
        with init(db_path, AgentIdentity(handle="alice")) as alice:
            events = alice.audit_list(target_handle="bob")
            print(f"Found {len(events)} audit event(s):")
            for event in events:
                print(f"  - {event.event_type} by {event.actor_handle} at {event.timestamp.strftime('%Y-%m-%d %H:%M:%S')}")
            print()

        # Demo 10: List all threads
        print("10. List all threads")
        print("-" * 80)
        with init(db_path, AgentIdentity(handle="alice")) as alice:
            threads = alice.list_threads()
            print(f"Total threads: {len(threads)}")
            for thread in threads:
                print(f"  - [{thread.subject}] with {', '.join(thread.participant_handles)}")
                print(f"    Last activity: {thread.last_activity_at.strftime('%Y-%m-%d %H:%M:%S')}")
            print()

        print("=" * 80)
        print("Demo completed successfully!")
        print("=" * 80)
        print()
        print(f"Database file: {db_path}")
        print("You can explore it further using:")
        print(f"  python -m agcom.console --store {db_path} --me alice")

    finally:
        # Clean up (optional - comment out to keep the database)
        if os.path.exists(db_path):
            print(f"\nCleaning up demo database: {db_path}")
            os.unlink(db_path)
            print("Demo database removed.")


if __name__ == '__main__':
    main()
