"""Thread request/response models."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from .messages import MessageResponse


class ThreadResponse(BaseModel):
    """Thread summary."""

    id: str
    subject: str
    participants: list[str]
    created_at: datetime
    last_activity: datetime
    metadata: dict[str, str]
    archived: bool


class ThreadWithMessagesResponse(BaseModel):
    """Thread with all its messages."""

    id: str
    subject: str
    participants: list[str]
    created_at: datetime
    last_activity: datetime
    metadata: dict[str, str]
    archived: bool
    messages: list[MessageResponse]
