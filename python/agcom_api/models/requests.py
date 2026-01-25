"""Pydantic request models for the API."""

from typing import Optional
from pydantic import BaseModel, Field


class SendMessageRequest(BaseModel):
    """Request model for sending a new message."""
    to_handles: list[str] = Field(..., min_length=1, description="List of recipient handles")
    subject: str = Field(..., min_length=1, max_length=200, description="Message subject")
    body: str = Field(..., min_length=1, max_length=50000, description="Message body")
    tags: Optional[list[str]] = Field(None, description="Optional list of tags")


class ReplyRequest(BaseModel):
    """Request model for replying to a message."""
    body: str = Field(..., min_length=1, max_length=50000, description="Reply body")
    tags: Optional[list[str]] = Field(None, description="Optional list of tags")


class AddContactRequest(BaseModel):
    """Request model for adding a contact."""
    handle: str = Field(..., min_length=1, description="Agent handle")
    display_name: Optional[str] = Field(None, description="Optional display name")
    description: Optional[str] = Field(None, description="Optional description")
    tags: Optional[list[str]] = Field(None, description="Optional list of tags")


class UpdateContactRequest(BaseModel):
    """Request model for updating a contact."""
    display_name: Optional[str] = Field(None, description="New display name")
    description: Optional[str] = Field(None, description="New description")
    tags: Optional[list[str]] = Field(None, description="New list of tags")
    is_active: Optional[bool] = Field(None, description="Whether entry is active")
    expected_version: Optional[int] = Field(None, description="Expected version for optimistic locking")


class SetMetadataRequest(BaseModel):
    """Request model for setting thread metadata."""
    key: str = Field(..., min_length=1, description="Metadata key")
    value: Optional[str] = Field(None, description="Metadata value (null to remove)")


class LoginRequest(BaseModel):
    """Request model for login."""
    handle: str = Field(..., min_length=1, description="Agent handle")
    display_name: Optional[str] = Field(None, description="Optional display name")
