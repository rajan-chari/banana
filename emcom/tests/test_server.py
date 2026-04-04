"""Tests for emcom-server API endpoints using FastAPI TestClient."""

import os
import tempfile
import pytest
from fastapi.testclient import TestClient

# Set data dir before import to avoid touching user's ~/.emcom/
_tmpdir = tempfile.mkdtemp()
os.environ["EMCOM_DATA_DIR"] = _tmpdir

from emcom_server.main import create_app


@pytest.fixture
def client():
    """Fresh app + client per test."""
    # Use a unique db per test
    import uuid
    test_dir = os.path.join(_tmpdir, str(uuid.uuid4()))
    os.makedirs(test_dir, exist_ok=True)
    os.environ["EMCOM_DATA_DIR"] = test_dir
    app = create_app()
    with TestClient(app) as c:
        yield c


def _headers(name: str) -> dict:
    return {"X-Emcom-Name": name}


class TestHealth:
    def test_health(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


class TestAuth:
    def test_missing_header_401(self, client):
        r = client.get("/email/inbox")
        assert r.status_code == 401

    def test_unregistered_name_401(self, client):
        r = client.get("/email/inbox", headers=_headers("nobody"))
        assert r.status_code == 401

    def test_registered_name_passes(self, client):
        client.post("/register", json={"name": "alice", "description": "test"})
        r = client.get("/email/inbox", headers=_headers("alice"))
        assert r.status_code == 200


class TestIdentity:
    def test_register_with_name(self, client):
        r = client.post("/register", json={"name": "alice", "description": "test agent", "location": "x/y/z"})
        assert r.status_code == 200
        assert r.json()["name"] == "alice"
        assert r.json()["location"] == "x/y/z"

    def test_register_without_name(self, client):
        r = client.post("/register", json={"description": "auto-named"})
        assert r.status_code == 200
        name = r.json()["name"]
        assert name  # Got a name from pool

    def test_register_duplicate_409(self, client):
        client.post("/register", json={"name": "alice", "description": "first"})
        r = client.post("/register", json={"name": "alice", "description": "second"})
        assert r.status_code == 409

    def test_register_force(self, client):
        client.post("/register", json={"name": "alice", "description": "first"})
        r = client.post("/register", json={"name": "alice", "description": "reclaimed", "force": True})
        assert r.status_code == 200
        assert r.json()["description"] == "reclaimed"

    def test_unregister(self, client):
        client.post("/register", json={"name": "alice", "description": "test"})
        r = client.delete("/register/alice")
        assert r.status_code == 200
        # Should no longer be able to auth
        r2 = client.get("/email/inbox", headers=_headers("alice"))
        assert r2.status_code == 401

    def test_unregister_nonexistent(self, client):
        r = client.delete("/register/nobody")
        assert r.status_code == 404

    def test_who(self, client):
        client.post("/register", json={"name": "alice", "description": "a", "location": "foo/bar/baz"})
        client.post("/register", json={"name": "bob", "description": "b"})
        r = client.get("/who")
        assert r.status_code == 200
        names = {i["name"]: i for i in r.json()}
        assert "alice" in names
        assert "bob" in names
        assert names["alice"]["location"] == "foo/bar/baz"
        assert names["bob"]["location"] == ""

    def test_update_description(self, client):
        client.post("/register", json={"name": "alice", "description": "old"})
        r = client.patch("/who/alice", json={"description": "new"}, headers=_headers("alice"))
        assert r.status_code == 200
        assert r.json()["description"] == "new"

    def test_update_other_forbidden(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        r = client.patch("/who/alice", json={"description": "hacked"}, headers=_headers("bob"))
        assert r.status_code == 403


class TestNamePool:
    def test_list_names(self, client):
        r = client.get("/names")
        assert r.status_code == 200
        assert len(r.json()) == 50

    def test_add_names(self, client):
        client.post("/register", json={"name": "admin", "description": "admin"})
        r = client.post("/names", json={"names": ["newname1", "newname2"]}, headers=_headers("admin"))
        assert r.status_code == 200
        assert r.json()["added"] == 2

    def test_add_names_dedup(self, client):
        client.post("/register", json={"name": "admin", "description": "admin"})
        r = client.post("/names", json={"names": ["alice"]}, headers=_headers("admin"))
        assert r.json()["added"] == 0

    def test_registered_name_not_available(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        r = client.get("/names")
        assert "alice" not in r.json()


class TestEmail:
    def test_send_and_inbox(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})

        r = client.post("/email", json={"to": ["bob"], "subject": "Hello", "body": "Hi Bob"},
                        headers=_headers("alice"))
        assert r.status_code == 200
        email_id = r.json()["id"]

        r2 = client.get("/email/inbox", headers=_headers("bob"))
        assert r2.status_code == 200
        assert len(r2.json()) == 1
        assert r2.json()[0]["id"] == email_id
        assert "unread" in r2.json()[0]["tags"]

    def test_send_to_nonexistent_404(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        r = client.post("/email", json={"to": ["nobody"], "subject": "Hi", "body": "x"},
                        headers=_headers("alice"))
        assert r.status_code == 404

    def test_read_marks_read(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})

        r = client.post("/email", json={"to": ["bob"], "subject": "Hello", "body": "Hi"},
                        headers=_headers("alice"))
        email_id = r.json()["id"]

        # Read the email
        r2 = client.get(f"/email/{email_id}", headers=_headers("bob"))
        assert r2.status_code == 200
        assert "unread" not in r2.json()["tags"]

    def test_sent(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        client.post("/email", json={"to": ["bob"], "subject": "Hello", "body": "Hi"},
                    headers=_headers("alice"))
        r = client.get("/email/sent", headers=_headers("alice"))
        assert r.status_code == 200
        assert len(r.json()) == 1


class TestFullLifecycle:
    def test_register_send_inbox_read_reply_thread(self, client):
        # Register alice and bob
        client.post("/register", json={"name": "alice", "description": "Agent A"})
        client.post("/register", json={"name": "bob", "description": "Agent B"})

        # Bob sends to alice
        r = client.post("/email", json={"to": ["alice"], "subject": "Question", "body": "How are you?"},
                        headers=_headers("bob"))
        assert r.status_code == 200
        email1_id = r.json()["id"]
        thread_id = r.json()["thread_id"]

        # Alice checks inbox
        r = client.get("/email/inbox", headers=_headers("alice"))
        assert len(r.json()) == 1
        assert "unread" in r.json()[0]["tags"]

        # Alice reads the email
        r = client.get(f"/email/{email1_id}", headers=_headers("alice"))
        assert r.status_code == 200
        assert "unread" not in r.json()["tags"]

        # Alice replies
        r = client.post("/email", json={
            "to": ["bob"], "body": "I'm great!", "in_reply_to": email1_id
        }, headers=_headers("alice"))
        assert r.status_code == 200
        assert r.json()["thread_id"] == thread_id
        assert r.json()["subject"] == "Re: Question"

        # Check thread
        r = client.get(f"/threads/{thread_id}", headers=_headers("alice"))
        assert r.status_code == 200
        assert len(r.json()) == 2

        # Alice's inbox is now empty of unread
        r = client.get("/email/inbox", headers=_headers("alice"))
        unread = [e for e in r.json() if "unread" in e["tags"]]
        assert len(unread) == 0


class TestThreads:
    def test_list_threads(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        r = client.post("/email", json={"to": ["bob"], "subject": "Topic", "body": "start"},
                        headers=_headers("alice"))
        email1_id = r.json()["id"]
        client.post("/email", json={"to": ["alice"], "body": "reply", "in_reply_to": email1_id},
                    headers=_headers("bob"))

        r = client.get("/threads", headers=_headers("alice"))
        assert r.status_code == 200
        assert len(r.json()) == 1
        assert r.json()[0]["email_count"] == 2


class TestTags:
    def test_add_and_remove_tags(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        r = client.post("/email", json={"to": ["bob"], "subject": "Hi", "body": "body"},
                        headers=_headers("alice"))
        eid = r.json()["id"]

        # Add tags
        r = client.post(f"/email/{eid}/tags", json={"tags": ["important", "working"]},
                        headers=_headers("bob"))
        assert r.status_code == 200

        # Check via get email
        r = client.get(f"/email/{eid}", headers=_headers("bob"))
        assert "important" in r.json()["tags"]

        # Remove tag
        r = client.delete(f"/email/{eid}/tags/working", headers=_headers("bob"))
        assert r.status_code == 200

        # List by tag
        r = client.get("/email/tags/important", headers=_headers("bob"))
        assert r.status_code == 200
        assert len(r.json()) == 1


class TestPurge:
    def test_purge_endpoint(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        client.post("/email", json={"to": ["bob"], "subject": "Hi", "body": "x"},
                    headers=_headers("alice"))

        r = client.post("/admin/purge")
        assert r.status_code == 200
        counts = r.json()["purged"]
        assert counts["emails"] == 1
        assert counts["identities"] == 2

        # Verify empty
        r = client.get("/who")
        assert r.json() == []


class TestAllMail:
    def test_all_mail_endpoint(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        client.post("/email", json={"to": ["bob"], "subject": "From alice", "body": "x"},
                    headers=_headers("alice"))
        client.post("/email", json={"to": ["alice"], "subject": "From bob", "body": "y"},
                    headers=_headers("bob"))

        r = client.get("/email/all", headers=_headers("alice"))
        assert r.status_code == 200
        assert len(r.json()) == 2
        subjects = {e["subject"] for e in r.json()}
        assert "From alice" in subjects
        assert "From bob" in subjects


class TestSearch:
    def test_search_by_subject(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        client.post("/email", json={"to": ["bob"], "subject": "Important thing", "body": "x"},
                    headers=_headers("alice"))
        client.post("/email", json={"to": ["bob"], "subject": "Other", "body": "y"},
                    headers=_headers("alice"))

        r = client.get("/search?subject=Important", headers=_headers("bob"))
        assert r.status_code == 200
        assert len(r.json()) == 1
        assert r.json()[0]["subject"] == "Important thing"


# ============ Edge Case Tests ============

class TestAuthCaseInsensitive:
    """Auth middleware should accept names case-insensitively."""

    def test_auth_different_case(self, client):
        client.post("/register", json={"name": "frost", "description": "emcom dev"})
        r = client.get("/email/inbox", headers=_headers("Frost"))
        assert r.status_code == 200

    def test_send_to_different_case(self, client):
        """Sending to 'Frost' should resolve to registered 'frost'."""
        client.post("/register", json={"name": "frost", "description": "a"})
        client.post("/register", json={"name": "milo", "description": "b"})
        r = client.post("/email", json={"to": ["Frost"], "subject": "Hi", "body": "test"},
                        headers=_headers("milo"))
        assert r.status_code == 200
        # Should appear in frost's inbox
        r2 = client.get("/email/inbox", headers=_headers("frost"))
        assert len(r2.json()) == 1

    def test_cc_case_insensitive(self, client):
        client.post("/register", json={"name": "frost", "description": "a"})
        client.post("/register", json={"name": "milo", "description": "b"})
        client.post("/register", json={"name": "bolt", "description": "c"})
        r = client.post("/email", json={"to": ["milo"], "cc": ["FROST"], "subject": "Hi", "body": "test"},
                        headers=_headers("bolt"))
        assert r.status_code == 200


class TestSpecialCharacters:
    """Test that special characters in subjects and bodies don't break queries."""

    def test_subject_with_quotes(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        r = client.post("/email", json={"to": ["bob"], "subject": 'He said "hello"', "body": "x"},
                        headers=_headers("alice"))
        assert r.status_code == 200
        r2 = client.get("/email/inbox", headers=_headers("bob"))
        assert r2.json()[0]["subject"] == 'He said "hello"'

    def test_body_with_json_special_chars(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        body = '{"key": "value", "list": [1, 2, 3]}'
        r = client.post("/email", json={"to": ["bob"], "subject": "JSON body", "body": body},
                        headers=_headers("alice"))
        assert r.status_code == 200
        r2 = client.get(f"/email/{r.json()['id']}", headers=_headers("bob"))
        assert r2.json()["body"] == body

    def test_subject_with_sql_injection_attempt(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        r = client.post("/email", json={
            "to": ["bob"], "subject": "'; DROP TABLE emails; --", "body": "x"
        }, headers=_headers("alice"))
        assert r.status_code == 200
        # Verify emails table still works
        r2 = client.get("/email/inbox", headers=_headers("bob"))
        assert len(r2.json()) == 1

    def test_search_with_special_chars(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        client.post("/email", json={"to": ["bob"], "subject": "100% complete!", "body": "done"},
                    headers=_headers("alice"))
        r = client.get("/search?subject=100%25", headers=_headers("bob"))
        assert r.status_code == 200
        assert len(r.json()) == 1

    def test_large_body(self, client):
        """Test sending a large message body."""
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        body = "x" * 50000
        r = client.post("/email", json={"to": ["bob"], "subject": "Large", "body": body},
                        headers=_headers("alice"))
        assert r.status_code == 200
        r2 = client.get(f"/email/{r.json()['id']}", headers=_headers("bob"))
        assert len(r2.json()["body"]) == 50000


class TestTagSemantics:
    """Test tag lifecycle semantics that agents rely on."""

    def test_handled_supersedes_pending_and_unread(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        r = client.post("/email", json={"to": ["bob"], "subject": "Hi", "body": "x"},
                        headers=_headers("alice"))
        eid = r.json()["id"]
        # Read (removes unread, adds pending)
        client.get(f"/email/{eid}?add_tags=pending", headers=_headers("bob"))
        # Tag handled
        client.post(f"/email/{eid}/tags", json={"tags": ["handled"]}, headers=_headers("bob"))
        # Check: handled present, pending and unread gone
        r2 = client.get(f"/email/{eid}", headers=_headers("bob"))
        tags = r2.json()["tags"]
        assert "handled" in tags
        assert "unread" not in tags
        assert "pending" not in tags

    def test_handled_hides_from_inbox(self, client):
        """Default inbox excludes handled messages."""
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        r = client.post("/email", json={"to": ["bob"], "subject": "Hi", "body": "x"},
                        headers=_headers("alice"))
        eid = r.json()["id"]
        client.post(f"/email/{eid}/tags", json={"tags": ["handled"]}, headers=_headers("bob"))
        # Default inbox should be empty
        r2 = client.get("/email/inbox", headers=_headers("bob"))
        assert len(r2.json()) == 0
        # --all should show it
        r3 = client.get("/email/inbox?all=true", headers=_headers("bob"))
        assert len(r3.json()) == 1

    def test_tags_are_per_owner(self, client):
        """Alice and Bob have independent tags on the same email."""
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        r = client.post("/email", json={"to": ["bob"], "cc": ["alice"], "subject": "Hi", "body": "x"},
                        headers=_headers("alice"))
        eid = r.json()["id"]
        # Bob tags as important
        client.post(f"/email/{eid}/tags", json={"tags": ["important"]}, headers=_headers("bob"))
        # Alice should not see Bob's tag
        r2 = client.get(f"/email/{eid}", headers=_headers("alice"))
        assert "important" not in r2.json()["tags"]


class TestDBIntegrity:
    """End-to-end integrity test: register → send → read → tag → search → thread."""

    def test_full_e2e_integrity(self, client):
        # Register 3 agents
        for name in ["scout", "spark-py", "rajan"]:
            client.post("/register", json={"name": name, "description": f"{name} agent"})

        # Scout sends to spark-py, CC rajan
        r = client.post("/email", json={
            "to": ["spark-py"], "cc": ["rajan"],
            "subject": "Issue #344 found", "body": "JWKS caching bug"
        }, headers=_headers("scout"))
        assert r.status_code == 200
        email1_id = r.json()["id"]
        thread_id = r.json()["thread_id"]

        # spark-py reads
        r = client.get(f"/email/{email1_id}?add_tags=pending", headers=_headers("spark-py"))
        assert r.status_code == 200
        assert "pending" in r.json()["tags"]
        assert "unread" not in r.json()["tags"]

        # spark-py replies
        r = client.post("/email", json={
            "to": ["scout"], "body": "PR submitted", "in_reply_to": email1_id
        }, headers=_headers("spark-py"))
        assert r.status_code == 200
        assert r.json()["thread_id"] == thread_id

        # spark-py tags original as handled
        client.post(f"/email/{email1_id}/tags", json={"tags": ["handled"]},
                    headers=_headers("spark-py"))

        # Search finds it
        r = client.get("/search?body=JWKS", headers=_headers("scout"))
        assert len(r.json()) >= 1

        # Thread has 2 messages
        r = client.get(f"/threads/{thread_id}", headers=_headers("scout"))
        assert len(r.json()) == 2

        # rajan can see the CC'd email
        r = client.get("/email/inbox", headers=_headers("rajan"))
        assert len(r.json()) >= 1

        # Who shows all 3 active
        r = client.get("/who")
        names = {i["name"] for i in r.json()}
        assert {"scout", "spark-py", "rajan"}.issubset(names)

    def test_short_id_resolution(self, client):
        """Short ID prefixes resolve correctly."""
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        r = client.post("/email", json={"to": ["bob"], "subject": "Hi", "body": "x"},
                        headers=_headers("alice"))
        full_id = r.json()["id"]
        short_id = full_id[:8]
        # Read by short ID
        r2 = client.get(f"/email/{short_id}", headers=_headers("bob"))
        assert r2.status_code == 200
        assert r2.json()["id"] == full_id


class TestMultiRecipient:
    """Test multi-recipient and CC scenarios."""

    def test_send_to_multiple(self, client):
        for name in ["alice", "bob", "carol"]:
            client.post("/register", json={"name": name, "description": name})
        r = client.post("/email", json={
            "to": ["bob", "carol"], "subject": "Team update", "body": "FYI"
        }, headers=_headers("alice"))
        assert r.status_code == 200
        # Both should see it
        for name in ["bob", "carol"]:
            r2 = client.get("/email/inbox", headers=_headers(name))
            assert len(r2.json()) == 1

    def test_sender_not_in_own_inbox(self, client):
        client.post("/register", json={"name": "alice", "description": "a"})
        client.post("/register", json={"name": "bob", "description": "b"})
        client.post("/email", json={"to": ["bob"], "subject": "Hi", "body": "x"},
                    headers=_headers("alice"))
        # Alice should not see her own sent email in inbox
        r = client.get("/email/inbox", headers=_headers("alice"))
        assert len(r.json()) == 0
