"""Tests for agcom storage layer."""

import time

import pytest

from agcom.models import AddressBookEntry, AuditEvent, Message, Thread
from agcom.storage import Storage


@pytest.fixture
def storage(tmp_path):
    return Storage(tmp_path / "test.db")


class TestMessageStorage:
    def test_save_and_get(self, storage):
        msg = Message(sender="alice", recipients=["bob"], subject="Hi", body="Hello")
        msg.thread_id = "thread-1"
        storage.save_message(msg)

        loaded = storage.get_message(msg.id)
        assert loaded is not None
        assert loaded.id == msg.id
        assert loaded.sender == "alice"
        assert loaded.recipients == ["bob"]
        assert loaded.subject == "Hi"
        assert loaded.body == "Hello"

    def test_get_nonexistent(self, storage):
        assert storage.get_message("nonexistent") is None

    def test_list_by_thread(self, storage):
        for i in range(3):
            msg = Message(
                thread_id="t1", sender="alice", recipients=["bob"],
                subject="s", body=f"msg {i}",
            )
            storage.save_message(msg)

        msg_other = Message(
            thread_id="t2", sender="alice", recipients=["bob"],
            subject="s", body="other",
        )
        storage.save_message(msg_other)

        results = storage.list_messages(thread_id="t1")
        assert len(results) == 3
        assert all(m.thread_id == "t1" for m in results)

    def test_list_with_pagination(self, storage):
        for i in range(5):
            storage.save_message(Message(
                thread_id="t1", sender="alice", recipients=["bob"],
                subject="s", body=f"msg {i}",
            ))

        page1 = storage.list_messages(thread_id="t1", limit=2, offset=0)
        page2 = storage.list_messages(thread_id="t1", limit=2, offset=2)
        assert len(page1) == 2
        assert len(page2) == 2
        assert page1[0].id != page2[0].id

    def test_search_by_subject(self, storage):
        storage.save_message(Message(
            thread_id="t1", sender="alice", recipients=["bob"],
            subject="Important Task", body="details",
        ))
        storage.save_message(Message(
            thread_id="t1", sender="alice", recipients=["bob"],
            subject="Other", body="stuff",
        ))

        results = storage.search_messages("Important")
        assert len(results) == 1
        assert results[0].subject == "Important Task"

    def test_search_by_body(self, storage):
        storage.save_message(Message(
            thread_id="t1", sender="alice", recipients=["bob"],
            subject="s", body="The secret code is 42",
        ))

        results = storage.search_messages("secret code")
        assert len(results) == 1

    def test_search_with_sender_filter(self, storage):
        storage.save_message(Message(
            thread_id="t1", sender="alice", recipients=["bob"],
            subject="Hello", body="from alice",
        ))
        storage.save_message(Message(
            thread_id="t1", sender="bob", recipients=["alice"],
            subject="Hello", body="from bob",
        ))

        results = storage.search_messages("Hello", sender="alice")
        assert len(results) == 1
        assert results[0].sender == "alice"

    def test_search_with_recipient_filter(self, storage):
        storage.save_message(Message(
            thread_id="t1", sender="alice", recipients=["bob"],
            subject="Hello", body="test",
        ))
        storage.save_message(Message(
            thread_id="t1", sender="alice", recipients=["charlie"],
            subject="Hello", body="test",
        ))

        results = storage.search_messages("Hello", recipient="bob")
        assert len(results) == 1
        assert "bob" in results[0].recipients

    def test_get_messages_since(self, storage):
        msgs = []
        for i in range(3):
            msg = Message(
                thread_id="t1", sender="alice", recipients=["bob"],
                subject="s", body=f"msg {i}",
            )
            storage.save_message(msg)
            msgs.append(msg)
            time.sleep(0.01)  # Ensure different ULIDs

        results = storage.get_messages_since(msgs[0].id)
        assert len(results) == 2
        assert results[0].id == msgs[1].id
        assert results[1].id == msgs[2].id


