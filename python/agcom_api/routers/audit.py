"""Audit log endpoints."""

from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from agcom.session import AgentCommsSession
from agcom_api.dependencies import get_session
from agcom_api.models.responses import AuditEventResponse, audit_event_to_response


router = APIRouter(prefix="/api/audit", tags=["Audit"])


class AuditEventListResponse(BaseModel):
    """Response model for audit event list."""
    events: list[AuditEventResponse]


@router.get("/events", response_model=AuditEventListResponse)
def list_audit_events(
    session: Annotated[AgentCommsSession, Depends(get_session)],
    target_handle: Optional[str] = Query(None, description="Filter by target handle"),
    limit: Optional[int] = Query(None, description="Maximum number of events")
):
    """List audit events with optional filters.

    Args:
        session: Authenticated session
        target_handle: Filter by target handle
        limit: Maximum events to return

    Returns:
        List of audit events
    """
    events = session.audit_list(target_handle=target_handle, limit=limit)
    return AuditEventListResponse(
        events=[audit_event_to_response(e) for e in events]
    )
