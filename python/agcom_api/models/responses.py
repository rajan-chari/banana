"""Pydantic response models for the API."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from agcom.models import (
    AgentIdentity,
    Message,
    Thread,
    AddressBookEntry,
    AuditEvent,
)


class AgentIdentityResponse(BaseModel):
    """Response model for agent identity."""
    handle: str
    display_name: Optional[str] = None


class MessageResponse(BaseModel):
    """Response model for messages."""
    message_id: str
    thread_id: str
    from_handle: str
    to_handles: list[str]
    subject: str
    body: str
    created_at: datetime
    in_reply_to: Optional[str] = None
    tags: Optional[list[str]] = None


class ThreadResponse(BaseModel):
    """Response model for threads."""
    thread_id: str
    subject: str
    participant_handles: list[str]
    created_at: datetime
    last_activity_at: datetime
    metadata: Optional[dict[str, str]] = None


class AddressBookEntryResponse(BaseModel):
    """Response model for address book entries."""
    handle: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    updated_by: str
    version: int


class AuditEventResponse(BaseModel):
    """Response model for audit events."""
    event_id: str
    event_type: str
    actor_handle: str
    target_handle: Optional[str] = None
    details: Optional[str] = None
    timestamp: datetime


# Conversion functions

def identity_to_response(identity: AgentIdentity) -> AgentIdentityResponse:
    """Convert AgentIdentity to response model."""
    return AgentIdentityResponse(
        handle=identity.handle,
        display_name=identity.display_name
    )


def message_to_response(message: Message) -> MessageResponse:
    """Convert Message to response model."""
    return MessageResponse(
        message_id=message.message_id,
        thread_id=message.thread_id,
        from_handle=message.from_handle,
        to_handles=message.to_handles,
        subject=message.subject,
        body=message.body,
        created_at=message.created_at,
        in_reply_to=message.in_reply_to,
        tags=message.tags
    )


def thread_to_response(thread: Thread) -> ThreadResponse:
    """Convert Thread to response model."""
    return ThreadResponse(
        thread_id=thread.thread_id,
        subject=thread.subject,
        participant_handles=thread.participant_handles,
        created_at=thread.created_at,
        last_activity_at=thread.last_activity_at,
        metadata=thread.metadata
    )


def address_book_entry_to_response(entry: AddressBookEntry) -> AddressBookEntryResponse:
    """Convert AddressBookEntry to response model."""
    return AddressBookEntryResponse(
        handle=entry.handle,
        display_name=entry.display_name,
        description=entry.description,
        tags=entry.tags,
        is_active=entry.is_active,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        updated_by=entry.updated_by,
        version=entry.version
    )


def audit_event_to_response(event: AuditEvent) -> AuditEventResponse:
    """Convert AuditEvent to response model."""
    return AuditEventResponse(
        event_id=event.event_id,
        event_type=event.event_type,
        actor_handle=event.actor_handle,
        target_handle=event.target_handle,
        details=event.details,
        timestamp=event.timestamp
    )
