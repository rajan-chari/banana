"""Tests for agcom session management."""

import pytest

from agcom.models import AgentIdentity
from agcom.session import Session
from agcom.storage import Storage


@pytest.fixture
def storage(tmp_path):
    return Storage(tmp_path / "test.db")


@pytest.fixture
def alice_session(storage):
    return Session(storage, AgentIdentity("alice", "Alice"), is_admin=False)


@pytest.fixture
def bob_session(storage):
    return Session(storage, AgentIdentity("bob", "Bob"), is_admin=False)


@pytest.fixture
def admin_session(storage):
    return Session(storage, AgentIdentity("admin", "Admin"), is_admin=True)


class TestSendMessage:
    def test_send_creates_thread(self, alice_session, storage):
        msg = alice_session.send_message(["bob"], "Hello", "Hi Bob")
        assert msg.sender == "alice"
        assert msg.recipients == ["bob"]
        assert msg.thread_id

        thread = storage.get_thread(msg.thread_id)
        assert thread is not None
        assert "alice" in thread.participants
        assert "bob" in thread.participants

    def test_send_creates_audit_event(self, alice_session, storage):
        alice_session.send_message(["bob"], "Hello", "Hi Bob")
        events = storage.list_audit_events(event_type="message_sent")
        assert len(events) == 1
        assert events[0].actor == "alice"

    def test_send_validates_recipients(self, alice_session):
        with pytest.raises(ValueError, match="non-empty"):
            alice_session.send_message([], "Hello", "Hi")

    def test_send_validates_subject(self, alice_session):
        with pytest.raises(ValueError, match="empty"):
            alice_session.send_message(["bob"], "", "Hi")

    def test_send_validates_body(self, alice_session):
        with pytest.raises(ValueError, match="empty"):
            alice_session.send_message(["bob"], "Hello", "")

    def test_send_with_tags(self, alice_session):
        msg = alice_session.send_message(["bob"], "Hello", "Hi", tags=["urgent"])
        assert msg.tags == ["urgent"]

    def test_send_multiple_recipients(self, alice_session, storage):
        msg = alice_session.send_message(["bob", "charlie"], "Hello", "Hi")
        thread = storage.get_thread(msg.thread_id)
        assert set(thread.participants) == {"alice", "bob", "charlie"}


class TestReply:
    def test_reply_to_message(self, alice_session, bob_session):
        msg = alice_session.send_message(["bob"], "Hello", "Hi Bob")

        reply = bob_session.reply(msg.id, "Hi Alice!")
        assert reply.sender == "bob"
        assert reply.recipients == ["alice"]  # reply goes to original sender
        assert reply.reply_to == msg.id
        assert reply.thread_id == msg.thread_id

    def test_reply_to_own_message(self, alice_session, bob_session):
        msg = alice_session.send_message(["bob"], "Hello", "Hi Bob")

        reply = alice_session.reply(msg.id, "Forgot to add...")
        assert reply.sender == "alice"
        assert reply.recipients == ["bob"]  # reply goes to original recipients

    def test_reply_expands_participants(self, alice_session, bob_session, storage):
        msg = alice_session.send_message(["bob"], "Hello", "Hi Bob")

        charlie = Session(storage, AgentIdentity("charlie"), is_admin=True)
        # Admin can see the thread and reply
        charlie.reply(msg.id, "I'm joining!")

        thread = storage.get_thread(msg.thread_id)
        assert "charlie" in thread.participants

    def test_reply_to_nonexistent(self, alice_session):
        with pytest.raises(ValueError, match="not found"):
            alice_session.reply("nonexistent", "Hi")

    def test_reply_creates_audit(self, alice_session, bob_session, storage):
        msg = alice_session.send_message(["bob"], "Hello", "Hi")
        bob_session.reply(msg.id, "Hi back")

        events = storage.list_audit_events(event_type="message_replied")
        assert len(events) == 1
        assert events[0].actor == "bob"


class TestReplyToThread:
    def test_reply_to_thread(self, alice_session, bob_session):
        msg = alice_session.send_message(["bob"], "Hello", "Hi Bob")
        reply = bob_session.reply_to_thread(msg.thread_id, "Hi Alice!")
        assert reply.sender == "bob"
        assert reply.thread_id == msg.thread_id
        assert reply.reply_to == msg.id  # reply_to is the latest message

    def test_reply_to_nonexistent_thread(self, alice_session):
        with pytest.raises(ValueError, match="not found"):
            alice_session.reply_to_thread("nonexistent", "Hi")


class TestBroadcast:
    def test_broadcast_creates_separate_threads(self, alice_session, storage):
        messages = alice_session.broadcast(["bob", "charlie"], "Announcement", "Big news!")
        assert len(messages) == 2

        thread_ids = {m.thread_id for m in messages}
        assert len(thread_ids) == 2  # separate threads

        for msg in messages:
            thread = storage.get_thread(msg.thread_id)
            assert "alice" in thread.participants
            assert len(thread.participants) == 2

    def test_broadcast_audit(self, alice_session, storage):
        alice_session.broadcast(["bob", "charlie"], "News", "Big news!")
        events = storage.list_audit_events(event_type="message_broadcast")
        assert len(events) == 2


