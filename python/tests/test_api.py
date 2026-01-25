"""Tests for the agcom REST API."""

import os
import tempfile
import pytest
from fastapi.testclient import TestClient

from agcom_api.main import app
from agcom_api import dependencies
from agcom_api.auth import SessionManager
from agcom.storage import init_database


@pytest.fixture(scope="module")
def test_db_path():
    """Create a temporary database for tests."""
    temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
    temp_db.close()
    init_database(temp_db.name)
    yield temp_db.name
    # Cleanup
    if os.path.exists(temp_db.name):
        os.unlink(temp_db.name)


@pytest.fixture(scope="module")
def client(test_db_path):
    """Create a test client with configured dependencies."""
    dependencies.db_path = test_db_path
    dependencies.session_manager = SessionManager(session_expiry_hours=24)
    return TestClient(app)


@pytest.fixture
def auth_token(client):
    """Get an authentication token for tests."""
    response = client.post(
        "/api/auth/login",
        json={"handle": "testuser", "display_name": "Test User"}
    )
    return response.json()["token"]


@pytest.fixture
def message(client, auth_token):
    """Create a test message."""
    response = client.post(
        "/api/messages/send",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "to_handles": ["recipient"],
            "subject": "Test Subject",
            "body": "Test Body",
            "tags": ["test"]
        }
    )
    return response.json()


def test_health_check(client):
    """Test the health check endpoint."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


def test_root_endpoint(client):
    """Test the root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "agcom REST API"
    assert "version" in data


