"""Tests for emcom_server.db.Database."""

import os
import tempfile
import pytest
from emcom_server.db import Database, SEED_NAMES


@pytest.fixture
def db(tmp_path):
    return Database(tmp_path / "test.db")


class TestSchema:
    def test_creates_tables(self, db):
        """Schema creation succeeds without error."""
        assert db is not None

    def test_name_pool_seeded(self, db):
        names = db.available_names()
        assert len(names) == len(SEED_NAMES)
        assert "alice" in names
        assert "bob" in names


class TestIdentity:
    def test_register(self, db):
        result = db.register("alice", "test agent")
        assert result["name"] == "alice"
        assert result["active"]

    def test_register_duplicate_fails(self, db):
        db.register("alice", "first")
        with pytest.raises(Exception):
            db.register("alice", "second")

    def test_unregister(self, db):
        db.register("alice", "test")
        assert db.unregister("alice") is True
        assert not db.is_registered("alice")

    def test_unregister_nonexistent(self, db):
        assert db.unregister("nobody") is False

    def test_register_unregister_reregister(self, db):
        db.register("alice", "v1")
        db.unregister("alice")
        # Force re-register
        result = db.force_register("alice", "v2")
        assert result["active"]
        assert result["description"] == "v2"

    def test_list_identities(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        db.unregister("bob")
        active = db.list_identities()
        assert len(active) == 1
        assert active[0]["name"] == "alice"

    def test_update_description(self, db):
        db.register("alice", "old")
        result = db.update_description("alice", "new")
        assert result["description"] == "new"

    def test_touch_last_seen(self, db):
        result = db.register("alice", "test")
        old_seen = result["last_seen"]
        db.touch_last_seen("alice")
        updated = db.get_identity("alice")
        assert updated["last_seen"] >= old_seen


class TestNamePool:
    def test_assign_name(self, db):
        name = db.assign_name()
        assert name in SEED_NAMES

    def test_assign_name_removes_from_available(self, db):
        name = db.assign_name()
        db.register(name, "claimed")
        available = db.available_names()
        assert name not in available

    def test_add_names(self, db):
        added = db.add_names(["newname1", "newname2"])
        assert added == 2
        available = db.available_names()
        assert "newname1" in available

    def test_add_names_dedup(self, db):
        added = db.add_names(["alice"])  # already in seed
        assert added == 0


class TestEmail:
    def test_send_and_inbox(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        email = db.create_email("alice", ["bob"], [], "Hello", "Hi Bob")
        assert email["sender"] == "alice"
        assert email["thread_id"]

        inbox = db.inbox("bob")
        assert len(inbox) == 1
        assert inbox[0]["id"] == email["id"]
        assert "unread" in inbox[0]["tags"]

    def test_sender_not_in_own_inbox(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        db.create_email("alice", ["bob"], [], "Hello", "Hi Bob")
        inbox = db.inbox("alice")
        assert len(inbox) == 0

    def test_sent(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        db.create_email("alice", ["bob"], [], "Hello", "body")
        sent = db.sent("alice")
        assert len(sent) == 1

    def test_cc_receives(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        db.register("carol", "c")
        db.create_email("alice", ["bob"], ["carol"], "Hello", "body")
        inbox = db.inbox("carol")
        assert len(inbox) == 1
        assert "unread" in inbox[0]["tags"]

    def test_reply_inherits_thread(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        e1 = db.create_email("alice", ["bob"], [], "Question", "How?")
        e2 = db.create_email("bob", ["alice"], [], "", "Like this", in_reply_to=e1["id"])
        assert e2["thread_id"] == e1["thread_id"]
        assert e2["subject"] == "Re: Question"

    def test_reply_preserves_re_prefix(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        e1 = db.create_email("alice", ["bob"], [], "Re: Already", "body")
        e2 = db.create_email("bob", ["alice"], [], "", "reply", in_reply_to=e1["id"])
        assert e2["subject"] == "Re: Already"  # Not "Re: Re: Already"

    def test_get_email(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        e = db.create_email("alice", ["bob"], [], "Test", "body")
        fetched = db.get_email(e["id"], viewer="bob")
        assert fetched["subject"] == "Test"
        assert "unread" in fetched["tags"]

    def test_get_email_nonexistent(self, db):
        assert db.get_email("nonexistent") is None


class TestTags:
    def test_unread_auto_tag(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        e = db.create_email("alice", ["bob"], [], "Hi", "body")
        fetched = db.get_email(e["id"], viewer="bob")
        assert "unread" in fetched["tags"]

    def test_sender_no_unread_tag(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        e = db.create_email("alice", ["bob"], [], "Hi", "body")
        fetched = db.get_email(e["id"], viewer="alice")
        assert "unread" not in fetched["tags"]

    def test_mark_read(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        e = db.create_email("alice", ["bob"], [], "Hi", "body")
        db.mark_read(e["id"], "bob")
        fetched = db.get_email(e["id"], viewer="bob")
        assert "unread" not in fetched["tags"]

    def test_add_remove_custom_tags(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        e = db.create_email("alice", ["bob"], [], "Hi", "body")
        db.add_tags(e["id"], "bob", ["important", "working"])
        fetched = db.get_email(e["id"], viewer="bob")
        assert "important" in fetched["tags"]
        assert "working" in fetched["tags"]

        db.remove_tag(e["id"], "bob", "working")
        fetched = db.get_email(e["id"], viewer="bob")
        assert "working" not in fetched["tags"]
        assert "important" in fetched["tags"]

    def test_emails_by_tag(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        e1 = db.create_email("alice", ["bob"], [], "First", "body1")
        e2 = db.create_email("alice", ["bob"], [], "Second", "body2")
        db.add_tags(e1["id"], "bob", ["important"])
        result = db.emails_by_tag("bob", "important")
        assert len(result) == 1
        assert result[0]["id"] == e1["id"]


class TestThreads:
    def test_list_threads(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        e1 = db.create_email("alice", ["bob"], [], "Topic", "start")
        db.create_email("bob", ["alice"], [], "", "reply", in_reply_to=e1["id"])
        threads = db.list_threads("alice")
        assert len(threads) == 1
        assert threads[0]["email_count"] == 2
        assert "alice" in threads[0]["participants"]
        assert "bob" in threads[0]["participants"]

    def test_get_thread(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        e1 = db.create_email("alice", ["bob"], [], "Topic", "start")
        e2 = db.create_email("bob", ["alice"], [], "", "reply", in_reply_to=e1["id"])
        emails = db.get_thread(e1["thread_id"])
        assert len(emails) == 2
        assert emails[0]["id"] == e1["id"]
        assert emails[1]["id"] == e2["id"]


class TestPurge:
    def test_purge_clears_everything(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        db.create_email("alice", ["bob"], [], "Hi", "body")
        counts = db.purge()
        assert counts["emails"] == 1
        assert counts["identities"] == 2
        assert db.inbox("bob") == []
        assert db.list_identities() == []

    def test_purge_empty_db(self, db):
        counts = db.purge()
        assert counts["emails"] == 0
        assert counts["identities"] == 0
        assert counts["tags"] == 0


class TestAllMail:
    def test_all_mail_includes_sent_and_received(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        db.create_email("alice", ["bob"], [], "From alice", "body1")
        db.create_email("bob", ["alice"], [], "From bob", "body2")
        result = db.all_mail("alice")
        assert len(result) == 2
        subjects = {e["subject"] for e in result}
        assert "From alice" in subjects
        assert "From bob" in subjects

    def test_all_mail_excludes_unrelated(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        db.register("carol", "c")
        db.create_email("alice", ["bob"], [], "AB only", "body")
        db.create_email("bob", ["carol"], [], "BC only", "body")
        result = db.all_mail("alice")
        assert len(result) == 1
        assert result[0]["subject"] == "AB only"

    def test_all_mail_sorted_newest_first(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        e1 = db.create_email("alice", ["bob"], [], "First", "body")
        e2 = db.create_email("bob", ["alice"], [], "Second", "body")
        result = db.all_mail("alice")
        assert result[0]["id"] == e2["id"]
        assert result[1]["id"] == e1["id"]


class TestSearch:
    def test_search_by_sender(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        db.create_email("alice", ["bob"], [], "Hello", "body")
        db.create_email("bob", ["alice"], [], "Reply", "body")
        results = db.search(from_="alice")
        assert len(results) == 1
        assert results[0]["sender"] == "alice"

    def test_search_by_subject(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        db.create_email("alice", ["bob"], [], "Important thing", "body")
        db.create_email("alice", ["bob"], [], "Other", "body")
        results = db.search(subject="Important")
        assert len(results) == 1

    def test_search_by_body(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        db.create_email("alice", ["bob"], [], "Test", "secret keyword here")
        db.create_email("alice", ["bob"], [], "Test2", "nothing special")
        results = db.search(body="secret keyword")
        assert len(results) == 1

    def test_search_by_tag(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        e1 = db.create_email("alice", ["bob"], [], "First", "body")
        db.create_email("alice", ["bob"], [], "Second", "body")
        db.add_tags(e1["id"], "bob", ["flagged"])
        results = db.search(tag="flagged", viewer="bob")
        assert len(results) == 1

    def test_search_combined(self, db):
        db.register("alice", "a")
        db.register("bob", "b")
        db.create_email("alice", ["bob"], [], "Hello", "world")
        db.create_email("alice", ["bob"], [], "Goodbye", "world")
        results = db.search(from_="alice", subject="Hello")
        assert len(results) == 1
