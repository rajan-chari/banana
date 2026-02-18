"""Audit router: query audit events."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from ..dependencies import get_current_user
from ..models import AuditEventResponse
from .messages import _get_agcom_session

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditEventResponse])
async def list_audit_events(
    request: Request,
    user=Depends(get_current_user),
    event_type: str | None = Query(None),
    actor: str | None = Query(None),
    target: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """Query audit events with optional filters."""
    session = _get_agcom_session(request, user)
    events = session.list_audit_events(
        event_type=event_type,
        actor=actor,
        target=target,
        limit=limit,
    )
    return [
        AuditEventResponse(
            id=e.id,
            event_type=e.event_type,
            actor=e.actor,
            target=e.target,
            details=e.details,
            timestamp=e.timestamp,
        )
        for e in events
    ]
