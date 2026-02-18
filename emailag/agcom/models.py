"""Data models for the agcom agent communication library."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone

import ulid


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return ulid.new().str


@dataclass
class AgentIdentity:
    """An agent identified by a unique handle."""

    handle: str
    display_name: str | None = None


@dataclass
class Message:
    """An immutable message in a conversation thread."""

    id: str = field(default_factory=_new_id)
    thread_id: str = ""
    sender: str = ""
    recipients: list[str] = field(default_factory=list)
    subject: str = ""
    body: str = ""
    tags: list[str] = field(default_factory=list)
    reply_to: str | None = None
    timestamp: datetime = field(default_factory=_now)

    def recipients_json(self) -> str:
        return json.dumps(self.recipients)

    def tags_json(self) -> str:
        return json.dumps(self.tags)


@dataclass
class Thread:
    """A conversation container tracking participants and activity."""

    id: str = field(default_factory=_new_id)
    subject: str = ""
    participants: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=_now)
    last_activity: datetime = field(default_factory=_now)
    metadata: dict = field(default_factory=dict)
    archived: bool = False

    def participants_json(self) -> str:
        return json.dumps(self.participants)

    def metadata_json(self) -> str:
        return json.dumps(self.metadata)


@dataclass
class AddressBookEntry:
    """A contact in the shared address book with optimistic locking."""

    handle: str = ""
    display_name: str = ""
    description: str = ""
    tags: list[str] = field(default_factory=list)
    active: bool = True
    version: int = 1
    created_at: datetime = field(default_factory=_now)
    updated_at: datetime = field(default_factory=_now)

    def tags_json(self) -> str:
        return json.dumps(self.tags)


@dataclass
class AuditEvent:
    """An immutable audit log entry."""

    id: str = field(default_factory=_new_id)
    event_type: str = ""
    actor: str = ""
    target: str | None = None
    details: dict = field(default_factory=dict)
    timestamp: datetime = field(default_factory=_now)

    def details_json(self) -> str:
        return json.dumps(self.details)
