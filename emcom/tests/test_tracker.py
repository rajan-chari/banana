"""Tests for work tracker API endpoints."""

import os
import tempfile
import uuid
import pytest
from fastapi.testclient import TestClient

_tmpdir = tempfile.mkdtemp()
os.environ["EMCOM_DATA_DIR"] = _tmpdir

from emcom_server.main import create_app


@pytest.fixture
def client():
    test_dir = os.path.join(_tmpdir, str(uuid.uuid4()))
    os.makedirs(test_dir, exist_ok=True)
    os.environ["EMCOM_DATA_DIR"] = test_dir
    app = create_app()
    with TestClient(app) as c:
        # Register two agents
        c.post("/register", json={"name": "scout", "description": "triage agent"})
        c.post("/register", json={"name": "spark-py", "description": "python sdk"})
        c.post("/register", json={"name": "bolt", "description": "tester"})
        yield c


H_SCOUT = {"X-Emcom-Name": "scout"}
H_SPARK = {"X-Emcom-Name": "spark-py"}
H_BOLT = {"X-Emcom-Name": "bolt"}


class TestCreate:
    def test_create_basic(self, client):
        r = client.post("/tracker", json={
            "repo": "teams.py", "title": "JWKS caching", "number": 344,
        }, headers=H_SCOUT)
        assert r.status_code == 200
        data = r.json()
        assert data["repo"] == "teams.py"
        assert data["number"] == 344
        assert data["title"] == "JWKS caching"
        assert data["status"] == "new"
        assert data["created_by"] == "scout"

    def test_create_dedup_identical(self, client):
        """Creating the same item twice with no new fields should silently return existing."""
        r1 = client.post("/tracker", json={
            "repo": "teams.py", "title": "JWKS caching", "number": 344,
        }, headers=H_SCOUT)
        r2 = client.post("/tracker", json={
            "repo": "teams.py", "title": "JWKS caching", "number": 344,
        }, headers=H_SPARK)
        assert r2.status_code == 200
        assert r2.json()["id"] == r1.json()["id"]

    def test_create_dedup_conflict(self, client):
        """Creating with a different title on existing item should 409 so caller can retry via update."""
        client.post("/tracker", json={
            "repo": "teams.py", "title": "JWKS caching", "number": 344,
        }, headers=H_SCOUT)
        r2 = client.post("/tracker", json={
            "repo": "teams.py", "title": "Different title", "number": 344,
        }, headers=H_SPARK)
        assert r2.status_code == 409
        detail = r2.json()["detail"]
        assert "title" in detail
        assert "already exists" in detail

    def test_create_with_fields(self, client):
        r = client.post("/tracker", json={
            "repo": "teams.ts", "title": "Auth refactor", "type": "investigation",
            "severity": "high", "assigned_to": "spark-py", "labels": ["auth", "security"],
        }, headers=H_SCOUT)
        assert r.status_code == 200
        data = r.json()
        assert data["type"] == "investigation"
        assert data["severity"] == "high"
        assert data["assigned_to"] == "spark-py"
        assert data["labels"] == ["auth", "security"]

    def test_create_invalid_type(self, client):
        r = client.post("/tracker", json={
            "repo": "teams.py", "title": "Test", "type": "bogus",
        }, headers=H_SCOUT)
        assert r.status_code == 400


class TestUpdate:
    def test_update_status(self, client):
        r = client.post("/tracker", json={
            "repo": "teams.py", "title": "Test issue", "number": 100,
        }, headers=H_SCOUT)
        item_id = r.json()["id"][:8]
        r2 = client.patch(f"/tracker/{item_id}", json={
            "status": "investigating", "comment": "Starting work",
        }, headers=H_SPARK)
        assert r2.status_code == 200
        assert r2.json()["status"] == "investigating"

    def test_update_records_history(self, client):
        r = client.post("/tracker", json={
            "repo": "teams.py", "title": "History test", "number": 200,
        }, headers=H_SCOUT)
        item_id = r.json()["id"]
        client.patch(f"/tracker/{item_id[:8]}", json={
            "status": "investigating",
        }, headers=H_SPARK)
        r2 = client.get(f"/tracker/{item_id[:8]}/history", headers=H_SCOUT)
        assert r2.status_code == 200
        history = r2.json()
        # Should have: creation status + status update
        status_changes = [h for h in history if h["field"] == "status"]
        assert len(status_changes) >= 2

    def test_update_blocker_sets_blocked_since(self, client):
        r = client.post("/tracker", json={
            "repo": "teams.py", "title": "Blocked test",
        }, headers=H_SCOUT)
        item_id = r.json()["id"][:8]
        r2 = client.patch(f"/tracker/{item_id}", json={
            "blocker": "Waiting on Rajan",
        }, headers=H_SPARK)
        assert r2.status_code == 200
        assert r2.json()["blocked_since"] is not None

    def test_update_by_repo_number(self, client):
        client.post("/tracker", json={
            "repo": "teams.py", "title": "Lookup test", "number": 555,
        }, headers=H_SCOUT)
        r = client.patch("/tracker/teams.py%23555", json={
            "status": "triaged",
        }, headers=H_SCOUT)
        assert r.status_code == 200
        assert r.json()["status"] == "triaged"