def test_login(client):
    """Test login endpoint."""
    response = client.post(
        "/api/auth/login",
        json={"handle": "alice", "display_name": "Alice Smith"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert "expires_at" in data
    assert data["identity"]["handle"] == "alice"
    assert data["identity"]["display_name"] == "Alice Smith"


def test_login_invalid_handle(client):
    """Test login with invalid handle."""
    response = client.post(
        "/api/auth/login",
        json={"handle": "Alice!", "display_name": "Alice"}
    )
    assert response.status_code == 400


def test_whoami(client, auth_token):
    """Test whoami endpoint."""
    response = client.get(
        "/api/auth/whoami",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["identity"]["handle"] == "testuser"
    assert "session_expires_at" in data


def test_whoami_without_auth(client):
    """Test whoami without authentication."""
    response = client.get("/api/auth/whoami")
    assert response.status_code == 401


def test_whoami_invalid_token(client):
    """Test whoami with invalid token."""
    response = client.get(
        "/api/auth/whoami",
        headers={"Authorization": "Bearer invalid-token"}
    )
    assert response.status_code == 401


def test_send_message(client, auth_token):
    """Test sending a message."""
    response = client.post(
        "/api/messages/send",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "to_handles": ["bob"],
            "subject": "Test message",
            "body": "Hello Bob!",
            "tags": ["test"]
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["from_handle"] == "testuser"
    assert data["to_handles"] == ["bob"]
    assert data["subject"] == "Test message"
    assert data["body"] == "Hello Bob!"
    assert data["tags"] == ["test"]
    assert "message_id" in data
    assert "thread_id" in data


def test_send_message_without_auth(client):
    """Test sending a message without authentication."""
    response = client.post(
        "/api/messages/send",
        json={
            "to_handles": ["bob"],
            "subject": "Test",
            "body": "Hello"
        }
    )
    assert response.status_code == 401


def test_send_message_invalid_subject(client, auth_token):
    """Test sending a message with invalid subject."""
    response = client.post(
        "/api/messages/send",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "to_handles": ["bob"],
            "subject": "",  # Empty subject
            "body": "Hello"
        }
    )
    assert response.status_code == 422  # Validation error


def test_list_messages(client, auth_token, message):
    """Test listing messages."""
    response = client.get(
        "/api/messages",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "messages" in data
    assert len(data["messages"]) > 0


def test_get_message(client, auth_token, message):
    """Test getting a specific message."""
    response = client.get(
        f"/api/messages/{message['message_id']}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["message_id"] == message["message_id"]


def test_get_message_not_found(client, auth_token):
    """Test getting a non-existent message."""
    response = client.get(
        "/api/messages/nonexistent",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 404


def test_reply_to_message(client, auth_token, message):
    """Test replying to a message."""
    response = client.post(
        f"/api/messages/{message['message_id']}/reply",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"body": "Reply to your message", "tags": ["reply"]}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["in_reply_to"] == message["message_id"]
    assert data["thread_id"] == message["thread_id"]
    assert data["body"] == "Reply to your message"


def test_list_threads(client, auth_token, message):
    """Test listing threads."""
    response = client.get(
        "/api/threads",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "threads" in data
    assert len(data["threads"]) > 0


def test_get_thread(client, auth_token, message):
    """Test getting a specific thread."""
    response = client.get(
        f"/api/threads/{message['thread_id']}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["thread_id"] == message["thread_id"]


def test_get_thread_messages(client, auth_token, message):
    """Test getting all messages in a thread."""
    response = client.get(
        f"/api/threads/{message['thread_id']}/messages",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "thread" in data
    assert "messages" in data
    assert data["thread"]["thread_id"] == message["thread_id"]
    assert len(data["messages"]) > 0


def test_reply_to_thread(client, auth_token, message):
    """Test replying to the latest message in a thread."""
    response = client.post(
        f"/api/threads/{message['thread_id']}/reply",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"body": "Thread reply"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["thread_id"] == message["thread_id"]


def test_thread_metadata(client, auth_token, message):
    """Test setting and getting thread metadata."""
    # Set metadata
    response = client.put(
        f"/api/threads/{message['thread_id']}/metadata",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"key": "priority", "value": "high"}
    )
    assert response.status_code == 200

    # Get metadata
    response = client.get(
        f"/api/threads/{message['thread_id']}/metadata/priority",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["key"] == "priority"
    assert data["value"] == "high"


def test_archive_thread(client, auth_token, message):
    """Test archiving a thread."""
    response = client.post(
        f"/api/threads/{message['thread_id']}/archive",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


def test_add_contact(client, auth_token):
    """Test adding a contact."""
    response = client.post(
        "/api/contacts",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "handle": "contact1",
            "display_name": "Contact One",
            "description": "Test contact",
            "tags": ["test"]
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["handle"] == "contact1"
    assert data["display_name"] == "Contact One"


def test_add_contact_duplicate(client, auth_token):
    """Test adding a duplicate contact."""
    # Add first time
    client.post(
        "/api/contacts",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"handle": "contact2", "display_name": "Contact Two"}
    )

    # Try to add again
    response = client.post(
        "/api/contacts",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"handle": "contact2", "display_name": "Contact Two Again"}
    )
    assert response.status_code == 409  # Conflict


def test_list_contacts(client, auth_token):
    """Test listing contacts."""
    # Add a contact first
    client.post(
        "/api/contacts",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"handle": "contact3", "display_name": "Contact Three"}
    )

    response = client.get(
        "/api/contacts",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "contacts" in data
    assert len(data["contacts"]) > 0


def test_get_contact(client, auth_token):
    """Test getting a specific contact."""
    # Add a contact first
    client.post(
        "/api/contacts",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"handle": "contact4", "display_name": "Contact Four"}
    )

    response = client.get(
        "/api/contacts/contact4",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["handle"] == "contact4"


def test_update_contact(client, auth_token):
    """Test updating a contact."""
    # Add a contact first
    client.post(
        "/api/contacts",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"handle": "contact5", "display_name": "Contact Five"}
    )

    response = client.put(
        "/api/contacts/contact5",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "display_name": "Updated Contact Five",
            "description": "Updated description"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["display_name"] == "Updated Contact Five"
    assert data["description"] == "Updated description"


def test_search_contacts(client, auth_token):
    """Test searching contacts."""
    # Add a contact first
    client.post(
        "/api/contacts",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"handle": "searchable", "display_name": "Searchable Contact"}
    )

    response = client.get(
        "/api/contacts/search?q=Searchable",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "contacts" in data


def test_deactivate_contact(client, auth_token):
    """Test deactivating a contact."""
    # Add a contact first
    client.post(
        "/api/contacts",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"handle": "contact6", "display_name": "Contact Six"}
    )

    response = client.delete(
        "/api/contacts/contact6",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


def test_list_audit_events(client, auth_token, message):
    """Test listing audit events."""
    response = client.get(
        "/api/audit/events",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "events" in data
    assert len(data["events"]) > 0


def test_search_messages(client, auth_token, message):
    """Test searching messages."""
    response = client.get(
        "/api/messages/search?q=Test",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "messages" in data
