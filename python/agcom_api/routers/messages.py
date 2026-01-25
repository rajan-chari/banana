"""Message endpoints."""

from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel

from agcom.session import AgentCommsSession
from agcom_api.dependencies import get_session
from agcom_api.models.requests import SendMessageRequest, ReplyRequest
from agcom_api.models.responses import MessageResponse, message_to_response


router = APIRouter(prefix="/api/messages", tags=["Messages"])


class MessageListResponse(BaseModel):
    """Response model for message list."""
    messages: list[MessageResponse]
    total: Optional[int] = None


@router.post("/send", response_model=MessageResponse)
def send_message(
    request: SendMessageRequest,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Send a new message, creating a new thread.

    Args:
        request: Message details
        session: Authenticated session

    Returns:
        Created message
    """
    try:
        message = session.send(
            to_handles=request.to_handles,
            subject=request.subject,
            body=request.body,
            tags=request.tags
        )
        return message_to_response(message)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "validation_error", "message": str(e)}
        )


@router.post("/{message_id}/reply", response_model=MessageResponse)
def reply_to_message(
    message_id: str,
    request: ReplyRequest,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Reply to a specific message.

    Args:
        message_id: ID of message to reply to
        request: Reply details
        session: Authenticated session

    Returns:
        Created reply message
    """
    try:
        message = session.reply(
            message_id=message_id,
            body=request.body,
            tags=request.tags
        )
        return message_to_response(message)
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "not_found", "resource": f"message {message_id}"}
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "validation_error", "message": error_msg}
        )


@router.get("/search", response_model=MessageListResponse)
def search_messages(
    session: Annotated[AgentCommsSession, Depends(get_session)],
    q: str = Query(..., description="Search query"),
    in_subject: bool = Query(True, description="Search in subject"),
    in_body: bool = Query(True, description="Search in body"),
    from_handle: Optional[str] = Query(None, description="Filter by sender"),
    to_handle: Optional[str] = Query(None, description="Filter by recipient"),
    limit: Optional[int] = Query(None, description="Maximum number of results")
):
    """Search messages by text with optional filters.

    Args:
        session: Authenticated session
        q: Search query string
        in_subject: Search in subject field
        in_body: Search in body field
        from_handle: Filter by sender
        to_handle: Filter by recipient
        limit: Maximum results

    Returns:
        List of matching messages
    """
    messages = session.search_messages(
        query=q,
        in_subject=in_subject,
        in_body=in_body,
        from_handle=from_handle,
        to_handle=to_handle,
        limit=limit
    )
    return MessageListResponse(
        messages=[message_to_response(m) for m in messages],
        total=len(messages)
    )


@router.get("", response_model=MessageListResponse)
def list_messages(
    session: Annotated[AgentCommsSession, Depends(get_session)],
    thread_id: Optional[str] = Query(None, description="Filter by thread ID"),
    limit: Optional[int] = Query(None, description="Maximum number of messages"),
    offset: int = Query(0, description="Number of messages to skip")
):
    """List messages, optionally filtered by thread.

    Args:
        session: Authenticated session
        thread_id: Optional thread ID filter
        limit: Maximum messages to return
        offset: Number of messages to skip

    Returns:
        List of messages
    """
    messages = session.list_messages(thread_id=thread_id, limit=limit, offset=offset)
    return MessageListResponse(
        messages=[message_to_response(m) for m in messages],
        total=len(messages) if limit is None else None
    )


@router.get("/{message_id}", response_model=MessageResponse)
def get_message(
    message_id: str,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Get a specific message by ID.

    Args:
        message_id: Message identifier
        session: Authenticated session

    Returns:
        Message details
    """
    message = session.get_message(message_id)
    if message is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "resource": f"message {message_id}"}
        )
    return message_to_response(message)
