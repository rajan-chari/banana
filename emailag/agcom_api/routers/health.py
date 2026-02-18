"""Health check endpoint (public, no auth)."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """Public health check endpoint."""
    return {"status": "ok", "service": "agcom-api", "version": "0.1.0"}
