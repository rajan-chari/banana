"""Session management for the agcom library."""

from __future__ import annotations

from datetime import datetime, timezone

from .models import (
    AddressBookEntry,
    AgentIdentity,
    AuditEvent,
    Message,
    Thread,
)
from .storage import Storage
from .validation import (
    validate_body,
    validate_handle,
    validate_recipients,
    validate_subject,
    validate_tag,
)


class Session:
    """An authenticated agent's session providing all messaging operations."""

    def __init__(self, storage: Storage, identity: AgentIdentity, is_admin: bool = False):
        self.storage = storage
        self.identity = identity
        self.is_admin = is_admin

    @property
    def handle(self) -> str:
        return self.identity.handle

    # -- Messaging --

    def send_message(
        self,
        recipients: list[str],
        subject: str,
        body: str,
        tags: list[str] | None = None,
    ) -> Message:
        """Send a new message, creating a new thread."""
        recipients = validate_recipients(recipients)
        subject = validate_subject(subject)
        body = validate_body(body)
        validated_tags = [validate_tag(t) for t in (tags or [])]

        now = datetime.now(timezone.utc)

        # Create thread
        participants = sorted(set([self.handle] + recipients))
        thread = Thread(
            subject=subject,
            participants=participants,
            created_at=now,
            last_activity=now,
        )
        self.storage.save_thread(thread)

        # Create message
        msg = Message(
            thread_id=thread.id,
            sender=self.handle,
            recipients=recipients,
            subject=subject,
            body=body,
            tags=validated_tags,
            timestamp=now,
        )
        self.storage.save_message(msg)

        # Audit
        self._audit("message_sent", target=thread.id, details={
            "message_id": msg.id,
            "recipients": recipients,
            "subject": subject,
        })

        return msg

    def reply(self, message_id: str, body: str, tags: list[str] | None = None) -> Message:
        """Reply to a specific message."""
        original = self.get_message(message_id)
        if not original:
            raise ValueError(f"Message not found: {message_id}")

        body = validate_body(body)
        validated_tags = [validate_tag(t) for t in (tags or [])]

        # Determine recipients: reply to sender, or to original recipients if replying to own message
        if original.sender == self.handle:
            recipients = original.recipients
        else:
            recipients = [original.sender]

        thread = self.storage.get_thread(original.thread_id)
        if not thread:
            raise ValueError(f"Thread not found: {original.thread_id}")

        now = datetime.now(timezone.utc)

        # Expand participants
        new_participants = set(thread.participants) | {self.handle}
        thread.participants = sorted(new_participants)
        thread.last_activity = now
        self.storage.update_thread(thread)

        msg = Message(
            thread_id=thread.id,
            sender=self.handle,
            recipients=recipients,
            subject=thread.subject,
            body=body,
            tags=validated_tags,
            reply_to=message_id,
            timestamp=now,
        )
        self.storage.save_message(msg)

        self._audit("message_replied", target=thread.id, details={
            "message_id": msg.id,
            "reply_to": message_id,
            "recipients": recipients,
        })

        return msg

    def reply_to_thread(
        self, thread_id: str, body: str, tags: list[str] | None = None
    ) -> Message:
        """Reply to the latest message in a thread."""
        thread = self.get_thread(thread_id)
        if not thread:
            raise ValueError(f"Thread not found: {thread_id}")

        messages = self.storage.list_messages(thread_id=thread_id)
        if not messages:
            raise ValueError(f"No messages in thread: {thread_id}")

        latest = messages[-1]  # messages ordered ASC by timestamp
        return self.reply(latest.id, body, tags)

    def broadcast(
        self,
        recipients: list[str],
        subject: str,
        body: str,
        tags: list[str] | None = None,
    ) -> list[Message]:
        """Send separate 1-on-1 threads per recipient."""
        recipients = validate_recipients(recipients)
        subject = validate_subject(subject)
        body = validate_body(body)
        validated_tags = [validate_tag(t) for t in (tags or [])]

        messages = []
        for recipient in recipients:
            now = datetime.now(timezone.utc)
            participants = sorted([self.handle, recipient])
            thread = Thread(
                subject=subject,
                participants=participants,
                created_at=now,
                last_activity=now,
            )
            self.storage.save_thread(thread)

            msg = Message(
                thread_id=thread.id,
                sender=self.handle,
                recipients=[recipient],
                subject=subject,
                body=body,
                tags=validated_tags,
                timestamp=now,
            )
            self.storage.save_message(msg)

            self._audit("message_broadcast", target=thread.id, details={
                "message_id": msg.id,
                "recipient": recipient,
                "subject": subject,
            })

            messages.append(msg)

        return messages

    # -- Thread Operations --

    def list_threads(
        self, limit: int = 50, offset: int = 0, include_archived: bool = False
    ) -> list[Thread]:
        """List threads, filtered by participation unless admin."""
        if self.is_admin:
            return self.storage.list_threads(
                limit=limit, offset=offset, include_archived=include_archived
            )
        return self.storage.list_threads(
            participant=self.handle, limit=limit, offset=offset, include_archived=include_archived
        )

    def get_thread(self, thread_id: str) -> Thread | None:
        """Get a thread with visibility check."""
        thread = self.storage.get_thread(thread_id)
        if not thread:
            return None
        if not self.is_admin and self.handle not in thread.participants:
            return None
        return thread

    def get_thread_messages(self, thread_id: str) -> list[Message]:
        """Get all messages in a thread (with visibility check)."""
        thread = self.get_thread(thread_id)
        if not thread:
            raise ValueError(f"Thread not found or access denied: {thread_id}")
        return self.storage.list_messages(thread_id=thread_id)

    def get_message(self, message_id: str) -> Message | None:
        """Get a message with visibility check."""
        msg = self.storage.get_message(message_id)
        if not msg:
            return None
        if not self.is_admin:
            thread = self.storage.get_thread(msg.thread_id)
            if not thread or self.handle not in thread.participants:
                return None
        return msg

    def search_messages(
        self,
        query: str,
        sender: str | None = None,
        recipient: str | None = None,
        limit: int = 50,
    ) -> list[Message]:
        """Search messages with visibility filtering."""
        results = self.storage.search_messages(
            query=query, sender=sender, recipient=recipient, limit=limit
        )
        if self.is_admin:
            return results
        # Filter to only messages in threads the user participates in
        visible = []
        thread_cache: dict[str, bool] = {}
        for msg in results:
            if msg.thread_id not in thread_cache:
                thread = self.storage.get_thread(msg.thread_id)
                thread_cache[msg.thread_id] = (
                    thread is not None and self.handle in thread.participants
                )
            if thread_cache[msg.thread_id]:
                visible.append(msg)
        return visible

    # -- Thread Metadata --

    def set_thread_metadata(self, thread_id: str, key: str, value: str) -> None:
        thread = self.get_thread(thread_id)
        if not thread:
            raise ValueError(f"Thread not found or access denied: {thread_id}")
        self.storage.update_thread_metadata(thread_id, key, value)

    def get_thread_metadata(self, thread_id: str) -> dict:
        thread = self.get_thread(thread_id)
        if not thread:
            raise ValueError(f"Thread not found or access denied: {thread_id}")
        return thread.metadata

    def remove_thread_metadata(self, thread_id: str, key: str) -> None:
        thread = self.get_thread(thread_id)
        if not thread:
            raise ValueError(f"Thread not found or access denied: {thread_id}")
        self.storage.remove_thread_metadata(thread_id, key)

    def archive_thread(self, thread_id: str) -> None:
        thread = self.get_thread(thread_id)
        if not thread:
            raise ValueError(f"Thread not found or access denied: {thread_id}")
        self.storage.archive_thread(thread_id)
        self._audit("thread_archived", target=thread_id)

    def unarchive_thread(self, thread_id: str) -> None:
        thread = self.get_thread(thread_id)
        if not thread:
            raise ValueError(f"Thread not found or access denied: {thread_id}")
        self.storage.unarchive_thread(thread_id)
        self._audit("thread_unarchived", target=thread_id)

    # -- Address Book --

    def add_contact(
        self,
        handle: str,
        display_name: str = "",
        description: str = "",
        tags: list[str] | None = None,
    ) -> AddressBookEntry:
        handle = validate_handle(handle)
        validated_tags = [validate_tag(t) for t in (tags or [])]
        entry = AddressBookEntry(
            handle=handle,
            display_name=display_name,
            description=description,
            tags=validated_tags,
        )
        self.storage.save_contact(entry)
        self._audit("contact_added", target=handle, details={
            "display_name": display_name,
            "tags": validated_tags,
        })
        return entry

    def update_contact(self, handle: str, version: int, **fields) -> AddressBookEntry:
        entry = self.storage.update_contact(handle, version, **fields)
        self._audit("contact_updated", target=handle, details={"fields": list(fields.keys())})
        return entry

    def get_contact(self, handle: str) -> AddressBookEntry | None:
        return self.storage.get_contact(handle)

    def list_contacts(
        self,
        active_only: bool = True,
        search: str | None = None,
        tag: str | None = None,
    ) -> list[AddressBookEntry]:
        return self.storage.list_contacts(active_only=active_only, search=search, tag=tag)

    def deactivate_contact(self, handle: str, version: int) -> AddressBookEntry:
        entry = self.storage.deactivate_contact(handle, version)
        self._audit("contact_deactivated", target=handle)
        return entry

    # -- Audit --

    def list_audit_events(
        self,
        event_type: str | None = None,
        actor: str | None = None,
        target: str | None = None,
        limit: int = 50,
    ) -> list[AuditEvent]:
        return self.storage.list_audit_events(
            event_type=event_type, actor=actor, target=target, limit=limit
        )

    # -- Helpers --

    def _audit(self, event_type: str, target: str | None = None, details: dict | None = None):
        event = AuditEvent(
            event_type=event_type,
            actor=self.handle,
            target=target,
            details=details or {},
        )
        self.storage.save_audit_event(event)
