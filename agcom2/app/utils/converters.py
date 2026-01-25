"""Utility functions for converting agcom objects to API responses."""

from datetime import datetime
from typing import Any, Optional
import json

from agcom import Message, Thread, AddressBookEntry, AuditEvent


def datetime_to_iso(dt: datetime) -> str:
    """Convert datetime to ISO 8601 string with Z suffix for UTC."""
    if dt.tzinfo is None:
        return dt.isoformat() + "Z"
    return dt.isoformat()


def message_to_dict(message: Message) -> dict[str, Any]:
    """Convert agcom Message to dict with ISO datetime."""
    return {
        "message_id": message.message_id,
        "thread_id": message.thread_id,
        "from_handle": message.from_handle,
        "to_handles": message.to_handles,
        "subject": message.subject,
        "body": message.body,
        "created_at": datetime_to_iso(message.created_at),
        "in_reply_to": message.in_reply_to,
        "tags": message.tags
    }


def thread_to_dict(thread: Thread) -> dict[str, Any]:
    """Convert agcom Thread to dict with ISO datetimes."""
    return {
        "thread_id": thread.thread_id,
        "subject": thread.subject,
        "participant_handles": thread.participant_handles,
        "created_at": datetime_to_iso(thread.created_at),
        "last_activity_at": datetime_to_iso(thread.last_activity_at),
        "metadata": thread.metadata
    }


def contact_to_dict(entry: AddressBookEntry) -> dict[str, Any]:
    """Convert agcom AddressBookEntry to dict with ISO datetimes."""
    return {
        "handle": entry.handle,
        "display_name": entry.display_name,
        "description": entry.description,
        "tags": entry.tags,
        "is_active": entry.is_active,
        "created_at": datetime_to_iso(entry.created_at),
        "updated_at": datetime_to_iso(entry.updated_at),
        "updated_by": entry.updated_by,
        "version": entry.version
    }


def audit_event_to_dict(event: AuditEvent) -> dict[str, Any]:
    """Convert agcom AuditEvent to dict with ISO datetime."""
    details = None
    if event.details:
        try:
            details = json.loads(event.details)
        except json.JSONDecodeError:
            details = {"raw": event.details}
    
    return {
        "event_id": event.event_id,
        "event_type": event.event_type,
        "actor_handle": event.actor_handle,
        "target_handle": event.target_handle,
        "details": details,
        "timestamp": datetime_to_iso(event.timestamp)
    }
