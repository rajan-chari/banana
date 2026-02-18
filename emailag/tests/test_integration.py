"""Integration tests: full API stack with agcom core library."""

import os

import pytest
from fastapi.testclient import TestClient

from agcom.storage import Storage
from agcom_api.auth import SessionManager
from agcom_api.main import create_app


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    """Create a test client with real agcom storage and session manager."""
    db_path = str(tmp_path / "agcom.db")
    session_db = str(tmp_path / "sessions.db")
    monkeypatch.setenv("AGCOM_DB_PATH", db_path)
    monkeypatch.setenv("AGCOM_SESSION_DB", session_db)
    monkeypatch.setenv("AGCOM_SESSION_EXPIRY", "3600")

    app = create_app()
    with TestClient(app, raise_server_exceptions=False) as c:
        storage = c.app.state.storage
        session_manager = c.app.state.session_manager
        yield c, storage, session_manager


def _login(client, handle="alice", display_name=None):
    """Helper: login and return token."""
    payload = {"handle": handle}
    if display_name:
        payload["display_name"] = display_name
    resp = client.post("/auth/login", json=payload)
    assert resp.status_code == 200
    return resp.json()["token"]


def _auth(token):
    """Helper: return auth headers."""
    return {"Authorization": f"Bearer {token}"}


