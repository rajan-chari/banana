"""Health check endpoint."""

from fastapi import APIRouter
from pydantic import BaseModel

from agcom_api import __version__


router = APIRouter(prefix="/api", tags=["Health"])


class HealthResponse(BaseModel):
    """Response model for health check."""
    status: str
    version: str


@router.get("/health", response_model=HealthResponse)
def health_check():
    """Health check endpoint.

    Returns:
        API status and version
    """
    return HealthResponse(status="ok", version=__version__)
