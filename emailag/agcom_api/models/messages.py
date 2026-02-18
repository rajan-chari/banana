"""Message request/response models."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SendRequest(BaseModel):
    """Send a new message."""

    recipients: list[str] = Field(..., min_length=1)
    subject: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1)
    tags: list[str] | None = None


class ReplyRequest(BaseModel):
    """Reply to an existing message."""

    body: str = Field(..., min_length=1)
    tags: list[str] | None = None


class MessageResponse(BaseModel):
    """Message details."""

    id: str
    thread_id: str
    sender: str
    recipients: list[str]
    subject: str
    body: str
    tags: list[str]
    reply_to: str | None = None
    timestamp: datetime
