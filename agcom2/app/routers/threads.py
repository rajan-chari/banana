# app/routers/threads.py
from fastapi import APIRouter, Request, HTTPException, status
from slowapi import Limiter
from typing import Optional

from app.dependencies import SessionDep, get_agent_handle
from app.models.requests import ReplyRequest, UpdateMetadataRequest
from app.models.responses import (
    ThreadResponse,
    MessageResponse,
    PaginatedThreadsResponse,
    PaginatedMessagesResponse
)

router = APIRouter()
limiter = Limiter(key_func=get_agent_handle)

@router.get("/threads", response_model=PaginatedThreadsResponse)
@limiter.limit("500/minute")
async def list_threads(
    request: Request,
    session: SessionDep,
    archived: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """List threads ordered by last activity."""
    if limit > 100:
        limit = 100

    # Get threads with pagination
    all_threads = session.list_threads()

    # Filter by archived status if specified
    if archived is not None:
        archived_value = archived.lower() == "true"
        all_threads = [
            t for t in all_threads
            if t.metadata.get("archived", "false").lower() == str(archived_value).lower()
        ]

    # Apply pagination
    total = len(all_threads)
    threads = all_threads[offset:offset+limit]
    has_more = offset + limit < total

    return {
        "threads": [ThreadResponse.from_thread(t) for t in threads],
        "pagination": {
            "offset": offset,
            "limit": limit,
            "total": total,
            "has_more": has_more
        }
    }

@router.get("/threads/{thread_id}", response_model=ThreadResponse)
@limiter.limit("500/minute")
async def get_thread(
    request: Request,
    thread_id: str,
    session: SessionDep
):
    """Get thread details."""
    thread = session.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return ThreadResponse.from_thread(thread)

@router.get("/threads/{thread_id}/messages", response_model=PaginatedMessagesResponse)
@limiter.limit("500/minute")
async def list_thread_messages(
    request: Request,
    thread_id: str,
    session: SessionDep,
    limit: int = 100,
    offset: int = 0
):
    """List messages in thread."""
    if limit > 100:
        limit = 100

    # Get messages for thread
    all_messages = session.list_messages(thread_id=thread_id)

    # Apply pagination
    total = len(all_messages)
    messages = all_messages[offset:offset+limit]
    has_more = offset + limit < total

    return {
        "messages": [MessageResponse.from_message(m) for m in messages],
        "pagination": {
            "offset": offset,
            "limit": limit,
            "total": total,
            "has_more": has_more
        }
    }

@router.post(
    "/threads/{thread_id}/reply",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED
)
@limiter.limit("100/minute")
async def reply_to_thread(
    request: Request,
    thread_id: str,
    reply_request: ReplyRequest,
    session: SessionDep
):
    """Reply to thread's latest message."""
    # Get latest message in thread
    messages = session.list_messages(thread_id=thread_id)
    if not messages:
        raise HTTPException(status_code=404, detail="Thread has no messages")

    latest_message = messages[-1]  # Assuming list_messages returns in chronological order

    message = session.reply(
        message_id=latest_message.message_id,
        body=reply_request.body,
        tags=reply_request.tags
    )
    return MessageResponse.from_message(message)

@router.put("/threads/{thread_id}/metadata", response_model=dict)
@limiter.limit("100/minute")
async def update_thread_metadata(
    request: Request,
    thread_id: str,
    metadata_request: UpdateMetadataRequest,
    session: SessionDep
):
    """Update thread metadata."""
    session.update_thread_metadata(
        thread_id=thread_id,
        key=metadata_request.key,
        value=metadata_request.value
    )

    return {
        "thread_id": thread_id,
        "key": metadata_request.key,
        "value": metadata_request.value
    }

@router.get("/threads/{thread_id}/metadata", response_model=dict)
@limiter.limit("500/minute")
async def get_thread_metadata(
    request: Request,
    thread_id: str,
    session: SessionDep
):
    """Get all metadata for a thread."""
    thread = session.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    return {
        "thread_id": thread_id,
        "metadata": thread.metadata or {}
    }

@router.get("/threads/{thread_id}/metadata/{key}", response_model=dict)
@limiter.limit("500/minute")
async def get_thread_metadata_key(
    request: Request,
    thread_id: str,
    key: str,
    session: SessionDep
):
    """Get specific metadata value."""
    value = session.get_thread_metadata(thread_id=thread_id, key=key)
    if value is None:
        raise HTTPException(status_code=404, detail=f"Metadata key '{key}' not found")

    return {
        "key": key,
        "value": value
    }

@router.post("/threads/{thread_id}/archive", response_model=dict)
@limiter.limit("100/minute")
async def archive_thread(
    request: Request,
    thread_id: str,
    session: SessionDep
):
    """Archive a thread."""
    session.update_thread_metadata(
        thread_id=thread_id,
        key="archived",
        value="true"
    )

    return {
        "thread_id": thread_id,
        "archived": True
    }

@router.post("/threads/{thread_id}/unarchive", response_model=dict)
@limiter.limit("100/minute")
async def unarchive_thread(
    request: Request,
    thread_id: str,
    session: SessionDep
):
    """Unarchive a thread."""
    session.update_thread_metadata(
        thread_id=thread_id,
        key="archived",
        value="false"
    )

    return {
        "thread_id": thread_id,
        "archived": False
    }
