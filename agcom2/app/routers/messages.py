# app/routers/messages.py
from fastapi import APIRouter, Request, HTTPException, status
from slowapi import Limiter
from typing import Optional

from app.dependencies import SessionDep, get_agent_handle
from app.models.requests import SendMessageRequest, ReplyRequest, BroadcastRequest
from app.models.responses import MessageResponse, PaginatedMessagesResponse

router = APIRouter()
limiter = Limiter(key_func=get_agent_handle)

@router.post("/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("100/minute")
async def send_message(
    request: Request,
    message_request: SendMessageRequest,
    session: SessionDep
):
    """Send a new message (creates new thread)."""
    message = session.send(
        to_handles=message_request.to_handles,
        subject=message_request.subject,
        body=message_request.body,
        tags=message_request.tags
    )
    return MessageResponse.from_message(message)

@router.post(
    "/messages/broadcast",
    response_model=dict,
    status_code=status.HTTP_201_CREATED
)
@limiter.limit("50/minute")  # Lower limit for expensive operation
async def broadcast_message(
    request: Request,
    broadcast_request: BroadcastRequest,
    session: SessionDep
):
    """Send same message to multiple recipients (N threads)."""
    messages = session.send_broadcast(
        to_handles=broadcast_request.to_handles,
        subject=broadcast_request.subject,
        body=broadcast_request.body,
        tags=broadcast_request.tags
    )
    return {
        "messages": [MessageResponse.from_message(m) for m in messages],
        "count": len(messages)
    }

# IMPORTANT: More specific routes must come before parameterized routes
@router.get("/messages/search", response_model=dict)
@limiter.limit("50/minute")
async def search_messages(
    request: Request,
    session: SessionDep,
    query: str,
    in_subject: bool = True,
    in_body: bool = True,
    from_handle: Optional[str] = None,
    to_handle: Optional[str] = None,
    limit: int = 50
):
    """Search messages with advanced filters."""
    if limit > 100:
        limit = 100

    messages = session.search_messages(
        query=query,
        in_subject=in_subject,
        in_body=in_body,
        from_handle=from_handle,
        to_handle=to_handle,
        limit=limit
    )

    return {
        "messages": [MessageResponse.from_message(m) for m in messages],
        "query": query,
        "count": len(messages)
    }

@router.get("/messages", response_model=PaginatedMessagesResponse)
@limiter.limit("500/minute")
async def list_messages(
    request: Request,
    session: SessionDep,
    thread_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """List messages with optional filters."""
    if limit > 100:
        limit = 100

    # Use database-level pagination (efficient)
    messages = session.list_messages(thread_id=thread_id, limit=limit+1, offset=offset)

    # Check if there are more results
    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]

    # Get total count (expensive - consider caching or removing)
    all_messages = session.list_messages(thread_id=thread_id)
    total = len(all_messages)

    return {
        "messages": [MessageResponse.from_message(m) for m in messages],
        "pagination": {
            "offset": offset,
            "limit": limit,
            "total": total,
            "has_more": has_more
        }
    }

@router.get("/messages/{message_id}", response_model=MessageResponse)
@limiter.limit("500/minute")
async def get_message(
    request: Request,
    message_id: str,
    session: SessionDep
):
    """Get specific message."""
    message = session.get_message(message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    return MessageResponse.from_message(message)

@router.post(
    "/messages/{message_id}/reply",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED
)
@limiter.limit("100/minute")
async def reply_to_message(
    request: Request,
    message_id: str,
    reply_request: ReplyRequest,
    session: SessionDep
):
    """Reply to a specific message."""
    message = session.reply(
        message_id=message_id,
        body=reply_request.body,
        tags=reply_request.tags
    )
    return MessageResponse.from_message(message)
