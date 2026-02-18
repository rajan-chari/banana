"""Messages router: send, reply, list, search."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..dependencies import get_current_user
from ..models import MessageResponse, ReplyRequest, SendRequest

router = APIRouter(prefix="/messages", tags=["messages"])


def _message_to_response(msg) -> MessageResponse:
    """Convert an agcom Message to a MessageResponse."""
    return MessageResponse(
        id=msg.id,
        thread_id=msg.thread_id,
        sender=msg.sender,
        recipients=msg.recipients,
        subject=msg.subject,
        body=msg.body,
        tags=msg.tags or [],
        reply_to=msg.reply_to,
        timestamp=msg.timestamp,
    )


def _get_agcom_session(request: Request, user):
    """Create an agcom Session for the authenticated user."""
    from agcom.models import AgentIdentity
    from agcom.session import Session

    storage = request.app.state.storage
    identity = AgentIdentity(handle=user.handle, display_name=user.display_name)
    return Session(storage=storage, identity=identity, is_admin=user.is_admin)


@router.post("", response_model=MessageResponse, status_code=201)
async def send_message(body: SendRequest, request: Request, user=Depends(get_current_user)):
    """Send a new message, creating a new thread."""
    session = _get_agcom_session(request, user)
    msg = session.send_message(
        recipients=body.recipients,
        subject=body.subject,
        body=body.body,
        tags=body.tags,
    )
    return _message_to_response(msg)


@router.post("/{message_id}/reply", response_model=MessageResponse, status_code=201)
async def reply_to_message(
    message_id: str,
    body: ReplyRequest,
    request: Request,
    user=Depends(get_current_user),
):
    """Reply to a specific message."""
    session = _get_agcom_session(request, user)
    try:
        msg = session.reply(message_id=message_id, body=body.body, tags=body.tags)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _message_to_response(msg)


@router.get("", response_model=list[MessageResponse])
async def list_messages(
    request: Request,
    user=Depends(get_current_user),
    thread_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List messages, optionally filtered by thread."""
    session = _get_agcom_session(request, user)
    if thread_id:
        messages = session.get_thread_messages(thread_id)
    else:
        # Use storage directly with pagination (Session doesn't expose list_messages with pagination)
        messages = request.app.state.storage.list_messages(limit=limit, offset=offset)
        if not user.is_admin:
            # Filter to only visible messages
            thread_cache: dict[str, bool] = {}
            visible = []
            for msg in messages:
                if msg.thread_id not in thread_cache:
                    thread = request.app.state.storage.get_thread(msg.thread_id)
                    thread_cache[msg.thread_id] = (
                        thread is not None and user.handle in thread.participants
                    )
                if thread_cache[msg.thread_id]:
                    visible.append(msg)
            messages = visible
    return [_message_to_response(m) for m in messages]


@router.get("/search", response_model=list[MessageResponse])
async def search_messages(
    request: Request,
    user=Depends(get_current_user),
    query: str = Query(..., min_length=1),
    sender: str | None = Query(None),
    recipient: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """Search messages by keyword with optional filters."""
    session = _get_agcom_session(request, user)
    messages = session.search_messages(
        query=query,
        sender=sender,
        recipient=recipient,
        limit=limit,
    )
    return [_message_to_response(m) for m in messages]


@router.get("/{message_id}", response_model=MessageResponse)
async def get_message(message_id: str, request: Request, user=Depends(get_current_user)):
    """Get a single message by ID."""
    session = _get_agcom_session(request, user)
    msg = session.get_message(message_id)
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return _message_to_response(msg)