class TestThreadStorage:
    def test_save_and_get(self, storage):
        thread = Thread(subject="Test", participants=["alice", "bob"])
        storage.save_thread(thread)

        loaded = storage.get_thread(thread.id)
        assert loaded is not None
        assert loaded.subject == "Test"
        assert loaded.participants == ["alice", "bob"]
        assert loaded.archived is False

    def test_get_nonexistent(self, storage):
        assert storage.get_thread("nonexistent") is None

    def test_list_by_participant(self, storage):
        storage.save_thread(Thread(subject="AB", participants=["alice", "bob"]))
        storage.save_thread(Thread(subject="AC", participants=["alice", "charlie"]))
        storage.save_thread(Thread(subject="BC", participants=["bob", "charlie"]))

        results = storage.list_threads(participant="alice")
        assert len(results) == 2

    def test_list_excludes_archived(self, storage):
        t1 = Thread(subject="Active", participants=["alice"])
        t2 = Thread(subject="Archived", participants=["alice"], archived=True)
        storage.save_thread(t1)
        storage.save_thread(t2)

        results = storage.list_threads(participant="alice")
        assert len(results) == 1
        assert results[0].subject == "Active"

    def test_list_includes_archived(self, storage):
        storage.save_thread(Thread(subject="Active", participants=["alice"]))
        storage.save_thread(Thread(subject="Archived", participants=["alice"], archived=True))

        results = storage.list_threads(participant="alice", include_archived=True)
        assert len(results) == 2

    def test_update_thread(self, storage):
        thread = Thread(subject="Test", participants=["alice"])
        storage.save_thread(thread)

        thread.participants = ["alice", "bob"]
        thread.metadata = {"status": "open"}
        storage.update_thread(thread)

        loaded = storage.get_thread(thread.id)
        assert loaded.participants == ["alice", "bob"]
        assert loaded.metadata == {"status": "open"}

    def test_update_metadata(self, storage):
        thread = Thread(subject="Test", participants=["alice"])
        storage.save_thread(thread)

        storage.update_thread_metadata(thread.id, "priority", "high")
        loaded = storage.get_thread(thread.id)
        assert loaded.metadata == {"priority": "high"}

    def test_remove_metadata(self, storage):
        thread = Thread(subject="Test", participants=["alice"], metadata={"a": "1", "b": "2"})
        storage.save_thread(thread)

        storage.remove_thread_metadata(thread.id, "a")
        loaded = storage.get_thread(thread.id)
        assert loaded.metadata == {"b": "2"}

    def test_archive_unarchive(self, storage):
        thread = Thread(subject="Test", participants=["alice"])
        storage.save_thread(thread)

        storage.archive_thread(thread.id)
        loaded = storage.get_thread(thread.id)
        assert loaded.archived is True

        storage.unarchive_thread(thread.id)
        loaded = storage.get_thread(thread.id)
        assert loaded.archived is False

    def test_metadata_nonexistent_thread(self, storage):
        with pytest.raises(ValueError, match="not found"):
            storage.update_thread_metadata("nonexistent", "key", "val")

    def test_remove_metadata_nonexistent_thread(self, storage):
        with pytest.raises(ValueError, match="not found"):
            storage.remove_thread_metadata("nonexistent", "key")


