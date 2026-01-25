# app/routers/audit.py
from fastapi import APIRouter, Request
from slowapi import Limiter
from typing import Optional

from app.dependencies import SessionDep, get_agent_handle
from app.models.responses import PaginatedAuditEventsResponse, AuditEventResponse

router = APIRouter()
limiter = Limiter(key_func=get_agent_handle)

@router.get("/audit/events", response_model=PaginatedAuditEventsResponse)
@limiter.limit("100/minute")
async def list_audit_events(
    request: Request,
    session: SessionDep,
    target_handle: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """List audit events."""
    if limit > 100:
        limit = 100

    # Get audit events - audit_list only supports target_handle and limit
    # We'll filter by event_type manually if provided
    all_events = session.audit_list(target_handle=target_handle)

    # Filter by event_type if provided
    if event_type:
        all_events = [e for e in all_events if e.event_type == event_type]

    # Apply pagination
    total = len(all_events)
    events = all_events[offset:offset+limit]
    has_more = offset + limit < total

    return {
        "events": [AuditEventResponse.from_event(e) for e in events],
        "pagination": {
            "offset": offset,
            "limit": limit,
            "total": total,
            "has_more": has_more
        }
    }
