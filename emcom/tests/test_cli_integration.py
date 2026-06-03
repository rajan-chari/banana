"""Integration tests for emcom CLI (C# AOT binary).

Spins up a real emcom-server on port 8801, invokes the actual emcom.exe
via subprocess, and asserts on stdout/stderr/exit codes.
Tests the full CLI→HTTP→server→DB path.
"""

import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid

import pytest
import httpx

SERVER_PORT = 8801
SERVER_URL = f"http://127.0.0.1:{SERVER_PORT}"
EMCOM_EXE = shutil.which("emcom") or os.path.expanduser("~/.claude/skills/emcom/bin/emcom.exe")
TRACKER_EXE = shutil.which("tracker") or os.path.expanduser("~/.claude/skills/emcom/bin/tracker.exe")


def _run(exe, args, identity_dir=None, expect_error=False):
    """Run a CLI command and return (stdout, stderr, returncode)."""
    cmd = [exe, "--server", SERVER_URL]
    if identity_dir:
        cmd.extend(["--identity", os.path.join(identity_dir, "identity.json")])
    cmd.extend(args)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    if not expect_error:
        assert result.returncode == 0, f"Command failed: {cmd}\nstderr: {result.stderr}\nstdout: {result.stdout}"
    return result.stdout, result.stderr, result.returncode


def _emcom(args, identity_dir=None, expect_error=False):
    return _run(EMCOM_EXE, args, identity_dir, expect_error)


def _tracker(args, identity_dir=None, expect_error=False):
    return _run(TRACKER_EXE, args, identity_dir, expect_error)