class TestView:
    def test_view_with_history_and_links(self, client):
        r1 = client.post("/tracker", json={
            "repo": "teams.py", "title": "Item A", "number": 1,
        }, headers=H_SCOUT)
        r2 = client.post("/tracker", json={
            "repo": "teams.py", "title": "Item B", "number": 2,
        }, headers=H_SCOUT)
        id_a = r1.json()["id"]
        id_b = r2.json()["id"]
        client.post(f"/tracker/{id_a[:8]}/link", json={
            "to_id": id_b[:8], "link_type": "related",
        }, headers=H_SCOUT)
        r = client.get(f"/tracker/{id_a[:8]}", headers=H_SCOUT)
        assert r.status_code == 200
        data = r.json()
        assert "history" in data
        assert len(data["links"]) == 1


class TestList:
    def test_list_filters(self, client):
        client.post("/tracker", json={
            "repo": "teams.py", "title": "Py issue", "severity": "high",
        }, headers=H_SCOUT)
        client.post("/tracker", json={
            "repo": "teams.ts", "title": "TS issue",
        }, headers=H_SCOUT)
        r = client.get("/tracker?repo=teams.py", headers=H_SCOUT)
        assert r.status_code == 200
        assert len(r.json()) == 1
        assert r.json()[0]["repo"] == "teams.py"

    def test_list_open(self, client):
        client.post("/tracker", json={
            "repo": "teams.py", "title": "Open one",
        }, headers=H_SCOUT)
        r2 = client.post("/tracker", json={
            "repo": "teams.py", "title": "Merged one", "number": 999,
        }, headers=H_SCOUT)
        client.patch(f"/tracker/{r2.json()['id'][:8]}", json={
            "status": "merged",
        }, headers=H_SCOUT)
        r = client.get("/tracker?status=open", headers=H_SCOUT)
        assert r.status_code == 200
        assert all(item["status"] != "merged" for item in r.json())


class TestComment:
    def test_add_comment(self, client):
        r = client.post("/tracker", json={
            "repo": "teams.py", "title": "Comment test",
        }, headers=H_SCOUT)
        item_id = r.json()["id"][:8]
        r2 = client.post(f"/tracker/{item_id}/comment", json={
            "comment": "Looks good after review",
        }, headers=H_BOLT)
        assert r2.status_code == 200


class TestSpecialQueries:
    def test_stats(self, client):
        client.post("/tracker", json={"repo": "teams.py", "title": "A"}, headers=H_SCOUT)
        client.post("/tracker", json={"repo": "teams.ts", "title": "B"}, headers=H_SCOUT)
        r = client.get("/tracker/stats", headers=H_SCOUT)
        assert r.status_code == 200
        data = r.json()
        assert "by_status" in data
        assert "by_repo" in data

    def test_queue(self, client):
        client.post("/tracker", json={
            "repo": "teams.py", "title": "For bolt", "assigned_to": "bolt",
        }, headers=H_SCOUT)
        r = client.get("/tracker/queue/bolt", headers=H_BOLT)
        assert r.status_code == 200
        assert len(r.json()) == 1

    def test_blocked(self, client):
        r = client.post("/tracker", json={
            "repo": "teams.py", "title": "Blocked item",
        }, headers=H_SCOUT)
        client.patch(f"/tracker/{r.json()['id'][:8]}", json={
            "blocker": "CI broken",
        }, headers=H_SCOUT)
        r2 = client.get("/tracker/blocked", headers=H_SCOUT)
        assert r2.status_code == 200
        assert len(r2.json()) == 1

    def test_decisions(self, client):
        r = client.post("/tracker", json={
            "repo": "teams.py", "title": "Decision item",
        }, headers=H_SCOUT)
        client.patch(f"/tracker/{r.json()['id'][:8]}", json={
            "decision": "Use approach B",
            "decision_rationale": "Lower risk",
        }, headers=H_SCOUT)
        r2 = client.get("/tracker/decisions", headers=H_SCOUT)
        assert r2.status_code == 200
        assert len(r2.json()) == 1

    def test_search(self, client):
        client.post("/tracker", json={
            "repo": "teams.py", "title": "JWKS caching bug",
        }, headers=H_SCOUT)
        r = client.get("/tracker/search?q=JWKS", headers=H_SCOUT)
        assert r.status_code == 200
        assert len(r.json()) == 1


class TestWebSocket:
    def test_ws_snapshot_on_connect(self, client):
        """WS connection sends initial snapshot of open items."""
        client.post("/tracker", json={
            "repo": "teams.py", "title": "WS test item",
        }, headers=H_SCOUT)
        with client.websocket_connect("/tracker/ws?name=scout") as ws:
            msg = ws.receive_json()
            assert msg["type"] == "tracker-snapshot"
            assert isinstance(msg["payload"], list)
            assert any(i["title"] == "WS test item" for i in msg["payload"])

    def test_ws_no_name_rejected(self, client):
        """WS without name query param is rejected."""
        with pytest.raises(Exception):
            with client.websocket_connect("/tracker/ws") as ws:
                ws.receive_json()
