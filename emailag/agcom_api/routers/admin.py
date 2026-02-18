"""Admin router: unscoped access to all data."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from ..dependencies import require_admin
from ..models import MessageResponse, ThreadResponse
from .messages import _get_agcom_session, _message_to_response
from .threads import _thread_to_response

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/threads", response_model=list[ThreadResponse])
async def admin_list_threads(
    request: Request,
    user=Depends(require_admin),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List all threads (admin only, unscoped)."""
    session = _get_agcom_session(request, user)
    threads = session.list_threads(limit=limit, offset=offset)
    return [_thread_to_response(t) for t in threads]


@router.get("/messages", response_model=list[MessageResponse])
async def admin_list_messages(
    request: Request,
    user=Depends(require_admin),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List all messages (admin only, unscoped)."""
    storage = request.app.state.storage
    messages = storage.list_messages(limit=limit, offset=offset)
    return [_message_to_response(m) for m in messages]


@router.get("/messages/poll", response_model=list[MessageResponse])
async def admin_poll_messages(
    request: Request,
    user=Depends(require_admin),
    since_id: str = Query("", description="Return messages after this ID"),
    limit: int = Query(50, ge=1, le=200),
):
    """Poll for new messages since a given ID (admin only)."""
    storage = request.app.state.storage
    messages = storage.get_messages_since(since_id=since_id)
    return [_message_to_response(m) for m in messages[:limit]]


@router.get("/users")
async def admin_list_users(
    request: Request,
    user=Depends(require_admin),
):
    """List all known users (admin only)."""
    storage = request.app.state.storage
    contacts = storage.list_contacts(active_only=False)
    return [
        {
            "handle": c.handle,
            "display_name": c.display_name,
            "active": c.active,
            "tags": c.tags or [],
        }
        for c in contacts
    ]


@router.get("/stats")
async def admin_stats(
    request: Request,
    user=Depends(require_admin),
):
    """Get aggregate system statistics (admin only)."""
    storage = request.app.state.storage
    return storage.get_stats()
