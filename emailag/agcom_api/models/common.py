"""Common models shared across the API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str
    message: str
    detail: str | None = None


class PaginationParams(BaseModel):
    """Pagination parameters for list endpoints."""

    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)
