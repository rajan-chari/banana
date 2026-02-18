"""Tests for the auth router endpoints."""

import pytest
from fastapi.testclient import TestClient

from agcom_api.main import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Create a test client with session manager and agcom storage."""
    monkeypatch.setenv("AGCOM_DB_PATH", str(tmp_path / "agcom.db"))
    monkeypatch.setenv("AGCOM_SESSION_DB", str(tmp_path / "sessions.db"))
    app = create_app()
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


class TestAuthRouter:
    def test_login(self, client):
        resp = client.post("/auth/login", json={"handle": "alice"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["handle"] == "alice"
        assert "token" in data
        assert "expires_at" in data

    def test_login_with_display_name(self, client):
        resp = client.post(
            "/auth/login", json={"handle": "alice", "display_name": "Alice Smith"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["display_name"] == "Alice Smith"

    def test_login_empty_handle_rejected(self, client):
        resp = client.post("/auth/login", json={"handle": ""})
        assert resp.status_code == 422  # validation error

    def test_me_requires_auth(self, client):
        resp = client.get("/auth/me")
        assert resp.status_code == 401

    def test_me_with_valid_token(self, client):
        login_resp = client.post("/auth/login", json={"handle": "alice"})
        token = login_resp.json()["token"]
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["handle"] == "alice"
        assert data["is_admin"] is False

    def test_me_with_invalid_token(self, client):
        resp = client.get("/auth/me", headers={"Authorization": "Bearer invalid"})
        assert resp.status_code == 401

    def test_logout(self, client):
        login_resp = client.post("/auth/login", json={"handle": "alice"})
        token = login_resp.json()["token"]
        resp = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

        # Token should now be invalid
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401

    def test_logout_without_auth(self, client):
        resp = client.post("/auth/logout")
        assert resp.status_code == 401
