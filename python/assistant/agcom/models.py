"""
Response models for agcom REST API client.

Lightweight dataclass models matching the API response structure.
"""

from dataclasses import dataclass
from datetime import datetime


@dataclass
class Message:
    """Message response model."""

    message_id: str
    thread_id: str
    from_handle: str
    to_handles: list[str]
    subject: str
    body: str
    created_at: datetime
    in_reply_to: str | None = None
    tags: list[str] | None = None


@dataclass
class Thread:
    """Thread response model."""

    thread_id: str
    subject: str
    participant_handles: list[str]
    created_at: datetime
    last_activity_at: datetime
    metadata: dict[str, str] | None = None


@dataclass
class Contact:
    """Contact (address book entry) response model."""

    handle: str
    display_name: str | None
    description: str | None
    tags: list[str] | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    updated_by: str
    version: int


@dataclass
class AgentInfo:
    """Agent identity response model."""

    handle: str
    display_name: str | None = None


@dataclass
class LoginInfo:
    """Login response model."""

    token: str
    expires_at: datetime
    identity: AgentInfo


@dataclass
class AuditEvent:
    """Audit event response model."""

    event_id: str
    event_type: str
    actor_handle: str
    target_handle: str | None
    details: str | None
    timestamp: datetime
