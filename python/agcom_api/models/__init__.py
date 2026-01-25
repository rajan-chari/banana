"""Request and response models for the API."""

from agcom_api.models.requests import (
    SendMessageRequest,
    ReplyRequest,
    AddContactRequest,
    UpdateContactRequest,
    SetMetadataRequest,
    LoginRequest,
)
from agcom_api.models.responses import (
    MessageResponse,
    ThreadResponse,
    AddressBookEntryResponse,
    AuditEventResponse,
    AgentIdentityResponse,
    message_to_response,
    thread_to_response,
    address_book_entry_to_response,
    audit_event_to_response,
    identity_to_response,
)

__all__ = [
    # Request models
    "SendMessageRequest",
    "ReplyRequest",
    "AddContactRequest",
    "UpdateContactRequest",
    "SetMetadataRequest",
    "LoginRequest",
    # Response models
    "MessageResponse",
    "ThreadResponse",
    "AddressBookEntryResponse",
    "AuditEventResponse",
    "AgentIdentityResponse",
    # Conversion functions
    "message_to_response",
    "thread_to_response",
    "address_book_entry_to_response",
    "audit_event_to_response",
    "identity_to_response",
]
