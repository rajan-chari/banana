"""Tests for agcom data models."""

import json
from datetime import datetime, timezone

from agcom.models import AddressBookEntry, AgentIdentity, AuditEvent, Message, Thread


class TestAgentIdentity:
    def test_create_with_handle(self):
        agent = AgentIdentity(handle="alice")
        assert agent.handle == "alice"
        assert agent.display_name is None

    def test_create_with_display_name(self):
        agent = AgentIdentity(handle="alice", display_name="Alice Smith")
        assert agent.display_name == "Alice Smith"


class TestMessage:
    def test_default_id_is_ulid(self):
        msg = Message()
        assert len(msg.id) == 26  # ULID length

    def test_unique_ids(self):
        ids = {Message().id for _ in range(10)}
        assert len(ids) == 10

    def test_default_timestamp(self):
        msg = Message()
        assert msg.timestamp.tzinfo == timezone.utc

    def test_recipients_json(self):
        msg = Message(recipients=["alice", "bob"])
        assert json.loads(msg.recipients_json()) == ["alice", "bob"]

    def test_tags_json(self):
        msg = Message(tags=["urgent", "review"])
        assert json.loads(msg.tags_json()) == ["urgent", "review"]

    def test_full_message(self):
        msg = Message(
            sender="alice",
            recipients=["bob"],
            subject="Hello",
            body="World",
            tags=["test"],
            reply_to="some-id",
        )
        assert msg.sender == "alice"
        assert msg.recipients == ["bob"]
        assert msg.subject == "Hello"
        assert msg.body == "World"
        assert msg.reply_to == "some-id"


class TestThread:
    def test_default_id_is_ulid(self):
        t = Thread()
        assert len(t.id) == 26

    def test_defaults(self):
        t = Thread()
        assert t.participants == []
        assert t.metadata == {}
        assert t.archived is False

    def test_participants_json(self):
        t = Thread(participants=["alice", "bob"])
        assert json.loads(t.participants_json()) == ["alice", "bob"]

    def test_metadata_json(self):
        t = Thread(metadata={"priority": "high"})
        assert json.loads(t.metadata_json()) == {"priority": "high"}


class TestAddressBookEntry:
    def test_defaults(self):
        entry = AddressBookEntry(handle="alice")
        assert entry.active is True
        assert entry.version == 1
        assert entry.tags == []

    def test_tags_json(self):
        entry = AddressBookEntry(handle="alice", tags=["admin", "dev"])
        assert json.loads(entry.tags_json()) == ["admin", "dev"]


class TestAuditEvent:
    def test_default_id_is_ulid(self):
        e = AuditEvent()
        assert len(e.id) == 26

    def test_details_json(self):
        e = AuditEvent(details={"key": "value"})
        assert json.loads(e.details_json()) == {"key": "value"}

    def test_optional_target(self):
        e = AuditEvent(event_type="test", actor="alice")
        assert e.target is None
