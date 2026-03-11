"""Sync httpx client for emcom-server."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path, PurePosixPath

import httpx

from emcom.models import Email, Identity, Thread, LocalIdentity


class EmcomError(Exception):
    pass


class EmcomConnectionError(EmcomError):
    pass


class EmcomNotFoundError(EmcomError):
    pass


class EmcomConflictError(EmcomError):
    pass


class EmcomAuthError(EmcomError):
    pass


def _to_email(d: dict) -> Email:
    return Email(
        id=d["id"], thread_id=d["thread_id"], sender=d.get("sender", d.get("from", "")),
        to=d["to"], cc=d.get("cc", []), subject=d.get("subject", ""),
        body=d.get("body", ""), in_reply_to=d.get("in_reply_to"),
        created_at=d["created_at"], tags=d.get("tags", []),
    )


def _to_identity(d: dict) -> Identity:
    return Identity(
        name=d["name"], description=d.get("description", ""),
        location=d.get("location", ""),
        registered_at=d["registered_at"], last_seen=d["last_seen"],
        active=bool(d.get("active", True)),
    )


def _to_thread(d: dict) -> Thread:
    return Thread(
        thread_id=d["thread_id"], subject=d.get("subject", ""),
        participants=d.get("participants", []),
        email_count=d.get("email_count", 0),
        last_activity=d.get("last_activity", ""),
    )


class EmcomClient:
    def __init__(self, identity: str = "identity.json", server: str = "http://127.0.0.1:8800"):
        self.identity_file = Path(identity)
        self.server = server
        self._identity: LocalIdentity | None = None
        self._client = httpx.Client(base_url=server, timeout=30.0)

        # Load existing identity if present
        if self.identity_file.exists():
            data = json.loads(self.identity_file.read_text())
            self._identity = LocalIdentity(**data)
            self.server = data.get("server", server)
            self._client = httpx.Client(base_url=self.server, timeout=30.0)

    @property
    def name(self) -> str | None:
        return self._identity.name if self._identity else None

    def _headers(self) -> dict:
        if self._identity:
            return {"X-Emcom-Name": self._identity.name}
        return {}

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        headers = kwargs.pop("headers", {})
        headers.update(self._headers())
        try:
            r = self._client.request(method, path, headers=headers, **kwargs)
        except httpx.ConnectError:
            raise EmcomConnectionError(f"Cannot connect to {self.server}")

        if r.status_code == 401:
            raise EmcomAuthError(r.json().get("detail", "Unauthorized"))
        if r.status_code == 404:
            raise EmcomNotFoundError(r.json().get("detail", "Not found"))
        if r.status_code == 409:
            raise EmcomConflictError(r.json().get("detail", "Conflict"))
        if r.status_code >= 400:
            detail = r.text
            try:
                detail = r.json().get("detail", r.text)
            except Exception:
                pass
            raise EmcomError(f"HTTP {r.status_code}: {detail}")
        return r

    def _save_identity(self, name: str):
        from datetime import datetime, timezone
        self._identity = LocalIdentity(
            name=name, server=self.server,
            registered_at=datetime.now(timezone.utc).isoformat(),
        )
        self.identity_file.parent.mkdir(parents=True, exist_ok=True)
        self.identity_file.write_text(json.dumps({
            "name": self._identity.name,
            "server": self._identity.server,
            "registered_at": self._identity.registered_at,
        }, indent=2))

    def _remove_identity(self):
        id_file = self.identity_file
        if id_file.exists():
            id_file.unlink()
        self._identity = None

    # --- Identity ---

    def register(self, name: str | None = None, description: str = "", force: bool = False) -> Identity:
        if self._identity and not force:
            raise EmcomError(f"Already registered as '{self._identity.name}'. Unregister first or use force=True.")

        parts = PurePosixPath(Path.cwd().as_posix()).parts
        location = "/".join(parts[-3:]) if len(parts) >= 3 else "/".join(parts)

        body: dict = {"description": description, "location": location, "force": force}
        if name:
            body["name"] = name

        r = self._request("POST", "/register", json=body)
        data = r.json()
        self._save_identity(data["name"])
        return _to_identity(data)

    def unregister(self):
        if not self._identity:
            raise EmcomError("Not registered")
        self._request("DELETE", f"/register/{self._identity.name}")
        self._remove_identity()

    def who(self) -> list[Identity]:
        r = self._request("GET", "/who")
        return [_to_identity(d) for d in r.json()]

    def update_description(self, description: str) -> Identity:
        if not self._identity:
            raise EmcomError("Not registered")
        r = self._request("PATCH", f"/who/{self._identity.name}",
                          json={"description": description})
        return _to_identity(r.json())

    # --- Email ---

    def send(self, to: list[str], subject: str, body: str, cc: list[str] | None = None) -> Email:
        payload = {"to": to, "subject": subject, "body": body, "cc": cc or []}
        r = self._request("POST", "/email", json=payload)
        return _to_email(r.json())

    def inbox(self, include_all: bool = False) -> list[Email]:
        params = {"all": "true"} if include_all else {}
        r = self._request("GET", "/email/inbox", params=params)
        return [_to_email(d) for d in r.json()]

    def read(self, email_id: str, tags: list[str] | None = None) -> Email:
        """Read an email. Default tags=None adds 'pending'; pass tags=[] to skip."""
        if tags is None:
            tags = ["pending"]
        params = {}
        if tags:
            params["add_tags"] = ",".join(tags)
        r = self._request("GET", f"/email/{email_id}", params=params)
        return _to_email(r.json())

    def sent(self) -> list[Email]:
        r = self._request("GET", "/email/sent")
        return [_to_email(d) for d in r.json()]

    def all_mail(self) -> list[Email]:
        r = self._request("GET", "/email/all")
        return [_to_email(d) for d in r.json()]

    def reply(self, email_id: str, body: str) -> Email:
        payload = {"to": [], "body": body, "in_reply_to": email_id}
        # Need to know who to reply to — read the original first
        original = self.read(email_id)
        # Reply to sender + all recipients except self
        reply_to = set([original.sender] + original.to + original.cc)
        if self._identity:
            reply_to.discard(self._identity.name)
        payload["to"] = list(reply_to)
        r = self._request("POST", "/email", json=payload)
        return _to_email(r.json())

    # --- Threads ---

    def threads(self) -> list[Thread]:
        r = self._request("GET", "/threads")
        return [_to_thread(d) for d in r.json()]

    def thread(self, thread_id: str) -> list[Email]:
        r = self._request("GET", f"/threads/{thread_id}")
        return [_to_email(d) for d in r.json()]

    # --- Tags ---

    def tag(self, email_id: str, *tags: str):
        self._request("POST", f"/email/{email_id}/tags", json={"tags": list(tags)})

    def untag(self, email_id: str, tag: str):
        self._request("DELETE", f"/email/{email_id}/tags/{tag}")

    def tagged(self, tag: str) -> list[Email]:
        r = self._request("GET", f"/email/tags/{tag}")
        return [_to_email(d) for d in r.json()]

    # --- Search ---

    def search(self, from_: str | None = None, to: str | None = None,
               subject: str | None = None, tag: str | None = None,
               body: str | None = None) -> list[Email]:
        params = {}
        if from_:
            params["from_"] = from_
        if to:
            params["to"] = to
        if subject:
            params["subject"] = subject
        if tag:
            params["tag"] = tag
        if body:
            params["body"] = body
        r = self._request("GET", "/search", params=params)
        return [_to_email(d) for d in r.json()]

    # --- Name Pool ---

    def names(self) -> list[str]:
        r = self._request("GET", "/names")
        return r.json()

    def add_names(self, names: list[str]) -> int:
        r = self._request("POST", "/names", json={"names": names})
        return r.json()["added"]

    # --- Admin ---

    def purge(self) -> dict:
        r = self._request("POST", "/admin/purge")
        return r.json()

    # --- Server Lifecycle ---

    def ensure_server(self):
        """Check if server is running; if not, start it as a background process."""
        try:
            r = self._client.get("/health", timeout=2.0)
            if r.status_code == 200:
                return
        except (httpx.ConnectError, httpx.ReadTimeout):
            pass

        # Start server
        pid_file = Path.home() / ".emcom-server.pid"
        proc = subprocess.Popen(
            [sys.executable, "-m", "emcom_server.main"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.DETACHED_PROCESS if sys.platform == "win32" else 0,
        )
        pid_file.write_text(str(proc.pid))

        # Wait for health
        for _ in range(50):
            time.sleep(0.1)
            try:
                r = self._client.get("/health", timeout=2.0)
                if r.status_code == 200:
                    return
            except (httpx.ConnectError, httpx.ReadTimeout):
                pass
        raise EmcomConnectionError("Failed to start emcom-server within 5 seconds")
