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
