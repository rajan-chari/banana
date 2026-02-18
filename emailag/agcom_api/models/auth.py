"""Authentication request/response models."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """Login request payload."""

    handle: str = Field(..., min_length=1, max_length=64)
    display_name: str | None = None


class LoginResponse(BaseModel):
    """Login response with session token."""

    token: str
    expires_at: datetime
    handle: str
    display_name: str | None = None


class IdentityResponse(BaseModel):
    """Current user identity."""

    handle: str
    display_name: str | None = None
    is_admin: bool = False
