"""Agent Communication System - A Python library for multi-agent messaging."""

from agcom.models import (
    AgentIdentity,
    Message,
    Thread,
    AddressBookEntry,
    AuditEvent,
    ScreenOptions,
)
from agcom.session import init, AgentCommsSession
from agcom.ulid_gen import generate_ulid
from agcom.validation import (
    validate_handle,
    validate_subject,
    validate_body,
    validate_tags,
    validate_description,
    validate_display_name,
)

__version__ = "0.1.0"

__all__ = [
    # Core API
    "init",
    "AgentCommsSession",
    # Models
    "AgentIdentity",
    "Message",
    "Thread",
    "AddressBookEntry",
    "AuditEvent",
    "ScreenOptions",
    # Utilities
    "generate_ulid",
    # Validation
    "validate_handle",
    "validate_subject",
    "validate_body",
    "validate_tags",
    "validate_description",
    "validate_display_name",
]
