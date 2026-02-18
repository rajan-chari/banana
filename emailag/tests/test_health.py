"""Tests for the health endpoint."""

import pytest
from fastapi.testclient import TestClient

from agcom_api.main import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Create a test client."""
    monkeypatch.setenv("AGCOM_DB_PATH", str(tmp_path / "agcom.db"))
    monkeypatch.setenv("AGCOM_SESSION_DB", str(tmp_path / "sessions.db"))
    app = create_app()
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


class TestHealth:
    def test_health_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "agcom-api"
        assert data["version"] == "0.1.0"