@pytest.fixture(scope="module")
def test_server():
    """Start a real emcom-server on port 8801 with isolated data dir."""
    import sys
    data_dir = tempfile.mkdtemp()
    env = os.environ.copy()
    env["EMCOM_PORT"] = str(SERVER_PORT)
    env["EMCOM_DATA_DIR"] = data_dir

    proc = subprocess.Popen(
        [sys.executable, "-c", "from emcom_server.main import run; run()"],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Wait for server to be ready
    for _ in range(50):
        try:
            r = httpx.get(f"{SERVER_URL}/health", timeout=1.0)
            if r.status_code == 200:
                break
        except (httpx.ConnectError, httpx.ReadTimeout):
            pass
        time.sleep(0.1)
    else:
        proc.kill()
        pytest.fail("Test server failed to start on port 8801")

    yield proc

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture
def agents(test_server):
    """Register two agents with unique identity dirs. Uses --force to handle re-registration."""
    alice_dir = tempfile.mkdtemp()
    bob_dir = tempfile.mkdtemp()
    _emcom(["register", "--name", "alice", "--description", "test agent", "--force"], identity_dir=alice_dir)
    _emcom(["register", "--name", "bob", "--description", "test agent", "--force"], identity_dir=bob_dir)
    return {"alice": alice_dir, "bob": bob_dir}


# ============ emcom CLI Tests ============

class TestEmcomRegister:
    def test_register(self, test_server):
        d = tempfile.mkdtemp()
        name = f"test-{uuid.uuid4().hex[:6]}"
        out, _, _ = _emcom(["register", "--name", name, "--description", "integration test"], identity_dir=d)
        assert f"Registered as '{name}'" in out
        assert os.path.exists(os.path.join(d, "identity.json"))

    def test_register_positional(self, test_server):
        """Positional argument should be treated as the name (7eb3665a)."""
        d = tempfile.mkdtemp()
        name = f"pos-{uuid.uuid4().hex[:6]}"
        out, _, _ = _emcom(["register", name, "--description", "positional test"], identity_dir=d)
        assert f"Registered as '{name}'" in out
        assert os.path.exists(os.path.join(d, "identity.json"))

    def test_register_explicit_name_wins_over_positional(self, test_server):
        """When both --name and a positional are given, explicit --name wins."""
        d = tempfile.mkdtemp()
        explicit = f"exp-{uuid.uuid4().hex[:6]}"
        # Positional comes first; --name should still win
        out, _, _ = _emcom(["register", "ignored-positional", "--name", explicit], identity_dir=d)
        assert f"Registered as '{explicit}'" in out

    def test_register_no_name_errors(self, test_server):
        """Bare `emcom register` (no name, no --force) must error, not silently auto-assign (7eb3665a-B)."""
        d = tempfile.mkdtemp()
        _, err, rc = _emcom(["register"], identity_dir=d, expect_error=True)
        assert rc != 0
        assert "name required" in err.lower() or "usage" in err.lower()
        assert not os.path.exists(os.path.join(d, "identity.json")), "no identity.json should be created on error"

    def test_register_unknown_flag_errors(self, test_server):
        """Unknown flags must error, not be silently dropped (7eb3665a-A class; 9637c329)."""
        d = tempfile.mkdtemp()
        _, err, rc = _emcom(["register", "--bogus", "foo"], identity_dir=d, expect_error=True)
        assert rc != 0
        assert "unrecognized" in err.lower() or "usage" in err.lower()

    def test_who(self, test_server):
        out, _, _ = _emcom(["who"])
        assert "Name" in out  # header row present


class TestEmcomSendAndRead:
    def test_send_happy_path(self, agents):
        out, _, _ = _emcom(
            ["send", "--to", "bob", "--subject", "Hello from test", "--body", "Test body"],
            identity_dir=agents["alice"],
        )
        assert "Sent [" in out
        assert "bob" in out

    def test_send_to_nonexistent(self, agents):
        _, err, rc = _emcom(
            ["send", "--to", "nobody999", "--subject", "Hi", "--body", "x"],
            identity_dir=agents["alice"],
            expect_error=True,
        )
        assert rc != 0
        assert "not registered" in err.lower() or "not found" in err.lower() or "Error" in err

    def test_inbox(self, agents):
        _emcom(["send", "--to", "bob", "--subject", "Inbox test", "--body", "body"], identity_dir=agents["alice"])
        out, _, _ = _emcom(["inbox"], identity_dir=agents["bob"])
        assert "Inbox test" in out

    def test_inbox_full(self, agents):
        _emcom(["send", "--to", "bob", "--subject", "Full test", "--body", "Full body here"], identity_dir=agents["alice"])
        out, _, _ = _emcom(["inbox", "--full"], identity_dir=agents["bob"])
        assert "Full body here" in out

    def test_read_all(self, agents):
        _emcom(["send", "--to", "bob", "--subject", "ReadAll test", "--body", "RA body"], identity_dir=agents["alice"])
        out, _, _ = _emcom(["read-all"], identity_dir=agents["bob"])
        assert "RA body" in out or "No unread" in out

    def test_check(self, agents):
        _emcom(["send", "--to", "bob", "--subject", "Check test", "--body", "CK body"], identity_dir=agents["alice"])
        out, _, _ = _emcom(["check"], identity_dir=agents["bob"])
        assert "Check test" in out


class TestEmcomTag:
    def test_tag_single(self, agents):
        _emcom(["send", "--to", "bob", "--subject", "Tag test", "--body", "x"], identity_dir=agents["alice"])
        # Get the email ID from inbox
        out, _, _ = _emcom(["inbox"], identity_dir=agents["bob"])
        # Extract first ID (8-char hex)
        lines = [l for l in out.strip().split("\n") if l and not l.startswith(("ID", "--"))]
        if lines:
            eid = lines[0].split()[0]
            out2, _, _ = _emcom(["tag", eid, "important"], identity_dir=agents["bob"])
            assert "Tagged" in out2

    def test_tag_batch(self, agents):
        _emcom(["send", "--to", "bob", "--subject", "Batch1", "--body", "x"], identity_dir=agents["alice"])
        _emcom(["send", "--to", "bob", "--subject", "Batch2", "--body", "y"], identity_dir=agents["alice"])
        out, _, _ = _emcom(["inbox"], identity_dir=agents["bob"])
        lines = [l for l in out.strip().split("\n") if l and not l.startswith(("ID", "--"))]
        if len(lines) >= 2:
            id1 = lines[0].split()[0]
            id2 = lines[1].split()[0]
            out2, _, _ = _emcom(["tag", "handled", id1, id2], identity_dir=agents["bob"])
            assert "Tagged 2 message(s)" in out2

    def test_tag_rejects_unknown_flag(self, agents):
        """`emcom tag <id> --add foo` must error, not treat --add as a literal tag (9637c329)."""
        _emcom(["send", "--to", "bob", "--subject", "TagFlag", "--body", "x"], identity_dir=agents["alice"])
        out, _, _ = _emcom(["inbox"], identity_dir=agents["bob"])
        lines = [l for l in out.strip().split("\n") if l and not l.startswith(("ID", "--"))]
        assert lines, "expected at least one inbox entry"
        eid = lines[0].split()[0]
        _, err, rc = _emcom(["tag", eid, "--add", "foo"], identity_dir=agents["bob"], expect_error=True)
        assert rc != 0
        assert "unrecognized" in err.lower() or "usage" in err.lower()


class TestEmcomReply:
    def test_reply_with_handled(self, agents):
        out, _, _ = _emcom(
            ["send", "--to", "bob", "--subject", "Reply test", "--body", "Original"],
            identity_dir=agents["alice"],
        )
        # Extract email ID from send output
        eid = out.split("[")[1].split("]")[0] if "[" in out else None
        if eid:
            out2, _, _ = _emcom(
                ["reply", eid, "--body", "Got it", "--handled"],
                identity_dir=agents["bob"],
            )
            assert "Replied" in out2
            assert "Tagged" in out2

    def test_reply_body_file(self, agents):
        """`emcom reply <id> --body-file <path>` reads body from file (91d0b0d8)."""
        out, _, _ = _emcom(
            ["send", "--to", "bob", "--subject", "ReplyBF", "--body", "Original"],
            identity_dir=agents["alice"],
        )
        eid = out.split("[")[1].split("]")[0]
        body_path = os.path.join(tempfile.mkdtemp(), "reply.txt")
        with open(body_path, "w", encoding="utf-8") as f:
            f.write("Long reply body\nwith multiple lines\n")
        out2, _, _ = _emcom(
            ["reply", eid, "--body-file", body_path],
            identity_dir=agents["bob"],
        )
        assert "Replied" in out2
        # Verify body actually landed
        thread_id = out2.split("thread")[1].strip()
        out3, _, _ = _emcom(["inbox", "--full"], identity_dir=agents["alice"])
        assert "Long reply body" in out3

    def test_reply_body_and_body_file_mutex(self, agents):
        out, _, _ = _emcom(
            ["send", "--to", "bob", "--subject", "ReplyMutex", "--body", "Original"],
            identity_dir=agents["alice"],
        )
        eid = out.split("[")[1].split("]")[0]
        body_path = os.path.join(tempfile.mkdtemp(), "r.txt")
        with open(body_path, "w") as f:
            f.write("x")
        _, err, rc = _emcom(
            ["reply", eid, "--body", "inline", "--body-file", body_path],
            identity_dir=agents["bob"],
            expect_error=True,
        )
        assert rc != 0
        assert "mutually exclusive" in err.lower()

    def test_reply_body_file_missing(self, agents):
        out, _, _ = _emcom(
            ["send", "--to", "bob", "--subject", "ReplyMiss", "--body", "Original"],
            identity_dir=agents["alice"],
        )
        eid = out.split("[")[1].split("]")[0]
        _, err, rc = _emcom(
            ["reply", eid, "--body-file", "/nonexistent/path/to/file.txt"],
            identity_dir=agents["bob"],
            expect_error=True,
        )
        assert rc != 0
        assert "not found" in err.lower()


class TestEmcomStatus:
    def test_status(self, agents):
        out, _, _ = _emcom(["status"], identity_dir=agents["alice"])
        assert "Identity: alice" in out
        assert "Unread:" in out
        assert "Pending:" in out


class TestEmcomInbox:
    def test_inbox_rejects_unknown_flag(self, agents):
        """Unknown flags on inbox must error rather than silently drop (9637c329 class)."""
        _, err, rc = _emcom(["inbox", "--bogus"], identity_dir=agents["alice"], expect_error=True)
        assert rc != 0
        assert "unrecognized" in err.lower()


class TestEmcomSearch:
    def test_search(self, agents):
        _emcom(["send", "--to", "bob", "--subject", "Unique9876", "--body", "x"], identity_dir=agents["alice"])
        out, _, _ = _emcom(["search", "--subject", "Unique9876"], identity_dir=agents["bob"])
        assert "Unique9876" in out

    def test_search_rejects_unknown_flag(self, agents):
        _, err, rc = _emcom(["search", "--bogus", "v"], identity_dir=agents["bob"], expect_error=True)
        assert rc != 0
        assert "unrecognized" in err.lower()


class TestEmcomSendBodyFile:
    def test_send_body_file(self, agents):
        body_path = os.path.join(tempfile.mkdtemp(), "send.txt")
        with open(body_path, "w", encoding="utf-8") as f:
            f.write("Body from file\nwith newlines\n")
        out, _, _ = _emcom(
            ["send", "--to", "bob", "--subject", "BodyFileSend", "--body-file", body_path],
            identity_dir=agents["alice"],
        )
        assert "Sent [" in out
        out2, _, _ = _emcom(["inbox", "--full"], identity_dir=agents["bob"])
        assert "Body from file" in out2

    def test_send_body_and_body_file_mutex(self, agents):
        body_path = os.path.join(tempfile.mkdtemp(), "send.txt")
        with open(body_path, "w") as f:
            f.write("x")
        _, err, rc = _emcom(
            ["send", "--to", "bob", "--subject", "Mutex", "--body", "inline", "--body-file", body_path],
            identity_dir=agents["alice"],
            expect_error=True,
        )
        assert rc != 0
        assert "mutually exclusive" in err.lower()

    def test_send_body_file_missing(self, agents):
        _, err, rc = _emcom(
            ["send", "--to", "bob", "--subject", "Miss", "--body-file", "/nonexistent/x.txt"],
            identity_dir=agents["alice"],
            expect_error=True,
        )
        assert rc != 0
        assert "not found" in err.lower()

    def test_send_rejects_unknown_flag(self, agents):
        _, err, rc = _emcom(
            ["send", "--to", "bob", "--subject", "X", "--body", "x", "--bogus"],
            identity_dir=agents["alice"],
            expect_error=True,
        )
        assert rc != 0
        assert "unrecognized" in err.lower()


class TestEmcomCC:
    def test_cc_comma_separated(self, agents):
        carol_dir = tempfile.mkdtemp()
        _emcom(["register", "--name", "carol", "--description", "cc test", "--force"], identity_dir=carol_dir)
        out, _, _ = _emcom(
            ["send", "--to", "bob", "--cc", "carol", "--subject", "CC test", "--body", "x"],
            identity_dir=agents["alice"],
        )
        assert "Sent [" in out


# ============ tracker CLI Tests ============

class TestTrackerCreate:
    def test_create(self, agents):
        num = 10000 + int(uuid.uuid4().int % 90000)
        out, _, _ = _tracker(
            ["create", "--repo", "teams.py", "--title", "Test issue", "--number", str(num)],
            identity_dir=agents["alice"],
        )
        assert "Created [" in out
        assert f"teams.py#{num}" in out

    def test_create_dedup(self, agents):
        num = 20000 + int(uuid.uuid4().int % 80000)
        _tracker(["create", "--repo", "teams.py", "--title", "First", "--number", str(num)], identity_dir=agents["alice"])
        out2, _, _ = _tracker(
            ["create", "--repo", "teams.py", "--title", "Second", "--number", str(num)],
            identity_dir=agents["alice"],
        )
        assert "Created [" in out2
        assert "First" in out2  # returns existing


class TestTrackerUpdate:
    def test_update_status(self, agents):
        num = 30000 + int(uuid.uuid4().int % 70000)
        _tracker(["create", "--repo", "teams.py", "--title", "Update test", "--number", str(num)], identity_dir=agents["alice"])
        out, _, _ = _tracker(
            ["update", f"teams.py#{num}", "--status", "investigating", "--comment", "Starting"],
            identity_dir=agents["alice"],
        )
        assert "Updated [" in out
        assert "investigating" in out


class TestTrackerList:
    def test_list(self, agents):
        out, _, _ = _tracker(["list"], identity_dir=agents["alice"])
        # Should show at least header or "No items"
        assert "ID" in out or "No items" in out

    def test_list_with_filter(self, agents):
        out, _, _ = _tracker(["list", "--status", "open"], identity_dir=agents["alice"])
        assert "ID" in out or "No items" in out


class TestTrackerView:
    def test_view(self, agents):
        num = 40000 + int(uuid.uuid4().int % 60000)
        out, _, _ = _tracker(
            ["create", "--repo", "teams.ts", "--title", "View test", "--number", str(num)],
            identity_dir=agents["alice"],
        )
        out2, _, _ = _tracker(["view", f"teams.ts#{num}"], identity_dir=agents["alice"])
        assert "View test" in out2
        assert "History:" in out2


class TestTrackerStats:
    def test_stats(self, agents):
        out, _, _ = _tracker(["stats"], identity_dir=agents["alice"])
        assert "By Status:" in out
