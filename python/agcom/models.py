"""Data models for the Agent Communication system."""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass(frozen=True)
class AgentIdentity:
    """Represents an agent's identity with handle and optional display name.

    Attributes:
        handle: Unique identifier (lowercase letters, numbers, hyphens, underscores only)
        display_name: Optional human-readable name for the agent
    """
    handle: str
    display_name: Optional[str] = None


@dataclass(frozen=True)
class Message:
    """Represents a message in a thread.

    Attributes:
        message_id: Unique ULID identifier for this message
        thread_id: ULID of the thread this message belongs to
        from_handle: Handle of the agent who sent this message
        to_handles: List of recipient handles
        subject: Message subject (max 200 chars)
        body: Message body (max 50,000 chars)
        created_at: UTC timestamp when message was created
        in_reply_to: Optional message_id this is replying to
        tags: Optional list of tags for categorization
    """
    message_id: str
    thread_id: str
    from_handle: str
    to_handles: list[str]
    subject: str
    body: str
    created_at: datetime
    in_reply_to: Optional[str] = None
    tags: Optional[list[str]] = None


@dataclass(frozen=True)
class Thread:
    """Represents a conversation thread containing messages.

    Attributes:
        thread_id: Unique ULID identifier for this thread
        subject: Thread subject (inherited from first message)
        participant_handles: Sorted list of all unique handles that have participated
        created_at: UTC timestamp when thread was created
        last_activity_at: UTC timestamp of most recent message in thread
        metadata: Optional dictionary of key-value metadata for extensibility
    """
    thread_id: str
    subject: str
    participant_handles: list[str]
    created_at: datetime
    last_activity_at: datetime
    metadata: Optional[dict[str, str]]


@dataclass(frozen=True)
class AddressBookEntry:
    """Represents an address book entry for an agent.

    Attributes:
        handle: Unique handle for this agent
        display_name: Optional human-readable name
        description: Optional description of the agent
        tags: Optional list of tags for categorization (e.g., skills, roles, teams)
        is_active: Whether this entry is currently active
        created_at: UTC timestamp when entry was created
        updated_at: UTC timestamp when entry was last updated
        updated_by: Handle of the agent who last updated this entry
        version: Version number for optimistic locking (increments on each update)
    """
    handle: str
    display_name: Optional[str]
    description: Optional[str]
    tags: Optional[list[str]]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    updated_by: str
    version: int


@dataclass(frozen=True)
class AuditEvent:
    """Represents an audit log entry.

    Attributes:
        event_id: Unique ULID identifier for this event
        event_type: Type of event (e.g., 'address_book_add', 'address_book_update')
        actor_handle: Handle of the agent who performed the action
        target_handle: Optional handle of the target agent (for address book operations)
        details: Optional JSON string with additional event details
        timestamp: UTC timestamp when event occurred
    """
    event_id: str
    event_type: str
    actor_handle: str
    target_handle: Optional[str]
    details: Optional[str]
    timestamp: datetime


@dataclass(frozen=True)
class ScreenOptions:
    """Options for rendering the current screen/inbox view.

    Attributes:
        max_threads: Maximum number of threads to display
        subject_width: Maximum width for subject column (characters)
        from_width: Maximum width for from column (characters)
    """
    max_threads: int = 20
    subject_width: int = 50
    from_width: int = 20
