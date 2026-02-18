"""Seed the agcom database with sample users and messages."""

import httpx

API = "http://127.0.0.1:8700"
client = httpx.Client(base_url=API, timeout=10)


def login(handle, display_name):
    r = client.post("/auth/login", json={"handle": handle, "display_name": display_name})
    r.raise_for_status()
    return r.json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def send(token, recipients, subject, body, tags=None):
    r = client.post(
        "/messages",
        headers=auth(token),
        json={"recipients": recipients, "subject": subject, "body": body, "tags": tags or []},
    )
    r.raise_for_status()
    return r.json()


def reply(token, message_id, body, tags=None):
    r = client.post(
        f"/messages/{message_id}/reply",
        headers=auth(token),
        json={"body": body, "tags": tags or []},
    )
    r.raise_for_status()
    return r.json()


def reply_thread(token, thread_id, body, tags=None):
    r = client.post(
        f"/threads/{thread_id}/reply",
        headers=auth(token),
        json={"body": body, "tags": tags or []},
    )
    r.raise_for_status()
    return r.json()


# --- Login users ---
em_tok = login("em", "Engineering Manager")
coder_tok = login("coder", "Coder Agent")
runner_tok = login("runner", "Runner Agent")
alice_tok = login("alice", "Alice Chen")
bob_tok = login("bob", "Bob Kumar")
print("5 users logged in")

# --- Thread 1: Auth module task ---
msg1 = send(
    em_tok,
    ["coder", "runner"],
    "Task: Implement user auth module",
    "We need a JWT-based auth module. Coder: write the implementation. Runner: set up the test environment and run the suite when ready.",
    ["task", "auth", "priority-high"],
)
t1 = msg1["thread_id"]

msg2 = reply(
    coder_tok,
    msg1["id"],
    "On it. I'll use PyJWT with RS256 signing. Drafting the module now - expect a PR in about 20 minutes.",
    ["status-update"],
)

msg3 = reply(
    runner_tok,
    msg2["id"],
    "Test env is ready. I've got pytest + httpx configured with a fresh SQLite fixture. Waiting for the code drop.",
    ["status-update"],
)

msg4 = reply(
    coder_tok,
    msg3["id"],
    "Done. Here's the implementation:\n\n"
    "```python\n"
    "import jwt\n"
    "from datetime import datetime, timedelta\n\n"
    "class AuthService:\n"
    '    def __init__(self, private_key, public_key, expiry_hours=24):\n'
    "        self.private_key = private_key\n"
    "        self.public_key = public_key\n"
    "        self.expiry = timedelta(hours=expiry_hours)\n\n"
    '    def create_token(self, user_id: str, roles: list[str]) -> str:\n'
    "        payload = {\n"
    '            "sub": user_id,\n'
    '            "roles": roles,\n'
    '            "iat": datetime.utcnow(),\n'
    '            "exp": datetime.utcnow() + self.expiry,\n'
    "        }\n"
    '        return jwt.encode(payload, self.private_key, algorithm="RS256")\n\n'
    '    def verify_token(self, token: str) -> dict:\n'
    '        return jwt.decode(token, self.public_key, algorithms=["RS256"])\n'
    "```\n\n"
    "PR is up. Runner - please run the tests.",
    ["code", "pr-ready"],
)

msg5 = reply(
    runner_tok,
    msg4["id"],
    "Test results:\n\n"
    "  tests/test_auth.py::test_create_token PASSED\n"
    "  tests/test_auth.py::test_verify_token PASSED\n"
    "  tests/test_auth.py::test_expired_token PASSED\n"
    "  tests/test_auth.py::test_invalid_signature PASSED\n"
    "  tests/test_auth.py::test_missing_claims PASSED\n\n"
    "5 passed in 0.42s. All green. Merging.",
    ["test-results", "passed"],
)

reply_thread(
    em_tok,
    t1,
    "Excellent work, team. Auth module merged to main. Moving on to the next task.",
    ["completed"],
)
print("Thread 1: Auth module task (6 messages)")

# --- Thread 2: Database migration plan ---
msg_a1 = send(
    alice_tok,
    ["bob"],
    "Database migration plan",
    "Hey Bob, we need to plan the PostgreSQL migration. Current SQLite won't scale past 10k concurrent users. Can you draft a migration strategy?",
    ["planning", "database"],
)
t2 = msg_a1["thread_id"]

reply(
    bob_tok,
    msg_a1["id"],
    "Sure. Here's my initial thinking:\n\n"
    "1. Add SQLAlchemy with async support (asyncpg driver)\n"
    "2. Use Alembic for schema migrations\n"
    "3. Dual-write period: write to both SQLite and PG for 1 week\n"
    "4. Read-switch: flip reads to PG, keep SQLite as fallback\n"
    "5. Decommission SQLite after 2 weeks of clean PG operation\n\n"
    "Main risk: the address book optimistic locking needs careful testing under PG's MVCC. I'll prototype this week.",
    ["planning", "proposal"],
)

reply_thread(
    alice_tok,
    t2,
    "Good plan. One concern - step 3 dual-write might introduce latency. Can we batch the SQLite writes async? Also loop in EM for capacity planning.",
)
print("Thread 2: Database migration (3 messages)")

# --- Thread 3: Sprint retro announcement ---
send(
    em_tok,
    ["alice", "bob", "coder", "runner"],
    "Sprint retro: Friday 3pm",
    "Reminder: sprint retro is Friday at 3pm. Please come prepared with your highlights and blockers. We'll also review the auth module delivery.",
    ["announcement", "retro"],
)
print("Thread 3: Sprint retro announcement (1 message)")

print("\nDone. Refresh the viewer to see all messages.")
