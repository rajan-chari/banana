"""Contact request/response models."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ContactCreateRequest(BaseModel):
    """Create a new contact."""

    handle: str = Field(..., min_length=1, max_length=64)
    display_name: str | None = None
    description: str | None = None
    tags: list[str] | None = None


class ContactUpdateRequest(BaseModel):
    """Update an existing contact."""

    display_name: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    version: int = Field(..., ge=1)


class ContactResponse(BaseModel):
    """Contact details."""

    handle: str
    display_name: str | None = None
    description: str | None = None
    tags: list[str]
    active: bool
    version: int
    created_at: datetime
    updated_at: datetime