class TestVisibility:
    def test_non_admin_sees_own_threads(self, alice_session, bob_session):
        alice_session.send_message(["bob"], "AB thread", "Hi")
        alice_session.send_message(["charlie"], "AC thread", "Hi")

        threads = bob_session.list_threads()
        assert len(threads) == 1
        assert threads[0].subject == "AB thread"

    def test_admin_sees_all_threads(self, alice_session, admin_session):
        alice_session.send_message(["bob"], "AB thread", "Hi")

        threads = admin_session.list_threads()
        assert len(threads) == 1  # admin sees it despite not being participant

    def test_non_admin_cannot_get_others_thread(self, alice_session, bob_session):
        msg = alice_session.send_message(["charlie"], "AC thread", "Hi")
        thread = bob_session.get_thread(msg.thread_id)
        assert thread is None

    def test_non_admin_cannot_get_others_message(self, alice_session, bob_session):
        msg = alice_session.send_message(["charlie"], "AC thread", "Hi")
        result = bob_session.get_message(msg.id)
        assert result is None

    def test_non_admin_search_filtered(self, alice_session, bob_session):
        alice_session.send_message(["bob"], "Visible", "shared content")
        alice_session.send_message(["charlie"], "Hidden", "shared content")

        results = bob_session.search_messages("shared content")
        assert len(results) == 1
        assert results[0].subject == "Visible"

    def test_get_thread_messages_denied(self, alice_session, bob_session):
        msg = alice_session.send_message(["charlie"], "AC", "Hi")
        with pytest.raises(ValueError, match="access denied"):
            bob_session.get_thread_messages(msg.thread_id)


class TestThreadMetadata:
    def test_set_and_get(self, alice_session):
        msg = alice_session.send_message(["bob"], "Test", "Hi")
        alice_session.set_thread_metadata(msg.thread_id, "status", "open")

        meta = alice_session.get_thread_metadata(msg.thread_id)
        assert meta == {"status": "open"}

    def test_remove(self, alice_session):
        msg = alice_session.send_message(["bob"], "Test", "Hi")
        alice_session.set_thread_metadata(msg.thread_id, "a", "1")
        alice_session.set_thread_metadata(msg.thread_id, "b", "2")
        alice_session.remove_thread_metadata(msg.thread_id, "a")

        meta = alice_session.get_thread_metadata(msg.thread_id)
        assert meta == {"b": "2"}

    def test_metadata_visibility(self, alice_session, bob_session):
        msg = alice_session.send_message(["charlie"], "Test", "Hi")
        with pytest.raises(ValueError, match="access denied"):
            bob_session.set_thread_metadata(msg.thread_id, "x", "y")


class TestArchive:
    def test_archive_and_unarchive(self, alice_session):
        msg = alice_session.send_message(["bob"], "Test", "Hi")
        alice_session.archive_thread(msg.thread_id)

        threads = alice_session.list_threads()
        assert len(threads) == 0

        threads = alice_session.list_threads(include_archived=True)
        assert len(threads) == 1

        alice_session.unarchive_thread(msg.thread_id)
        threads = alice_session.list_threads()
        assert len(threads) == 1

    def test_archive_audit(self, alice_session, storage):
        msg = alice_session.send_message(["bob"], "Test", "Hi")
        alice_session.archive_thread(msg.thread_id)

        events = storage.list_audit_events(event_type="thread_archived")
        assert len(events) == 1


class TestContacts:
    def test_add_contact(self, alice_session):
        entry = alice_session.add_contact("bob", display_name="Bob", tags=["dev"])
        assert entry.handle == "bob"
        assert entry.display_name == "Bob"
        assert entry.tags == ["dev"]

    def test_update_contact(self, alice_session):
        alice_session.add_contact("bob")
        updated = alice_session.update_contact("bob", version=1, display_name="Robert")
        assert updated.display_name == "Robert"
        assert updated.version == 2

    def test_get_contact(self, alice_session):
        alice_session.add_contact("bob", display_name="Bob")
        entry = alice_session.get_contact("bob")
        assert entry is not None
        assert entry.display_name == "Bob"

    def test_list_contacts(self, alice_session):
        alice_session.add_contact("bob")
        alice_session.add_contact("charlie")
        contacts = alice_session.list_contacts()
        assert len(contacts) == 2

    def test_deactivate_contact(self, alice_session):
        alice_session.add_contact("bob")
        deactivated = alice_session.deactivate_contact("bob", version=1)
        assert deactivated.active is False

        contacts = alice_session.list_contacts(active_only=True)
        assert len(contacts) == 0

    def test_contact_audit(self, alice_session, storage):
        alice_session.add_contact("bob")
        events = storage.list_audit_events(event_type="contact_added")
        assert len(events) == 1
        assert events[0].target == "bob"


class TestAuditEvents:
    def test_list_with_filters(self, alice_session, storage):
        alice_session.send_message(["bob"], "Hello", "Hi")
        alice_session.add_contact("charlie")

        all_events = alice_session.list_audit_events()
        assert len(all_events) >= 2

        msg_events = alice_session.list_audit_events(event_type="message_sent")
        assert len(msg_events) == 1

        alice_events = alice_session.list_audit_events(actor="alice")
        assert len(alice_events) >= 2