class TestMessaging:
    def test_send_message(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")
        _login(client, "bob")

        resp = client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Hello", "body": "Hi Bob!"},
            headers=_auth(token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["sender"] == "alice"
        assert data["recipients"] == ["bob"]
        assert data["subject"] == "Hello"
        assert data["body"] == "Hi Bob!"
        assert data["thread_id"]
        assert data["id"]

    def test_reply_to_message(self, app_client):
        client, _, _ = app_client
        alice_token = _login(client, "alice")
        bob_token = _login(client, "bob")

        # Alice sends a message
        send_resp = client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Hello", "body": "Hi Bob!"},
            headers=_auth(alice_token),
        )
        msg_id = send_resp.json()["id"]

        # Bob replies
        resp = client.post(
            f"/messages/{msg_id}/reply",
            json={"body": "Hi Alice!"},
            headers=_auth(bob_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["sender"] == "bob"
        assert data["reply_to"] == msg_id

    def test_list_messages(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")
        _login(client, "bob")

        client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Msg1", "body": "First"},
            headers=_auth(token),
        )
        client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Msg2", "body": "Second"},
            headers=_auth(token),
        )

        resp = client.get("/messages", headers=_auth(token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2

    def test_search_messages(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")
        _login(client, "bob")

        client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Important", "body": "This is urgent"},
            headers=_auth(token),
        )
        client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Casual", "body": "Just checking in"},
            headers=_auth(token),
        )

        resp = client.get("/messages/search?query=urgent", headers=_auth(token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["subject"] == "Important"

    def test_get_message(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")
        _login(client, "bob")

        send_resp = client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Test", "body": "Body"},
            headers=_auth(token),
        )
        msg_id = send_resp.json()["id"]

        resp = client.get(f"/messages/{msg_id}", headers=_auth(token))
        assert resp.status_code == 200
        assert resp.json()["id"] == msg_id

    def test_get_message_not_found(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")
        resp = client.get("/messages/nonexistent", headers=_auth(token))
        assert resp.status_code == 404


class TestThreads:
    def test_list_threads(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")
        _login(client, "bob")

        client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Thread1", "body": "First"},
            headers=_auth(token),
        )

        resp = client.get("/threads", headers=_auth(token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["subject"] == "Thread1"

    def test_get_thread_with_messages(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")
        _login(client, "bob")

        send_resp = client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Thread", "body": "Hello"},
            headers=_auth(token),
        )
        thread_id = send_resp.json()["thread_id"]

        resp = client.get(f"/threads/{thread_id}/messages", headers=_auth(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == thread_id
        assert len(data["messages"]) == 1

    def test_reply_to_thread(self, app_client):
        client, _, _ = app_client
        alice_token = _login(client, "alice")
        bob_token = _login(client, "bob")

        send_resp = client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Thread", "body": "Hello"},
            headers=_auth(alice_token),
        )
        thread_id = send_resp.json()["thread_id"]

        resp = client.post(
            f"/threads/{thread_id}/reply",
            json={"body": "Reply from Bob"},
            headers=_auth(bob_token),
        )
        assert resp.status_code == 201
        assert resp.json()["sender"] == "bob"

    def test_thread_metadata(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")
        _login(client, "bob")

        send_resp = client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Thread", "body": "Hello"},
            headers=_auth(token),
        )
        thread_id = send_resp.json()["thread_id"]

        # Set metadata
        resp = client.put(
            f"/threads/{thread_id}/metadata/priority",
            json={"value": "high"},
            headers=_auth(token),
        )
        assert resp.status_code == 200

        # Get metadata
        resp = client.get(f"/threads/{thread_id}/metadata/priority", headers=_auth(token))
        assert resp.status_code == 200
        assert resp.json()["value"] == "high"

        # Delete metadata
        resp = client.delete(f"/threads/{thread_id}/metadata/priority", headers=_auth(token))
        assert resp.status_code == 200

        # Verify deleted
        resp = client.get(f"/threads/{thread_id}/metadata/priority", headers=_auth(token))
        assert resp.status_code == 404

    def test_archive_unarchive(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")
        _login(client, "bob")

        send_resp = client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Thread", "body": "Hello"},
            headers=_auth(token),
        )
        thread_id = send_resp.json()["thread_id"]

        # Archive
        resp = client.post(f"/threads/{thread_id}/archive", headers=_auth(token))
        assert resp.status_code == 200

        # Archived threads not in default list
        resp = client.get("/threads", headers=_auth(token))
        assert len(resp.json()) == 0

        # Unarchive
        resp = client.post(f"/threads/{thread_id}/unarchive", headers=_auth(token))
        assert resp.status_code == 200

        resp = client.get("/threads", headers=_auth(token))
        assert len(resp.json()) == 1


class TestContacts:
    def test_create_contact(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")

        resp = client.post(
            "/contacts",
            json={"handle": "charlie", "display_name": "Charlie", "tags": ["dev"]},
            headers=_auth(token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["handle"] == "charlie"
        assert data["display_name"] == "Charlie"
        assert data["tags"] == ["dev"]
        assert data["version"] == 1

    def test_list_contacts(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")

        # alice is auto-registered on login
        resp = client.get("/contacts", headers=_auth(token))
        assert resp.status_code == 200
        handles = [c["handle"] for c in resp.json()]
        assert "alice" in handles

    def test_get_contact(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")

        resp = client.get("/contacts/alice", headers=_auth(token))
        assert resp.status_code == 200
        assert resp.json()["handle"] == "alice"

    def test_update_contact(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")

        resp = client.put(
            "/contacts/alice",
            json={"display_name": "Alice Updated", "version": 1},
            headers=_auth(token),
        )
        assert resp.status_code == 200
        assert resp.json()["display_name"] == "Alice Updated"
        assert resp.json()["version"] == 2

    def test_update_contact_version_conflict(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")

        # Update once
        client.put(
            "/contacts/alice",
            json={"display_name": "Alice V2", "version": 1},
            headers=_auth(token),
        )

        # Try to update again with old version
        resp = client.put(
            "/contacts/alice",
            json={"display_name": "Alice V3", "version": 1},
            headers=_auth(token),
        )
        assert resp.status_code == 409

    def test_deactivate_contact(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")

        resp = client.delete("/contacts/alice?version=1", headers=_auth(token))
        assert resp.status_code == 200

        # Should not appear in active contacts
        resp = client.get("/contacts?active_only=true", headers=_auth(token))
        handles = [c["handle"] for c in resp.json()]
        assert "alice" not in handles


class TestAudit:
    def test_audit_events_after_messaging(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")
        _login(client, "bob")

        client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Test", "body": "Audit test"},
            headers=_auth(token),
        )

        resp = client.get("/audit?actor=alice", headers=_auth(token))
        assert resp.status_code == 200
        events = resp.json()
        assert len(events) > 0
        event_types = [e["event_type"] for e in events]
        assert "message_sent" in event_types


class TestAdmin:
    def test_admin_requires_admin_role(self, app_client):
        client, _, _ = app_client
        token = _login(client, "alice")

        resp = client.get("/admin/threads", headers=_auth(token))
        assert resp.status_code == 403

    def test_admin_endpoints(self, app_client):
        client, storage, session_manager = app_client

        # Create admin user
        from agcom.models import AddressBookEntry
        storage.save_contact(AddressBookEntry(handle="admin", tags=["admin"]))

        token = _login(client, "admin")
        # Now admin should have admin flag set from login

        # Create some data as another user
        alice_token = _login(client, "alice")
        _login(client, "bob")
        client.post(
            "/messages",
            json={"recipients": ["bob"], "subject": "Test", "body": "Admin test"},
            headers=_auth(alice_token),
        )

        # Admin can see all threads
        resp = client.get("/admin/threads", headers=_auth(token))
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

        # Admin can see all messages
        resp = client.get("/admin/messages", headers=_auth(token))
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

        # Admin can poll
        resp = client.get("/admin/messages/poll?since_id=", headers=_auth(token))
        assert resp.status_code == 200

        # Admin can list users
        resp = client.get("/admin/users", headers=_auth(token))
        assert resp.status_code == 200
        handles = [u["handle"] for u in resp.json()]
        assert "admin" in handles

        # Admin can get stats
        resp = client.get("/admin/stats", headers=_auth(token))
        assert resp.status_code == 200
        stats = resp.json()
        assert "thread_count" in stats
        assert "message_count" in stats
        assert "user_count" in stats


class TestVisibility:
    def test_user_cannot_see_others_threads(self, app_client):
        client, _, _ = app_client
        alice_token = _login(client, "alice")
        bob_token = _login(client, "bob")
        _login(client, "charlie")

        # Alice sends to Charlie (Bob not included)
        client.post(
            "/messages",
            json={"recipients": ["charlie"], "subject": "Private", "body": "Secret"},
            headers=_auth(alice_token),
        )

        # Bob should not see this thread
        resp = client.get("/threads", headers=_auth(bob_token))
        assert len(resp.json()) == 0

    def test_user_cannot_get_others_thread(self, app_client):
        client, _, _ = app_client
        alice_token = _login(client, "alice")
        bob_token = _login(client, "bob")
        _login(client, "charlie")

        send_resp = client.post(
            "/messages",
            json={"recipients": ["charlie"], "subject": "Private", "body": "Secret"},
            headers=_auth(alice_token),
        )
        thread_id = send_resp.json()["thread_id"]

        resp = client.get(f"/threads/{thread_id}", headers=_auth(bob_token))
        assert resp.status_code == 404
