"""Shared data models for emcom client and CLI."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Email:
    id: str
    thread_id: str
    sender: str
    to: list[str]
    cc: list[str]
    subject: str
    body: str
    in_reply_to: str | None
    created_at: str
    tags: list[str] = field(default_factory=list)


@dataclass
class Identity:
    name: str
    description: str
    location: str
    registered_at: str
    last_seen: str
    active: bool


@dataclass
class Thread:
    thread_id: str
    subject: str
    participants: list[str]
    email_count: int
    last_activity: str


@dataclass
class LocalIdentity:
    """Shape of identity.json stored on disk."""
    name: str
    server: str
    registered_at: str
