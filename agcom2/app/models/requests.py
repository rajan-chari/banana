"""Request models for API endpoints."""

from pydantic import BaseModel, Field, field_validator
from typing import Optional


class SendMessageRequest(BaseModel):
    """Request to send a new message."""
    to_handles: list[str] = Field(..., min_length=1, max_length=100)
    subject: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=50000)
    tags: Optional[list[str]] = Field(None, max_length=20)

    @field_validator('to_handles')
    @classmethod
    def validate_handles(cls, v):
        for handle in v:
            if not handle or not handle.strip():
                raise ValueError("Handle cannot be empty")
        return v


class ReplyRequest(BaseModel):
    """Request to reply to a message."""
    body: str = Field(..., min_length=1, max_length=50000)
    tags: Optional[list[str]] = Field(None, max_length=20)


class BroadcastRequest(BaseModel):
    """Request to broadcast a message to multiple recipients."""
    to_handles: list[str] = Field(..., min_length=1, max_length=100)
    subject: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=50000)
    tags: Optional[list[str]] = Field(None, max_length=20)


class CreateContactRequest(BaseModel):
    """Request to create an address book contact."""
    handle: str = Field(..., min_length=2, max_length=64)
    display_name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    tags: Optional[list[str]] = Field(None, max_length=20)


class UpdateContactRequest(BaseModel):
    """Request to update an address book contact."""
    display_name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    tags: Optional[list[str]] = None
    is_active: bool = True
    expected_version: int = Field(..., ge=1)


class UpdateMetadataRequest(BaseModel):
    """Request to update thread metadata."""
    key: str = Field(..., min_length=1, max_length=50)
    value: Optional[str] = Field(None, max_length=500)


class TokenRequest(BaseModel):
    """Request to generate authentication token."""
    agent_handle: str = Field(..., min_length=2, max_length=64)
    agent_secret: str = Field(..., min_length=8)
