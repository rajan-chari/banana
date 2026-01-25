"""Response models for API endpoints."""

from pydantic import BaseModel
from typing import Optional, Any

from agcom import Message, Thread, AddressBookEntry, AuditEvent
from app.utils.converters import (
    message_to_dict,
    thread_to_dict,
    contact_to_dict,
    audit_event_to_dict
)


class MessageResponse(BaseModel):
    """Response containing a single message."""
    message_id: str
    thread_id: str
    from_handle: str
    to_handles: list[str]
    subject: str
    body: str
    created_at: str  # ISO 8601
    in_reply_to: Optional[str]
    tags: Optional[list[str]]

    @classmethod
    def from_message(cls, message: Message) -> "MessageResponse":
        """Create response from agcom Message object."""
        return cls(**message_to_dict(message))


class ThreadResponse(BaseModel):
    """Response containing a single thread."""
    thread_id: str
    subject: str
    participant_handles: list[str]
    created_at: str  # ISO 8601
    last_activity_at: str  # ISO 8601
    metadata: Optional[dict[str, str]]

    @classmethod
    def from_thread(cls, thread: Thread) -> "ThreadResponse":
        """Create response from agcom Thread object."""
        return cls(**thread_to_dict(thread))


class ContactResponse(BaseModel):
    """Response containing an address book contact."""
    handle: str
    display_name: Optional[str]
    description: Optional[str]
    tags: Optional[list[str]]
    is_active: bool
    created_at: str  # ISO 8601
    updated_at: str  # ISO 8601
    updated_by: str
    version: int

    @classmethod
    def from_entry(cls, entry: AddressBookEntry) -> "ContactResponse":
        """Create response from agcom AddressBookEntry object."""
        return cls(**contact_to_dict(entry))


class AuditEventResponse(BaseModel):
    """Response containing an audit event."""
    event_id: str
    event_type: str
    actor_handle: str
    target_handle: Optional[str]
    details: Optional[dict]
    timestamp: str  # ISO 8601

    @classmethod
    def from_event(cls, event: AuditEvent) -> "AuditEventResponse":
        """Create response from agcom AuditEvent object."""
        return cls(**audit_event_to_dict(event))


class PaginationInfo(BaseModel):
    """Pagination information."""
    offset: int
    limit: int
    total: int
    has_more: bool


class PaginatedMessagesResponse(BaseModel):
    """Paginated list of messages."""
    messages: list[MessageResponse]
    pagination: PaginationInfo


class PaginatedThreadsResponse(BaseModel):
    """Paginated list of threads."""
    threads: list[ThreadResponse]
    pagination: PaginationInfo


class PaginatedContactsResponse(BaseModel):
    """Paginated list of contacts."""
    contacts: list[ContactResponse]
    pagination: PaginationInfo


class PaginatedAuditEventsResponse(BaseModel):
    """Paginated list of audit events."""
    events: list[AuditEventResponse]
    pagination: PaginationInfo


class BroadcastResponse(BaseModel):
    """Response from broadcasting a message."""
    messages: list[MessageResponse]
    count: int


class MetadataResponse(BaseModel):
    """Response containing thread metadata."""
    thread_id: str
    metadata: dict[str, str]


class MetadataKeyResponse(BaseModel):
    """Response containing a single metadata key-value pair."""
    key: str
    value: str


class ArchiveResponse(BaseModel):
    """Response from archiving/unarchiving a thread."""
    thread_id: str
    archived: bool


class ContactDeactivateResponse(BaseModel):
    """Response from deactivating a contact."""
    handle: str
    is_active: bool


class HealthResponse(BaseModel):
    """Basic health check response."""
    status: str
    timestamp: str
    version: str = "1.0.0"


class ReadinessResponse(BaseModel):
    """Readiness check response."""
    status: str
    database: dict[str, Any]
    timestamp: str


class TokenResponse(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
