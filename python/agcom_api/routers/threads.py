"""Thread endpoints."""

from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel

from agcom.session import AgentCommsSession
from agcom_api.dependencies import get_session
from agcom_api.models.requests import ReplyRequest, SetMetadataRequest
from agcom_api.models.responses import (
    ThreadResponse,
    MessageResponse,
    thread_to_response,
    message_to_response
)


router = APIRouter(prefix="/api/threads", tags=["Threads"])


class ThreadListResponse(BaseModel):
    """Response model for thread list."""
    threads: list[ThreadResponse]
    total: Optional[int] = None


class ThreadMessagesResponse(BaseModel):
    """Response model for thread with messages."""
    thread: ThreadResponse
    messages: list[MessageResponse]


class SuccessResponse(BaseModel):
    """Generic success response."""
    success: bool


class MetadataResponse(BaseModel):
    """Response model for metadata value."""
    key: str
    value: Optional[str]


@router.get("", response_model=ThreadListResponse)
def list_threads(
    session: Annotated[AgentCommsSession, Depends(get_session)],
    limit: Optional[int] = Query(None, description="Maximum number of threads"),
    offset: int = Query(0, description="Number of threads to skip")
):
    """List threads ordered by last activity.

    Args:
        session: Authenticated session
        limit: Maximum threads to return
        offset: Number of threads to skip

    Returns:
        List of threads
    """
    threads = session.list_threads(limit=limit, offset=offset)
    return ThreadListResponse(
        threads=[thread_to_response(t) for t in threads],
        total=len(threads) if limit is None else None
    )


@router.get("/{thread_id}", response_model=ThreadResponse)
def get_thread(
    thread_id: str,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Get thread details by ID.

    Args:
        thread_id: Thread identifier
        session: Authenticated session

    Returns:
        Thread details
    """
    thread = session.get_thread(thread_id)
    if thread is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "resource": f"thread {thread_id}"}
        )
    return thread_to_response(thread)


@router.get("/{thread_id}/messages", response_model=ThreadMessagesResponse)
def get_thread_messages(
    thread_id: str,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Get all messages in a thread.

    Args:
        thread_id: Thread identifier
        session: Authenticated session

    Returns:
        Thread with all messages
    """
    thread = session.get_thread(thread_id)
    if thread is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "resource": f"thread {thread_id}"}
        )

    messages = session.list_messages(thread_id=thread_id)

    return ThreadMessagesResponse(
        thread=thread_to_response(thread),
        messages=[message_to_response(m) for m in messages]
    )


@router.post("/{thread_id}/reply", response_model=MessageResponse)
def reply_to_thread(
    thread_id: str,
    request: ReplyRequest,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Reply to the latest message in a thread.

    Args:
        thread_id: Thread identifier
        request: Reply details
        session: Authenticated session

    Returns:
        Created reply message
    """
    try:
        message = session.reply_thread(
            thread_id=thread_id,
            body=request.body,
            tags=request.tags
        )
        return message_to_response(message)
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower() or "no messages" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "not_found", "resource": f"thread {thread_id}"}
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "validation_error", "message": error_msg}
        )


@router.put("/{thread_id}/metadata", response_model=SuccessResponse)
def set_thread_metadata(
    thread_id: str,
    request: SetMetadataRequest,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Set a metadata key for a thread.

    Args:
        thread_id: Thread identifier
        request: Metadata key and value
        session: Authenticated session

    Returns:
        Success status
    """
    try:
        session.update_thread_metadata(
            thread_id=thread_id,
            key=request.key,
            value=request.value
        )
        return SuccessResponse(success=True)
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "not_found", "resource": f"thread {thread_id}"}
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "validation_error", "message": error_msg}
        )


@router.get("/{thread_id}/metadata/{key}", response_model=MetadataResponse)
def get_thread_metadata(
    thread_id: str,
    key: str,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Get a metadata value for a thread.

    Args:
        thread_id: Thread identifier
        key: Metadata key
        session: Authenticated session

    Returns:
        Metadata value
    """
    try:
        value = session.get_thread_metadata(thread_id=thread_id, key=key)
        return MetadataResponse(key=key, value=value)
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "not_found", "resource": f"thread {thread_id}"}
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "validation_error", "message": error_msg}
        )


@router.post("/{thread_id}/archive", response_model=SuccessResponse)
def archive_thread(
    thread_id: str,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Mark a thread as archived.

    Args:
        thread_id: Thread identifier
        session: Authenticated session

    Returns:
        Success status
    """
    try:
        session.archive_thread(thread_id)
        return SuccessResponse(success=True)
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "not_found", "resource": f"thread {thread_id}"}
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "validation_error", "message": error_msg}
        )


@router.post("/{thread_id}/unarchive", response_model=SuccessResponse)
def unarchive_thread(
    thread_id: str,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Remove archived status from a thread.

    Args:
        thread_id: Thread identifier
        session: Authenticated session

    Returns:
        Success status
    """
    try:
        session.unarchive_thread(thread_id)
        return SuccessResponse(success=True)
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "not_found", "resource": f"thread {thread_id}"}
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "validation_error", "message": error_msg}
        )
