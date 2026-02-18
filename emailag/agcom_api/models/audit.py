"""Audit event response models."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AuditEventResponse(BaseModel):
    """Audit event details."""

    id: str
    event_type: str
    actor: str
    target: str | None = None
    details: dict | None = None
    timestamp: datetime
