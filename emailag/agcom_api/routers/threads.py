"""Threads router: list, get, reply, metadata, archive."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..dependencies import get_current_user
from ..models import MessageResponse, ReplyRequest, ThreadResponse, ThreadWithMessagesResponse
from .messages import _get_agcom_session, _message_to_response

router = APIRouter(prefix="/threads", tags=["threads"])


def _thread_to_response(thread) -> ThreadResponse:
    """Convert an agcom Thread to a ThreadResponse."""
    return ThreadResponse(
        id=thread.id,
        subject=thread.subject,
        participants=thread.participants,
        created_at=thread.created_at,
        last_activity=thread.last_activity,
        metadata=thread.metadata or {},
        archived=thread.archived,
    )


@router.get("", response_model=list[ThreadResponse])
async def list_threads(
    request: Request,
    user=Depends(get_current_user),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List threads ordered by recent activity."""
    session = _get_agcom_session(request, user)
    threads = session.list_threads(limit=limit, offset=offset)
    return [_thread_to_response(t) for t in threads]


@router.get("/{thread_id}", response_model=ThreadResponse)
async def get_thread(thread_id: str, request: Request, user=Depends(get_current_user)):
    """Get thread details."""
    session = _get_agcom_session(request, user)
    thread = session.get_thread(thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")
    return _thread_to_response(thread)


@router.get("/{thread_id}/messages", response_model=ThreadWithMessagesResponse)
async def get_thread_with_messages(
    thread_id: str, request: Request, user=Depends(get_current_user)
):
    """Get a thread with all its messages."""
    session = _get_agcom_session(request, user)
    thread = session.get_thread(thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")
    messages = session.get_thread_messages(thread_id)
    resp = _thread_to_response(thread)
    return ThreadWithMessagesResponse(
        **resp.model_dump(),
        messages=[_message_to_response(m) for m in messages],
    )


@router.post("/{thread_id}/reply", response_model=MessageResponse, status_code=201)
async def reply_to_thread(
    thread_id: str, body: ReplyRequest, request: Request, user=Depends(get_current_user)
):
    """Reply to the latest message in a thread."""
    session = _get_agcom_session(request, user)
    try:
        msg = session.reply_to_thread(thread_id=thread_id, body=body.body, tags=body.tags)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _message_to_response(msg)


@router.put("/{thread_id}/metadata/{key}")
async def set_thread_metadata(
    thread_id: str, key: str, request: Request, user=Depends(get_current_user)
):
    """Set a metadata key-value pair on a thread."""
    body = await request.json()
    value = body.get("value", "")
    session = _get_agcom_session(request, user)
    try:
        session.set_thread_metadata(thread_id, key, str(value))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "ok"}


@router.get("/{thread_id}/metadata/{key}")
async def get_thread_metadata(
    thread_id: str, key: str, request: Request, user=Depends(get_current_user)
):
    """Get a metadata value from a thread."""
    session = _get_agcom_session(request, user)
    thread = session.get_thread(thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")
    value = (thread.metadata or {}).get(key)
    if value is None:
        raise HTTPException(status_code=404, detail=f"Metadata key '{key}' not found")
    return {"key": key, "value": value}


@router.delete("/{thread_id}/metadata/{key}")
async def delete_thread_metadata(
    thread_id: str, key: str, request: Request, user=Depends(get_current_user)
):
    """Remove a metadata key from a thread."""
    session = _get_agcom_session(request, user)
    try:
        session.remove_thread_metadata(thread_id, key)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "ok"}


@router.post("/{thread_id}/archive")
async def archive_thread(thread_id: str, request: Request, user=Depends(get_current_user)):
    """Archive a thread."""
    session = _get_agcom_session(request, user)
    try:
        session.archive_thread(thread_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "ok"}


@router.post("/{thread_id}/unarchive")
async def unarchive_thread(thread_id: str, request: Request, user=Depends(get_current_user)):
    """Unarchive a thread."""
    session = _get_agcom_session(request, user)
    try:
        session.unarchive_thread(thread_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "ok"}