class TestContactStorage:
    def test_save_and_get(self, storage):
        entry = AddressBookEntry(handle="alice", display_name="Alice", tags=["admin"])
        storage.save_contact(entry)

        loaded = storage.get_contact("alice")
        assert loaded is not None
        assert loaded.display_name == "Alice"
        assert loaded.tags == ["admin"]
        assert loaded.version == 1

    def test_get_nonexistent(self, storage):
        assert storage.get_contact("nonexistent") is None

    def test_list_active_only(self, storage):
        storage.save_contact(AddressBookEntry(handle="alice", active=True))
        storage.save_contact(AddressBookEntry(handle="bob", active=False))

        results = storage.list_contacts(active_only=True)
        assert len(results) == 1
        assert results[0].handle == "alice"

    def test_list_all(self, storage):
        storage.save_contact(AddressBookEntry(handle="alice", active=True))
        storage.save_contact(AddressBookEntry(handle="bob", active=False))

        results = storage.list_contacts(active_only=False)
        assert len(results) == 2

    def test_list_search(self, storage):
        storage.save_contact(AddressBookEntry(handle="alice", display_name="Alice Smith"))
        storage.save_contact(AddressBookEntry(handle="bob", display_name="Bob Jones"))

        results = storage.list_contacts(search="smith")
        assert len(results) == 1
        assert results[0].handle == "alice"

    def test_list_by_tag(self, storage):
        storage.save_contact(AddressBookEntry(handle="alice", tags=["admin"]))
        storage.save_contact(AddressBookEntry(handle="bob", tags=["dev"]))

        results = storage.list_contacts(tag="admin")
        assert len(results) == 1
        assert results[0].handle == "alice"

    def test_update_with_version(self, storage):
        storage.save_contact(AddressBookEntry(handle="alice", display_name="Alice"))

        updated = storage.update_contact("alice", version=1, display_name="Alice Smith")
        assert updated.display_name == "Alice Smith"
        assert updated.version == 2

    def test_update_version_conflict(self, storage):
        storage.save_contact(AddressBookEntry(handle="alice", display_name="Alice"))

        with pytest.raises(ValueError, match="Version conflict"):
            storage.update_contact("alice", version=99, display_name="Alice Smith")

    def test_update_nonexistent(self, storage):
        with pytest.raises(ValueError, match="not found"):
            storage.update_contact("nonexistent", version=1, display_name="X")

    def test_deactivate(self, storage):
        storage.save_contact(AddressBookEntry(handle="alice"))

        deactivated = storage.deactivate_contact("alice", version=1)
        assert deactivated.active is False
        assert deactivated.version == 2


class TestAuditEventStorage:
    def test_save_and_list(self, storage):
        event = AuditEvent(event_type="message_sent", actor="alice", target="thread-1")
        storage.save_audit_event(event)

        results = storage.list_audit_events()
        assert len(results) == 1
        assert results[0].event_type == "message_sent"

    def test_filter_by_type(self, storage):
        storage.save_audit_event(AuditEvent(event_type="message_sent", actor="alice"))
        storage.save_audit_event(AuditEvent(event_type="contact_added", actor="alice"))

        results = storage.list_audit_events(event_type="message_sent")
        assert len(results) == 1

    def test_filter_by_actor(self, storage):
        storage.save_audit_event(AuditEvent(event_type="test", actor="alice"))
        storage.save_audit_event(AuditEvent(event_type="test", actor="bob"))

        results = storage.list_audit_events(actor="alice")
        assert len(results) == 1

    def test_filter_by_target(self, storage):
        storage.save_audit_event(AuditEvent(event_type="test", actor="alice", target="t1"))
        storage.save_audit_event(AuditEvent(event_type="test", actor="alice", target="t2"))

        results = storage.list_audit_events(target="t1")
        assert len(results) == 1


class TestStats:
    def test_empty_stats(self, storage):
        stats = storage.get_stats()
        assert stats == {"thread_count": 0, "message_count": 0, "user_count": 0}

    def test_stats_counts(self, storage):
        storage.save_thread(Thread(subject="t", participants=["alice"]))
        storage.save_message(Message(
            thread_id="t1", sender="alice", recipients=["bob"],
            subject="s", body="b",
        ))
        storage.save_contact(AddressBookEntry(handle="alice", active=True))
        storage.save_contact(AddressBookEntry(handle="bob", active=False))

        stats = storage.get_stats()
        assert stats["thread_count"] == 1
        assert stats["message_count"] == 1
        assert stats["user_count"] == 1  # only active
