"""
Async REST API client for agcom multi-agent communication.

Provides full access to all agcom functionality via HTTP REST API with:
- Auto-login on first request
- Bearer token authentication
- Retry logic with exponential backoff
- Graceful degradation if API unavailable
"""

import asyncio
import logging
from datetime import datetime
from typing import Any

import aiohttp
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from .config import AgcomSettings
from .models import Message, Thread, Contact, LoginInfo, AgentInfo, AuditEvent

logger = logging.getLogger(__name__)


# Custom exceptions


class AgcomError(Exception):
    """Base exception for agcom client errors."""

    pass


class AgcomAuthError(AgcomError):
    """Authentication or authorization error."""

    pass


class AgcomConnectionError(AgcomError):
    """Connection or network error."""

    pass


class AgcomNotFoundError(AgcomError):
    """Resource not found (404)."""

    pass


class AgcomValidationError(AgcomError):
    """Request validation error (400)."""

    pass


class AgcomConflictError(AgcomError):
    """Resource conflict error (409)."""

    pass


class AgcomClient:
    """
    Async REST API client for agcom communication system.

    Handles authentication, retries, and provides methods for all agcom operations.
    """

    def __init__(self, settings: AgcomSettings):
        """
        Initialize the agcom client.

        Args:
            settings: Configuration settings for the client
        """
        self.settings = settings
        self._session: aiohttp.ClientSession | None = None
        self._token: str | None = None
        self._authenticated = False
        self._available = True  # Track if API is available

    async def __aenter__(self):
        """Async context manager entry."""
        await self._ensure_session()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()

    async def _ensure_session(self):
        """Ensure aiohttp session is created."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()

    async def close(self):
        """Close the HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    async def _ensure_authenticated(self):
        """Ensure client is authenticated, performing auto-login if configured."""
        if not self.settings.enabled:
            raise AgcomError("agcom integration is disabled in settings")

        if not self._available:
            raise AgcomConnectionError("agcom API is not available")

        if self._authenticated:
            return

        if self.settings.auto_login:
            try:
                await self.login(self.settings.handle, self.settings.display_name)
            except Exception as e:
                logger.error(f"Auto-login failed: {e}")
                self._available = False
                raise AgcomConnectionError(f"Failed to connect to agcom API: {e}")
        else:
            raise AgcomAuthError("Not authenticated and auto_login is disabled")

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(aiohttp.ClientError),
    )
    async def _request(
        self,
        method: str,
        endpoint: str,
        auth_required: bool = True,
        **kwargs,
    ) -> Any:
        """
        Make an HTTP request with retry logic.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            auth_required: Whether authentication is required
            **kwargs: Additional arguments for aiohttp request

        Returns:
            Response JSON data

        Raises:
            AgcomAuthError: Authentication failed
            AgcomConnectionError: Connection failed
            AgcomNotFoundError: Resource not found
            AgcomValidationError: Request validation failed
            AgcomConflictError: Resource conflict
        """
        await self._ensure_session()

        if auth_required:
            await self._ensure_authenticated()

        # Build headers
        headers = kwargs.pop("headers", {})
        if auth_required and self._token:
            headers["Authorization"] = f"Bearer {self._token}"

        url = f"{self.settings.api_url}{endpoint}"

        try:
            async with self._session.request(method, url, headers=headers, **kwargs) as resp:
                # Handle different status codes
                if resp.status == 401:
                    self._authenticated = False
                    self._token = None
                    raise AgcomAuthError("Authentication failed or token expired")
                elif resp.status == 404:
                    data = await resp.json()
                    raise AgcomNotFoundError(data.get("message", "Resource not found"))
                elif resp.status == 400:
                    data = await resp.json()
                    raise AgcomValidationError(data.get("message", "Validation error"))
                elif resp.status == 409:
                    data = await resp.json()
                    raise AgcomConflictError(data.get("message", "Resource conflict"))
                elif resp.status >= 400:
                    raise AgcomError(f"HTTP {resp.status}: {await resp.text()}")

                return await resp.json()
        except aiohttp.ClientError as e:
            logger.warning(f"Request to {url} failed: {e}")
            raise AgcomConnectionError(f"Failed to connect to agcom API: {e}")

    # Authentication methods

    async def login(self, handle: str, display_name: str | None = None) -> LoginInfo:
        """
        Login and create a new session.

        Args:
            handle: Agent handle for authentication
            display_name: Optional display name

        Returns:
            Login information with token and identity

        Raises:
            AgcomAuthError: Login failed
        """
        data = {"handle": handle}
        if display_name:
            data["display_name"] = display_name

        response = await self._request(
            "POST", "/api/auth/login", auth_required=False, json=data
        )

        self._token = response["token"]
        self._authenticated = True

        return LoginInfo(
            token=response["token"],
            expires_at=datetime.fromisoformat(response["expires_at"].replace("Z", "+00:00")),
            identity=AgentInfo(
                handle=response["identity"]["handle"],
                display_name=response["identity"].get("display_name"),
            ),
        )

    async def logout(self) -> bool:
        """
        Logout and invalidate the current session.

        Returns:
            True if logout successful
        """
        try:
            response = await self._request("POST", "/api/auth/logout")
            self._authenticated = False
            self._token = None
            return response.get("success", True)
        except Exception:
            # Even if logout fails, clear local state
            self._authenticated = False
            self._token = None
            return True

    async def whoami(self) -> AgentInfo:
        """
        Get information about the currently authenticated user.

        Returns:
            Agent identity information

        Raises:
            AgcomAuthError: Not authenticated
        """
        response = await self._request("GET", "/api/auth/whoami")
        identity = response["identity"]
        return AgentInfo(
            handle=identity["handle"], display_name=identity.get("display_name")
        )

    # Message methods

    async def send_message(
        self,
        to_handles: list[str],
        subject: str,
        body: str,
        tags: list[str] | None = None,
    ) -> Message:
        """
        Send a new message, creating a new thread.

        Args:
            to_handles: List of recipient handles
            subject: Message subject
            body: Message body
            tags: Optional list of tags

        Returns:
            Created message

        Raises:
            AgcomValidationError: Invalid request data
        """
        data = {
            "to_handles": to_handles,
            "subject": subject,
            "body": body,
        }
        if tags:
            data["tags"] = tags

        response = await self._request("POST", "/api/messages/send", json=data)
        return self._parse_message(response)

    async def reply_to_message(
        self, message_id: str, body: str, tags: list[str] | None = None
    ) -> Message:
        """
        Reply to a specific message.

        Args:
            message_id: ID of message to reply to
            body: Reply body
            tags: Optional list of tags

        Returns:
            Created reply message

        Raises:
            AgcomNotFoundError: Message not found
        """
        data = {"body": body}
        if tags:
            data["tags"] = tags

        response = await self._request(
            "POST", f"/api/messages/{message_id}/reply", json=data
        )
        return self._parse_message(response)

    async def get_message(self, message_id: str) -> Message:
        """
        Get a specific message by ID.

        Args:
            message_id: Message identifier

        Returns:
            Message details

        Raises:
            AgcomNotFoundError: Message not found
        """
        response = await self._request("GET", f"/api/messages/{message_id}")
        return self._parse_message(response)

    async def list_messages(
        self,
        thread_id: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[Message]:
        """
        List messages, optionally filtered by thread.

        Args:
            thread_id: Optional thread ID filter
            limit: Maximum messages to return
            offset: Number of messages to skip

        Returns:
            List of messages
        """
        params = {"offset": offset}
        if thread_id:
            params["thread_id"] = thread_id
        if limit:
            params["limit"] = limit

        response = await self._request("GET", "/api/messages", params=params)
        return [self._parse_message(m) for m in response["messages"]]

    async def search_messages(
        self,
        query: str,
        in_subject: bool = True,
        in_body: bool = True,
        from_handle: str | None = None,
        to_handle: str | None = None,
        limit: int | None = None,
    ) -> list[Message]:
        """
        Search messages by text with optional filters.

        Args:
            query: Search query string
            in_subject: Search in subject field
            in_body: Search in body field
            from_handle: Filter by sender
            to_handle: Filter by recipient
            limit: Maximum results

        Returns:
            List of matching messages
        """
        params = {
            "q": query,
            "in_subject": str(in_subject).lower(),
            "in_body": str(in_body).lower(),
        }
        if from_handle:
            params["from_handle"] = from_handle
        if to_handle:
            params["to_handle"] = to_handle
        if limit:
            params["limit"] = limit

        response = await self._request("GET", "/api/messages/search", params=params)
        return [self._parse_message(m) for m in response["messages"]]

    # Thread methods

    async def list_threads(
        self, archived: bool = False, limit: int | None = None, offset: int = 0
    ) -> list[Thread]:
        """
        List threads.

        Args:
            archived: Include archived threads
            limit: Maximum threads to return
            offset: Number of threads to skip

        Returns:
            List of threads
        """
        params = {"archived": str(archived).lower(), "offset": offset}
        if limit:
            params["limit"] = limit

        response = await self._request("GET", "/api/threads", params=params)
        return [self._parse_thread(t) for t in response["threads"]]

    async def get_thread(self, thread_id: str) -> Thread:
        """
        Get a specific thread by ID.

        Args:
            thread_id: Thread identifier

        Returns:
            Thread details

        Raises:
            AgcomNotFoundError: Thread not found
        """
        response = await self._request("GET", f"/api/threads/{thread_id}")
        return self._parse_thread(response)

    async def get_thread_messages(
        self, thread_id: str, limit: int | None = None, offset: int = 0
    ) -> list[Message]:
        """
        Get all messages in a thread.

        Args:
            thread_id: Thread identifier
            limit: Maximum messages to return
            offset: Number of messages to skip

        Returns:
            List of messages in thread

        Raises:
            AgcomNotFoundError: Thread not found
        """
        params = {"offset": offset}
        if limit:
            params["limit"] = limit

        response = await self._request(
            "GET", f"/api/threads/{thread_id}/messages", params=params
        )
        return [self._parse_message(m) for m in response["messages"]]

    async def reply_to_thread(
        self, thread_id: str, body: str, tags: list[str] | None = None
    ) -> Message:
        """
        Reply to a thread (reply to latest message).

        Args:
            thread_id: Thread identifier
            body: Reply body
            tags: Optional list of tags

        Returns:
            Created reply message

        Raises:
            AgcomNotFoundError: Thread not found
        """
        data = {"body": body}
        if tags:
            data["tags"] = tags

        response = await self._request(
            "POST", f"/api/threads/{thread_id}/reply", json=data
        )
        return self._parse_message(response)

    async def set_thread_metadata(
        self, thread_id: str, key: str, value: str | None
    ) -> bool:
        """
        Set or remove thread metadata.

        Args:
            thread_id: Thread identifier
            key: Metadata key
            value: Metadata value (None to remove)

        Returns:
            True if successful

        Raises:
            AgcomNotFoundError: Thread not found
        """
        data = {"key": key, "value": value}
        response = await self._request(
            "PUT", f"/api/threads/{thread_id}/metadata", json=data
        )
        return response.get("success", False)

    async def get_thread_metadata(self, thread_id: str, key: str) -> str | None:
        """
        Get specific thread metadata value.

        Args:
            thread_id: Thread identifier
            key: Metadata key

        Returns:
            Metadata value or None if not found

        Raises:
            AgcomNotFoundError: Thread not found
        """
        try:
            response = await self._request(
                "GET", f"/api/threads/{thread_id}/metadata/{key}"
            )
            return response.get("value")
        except AgcomNotFoundError:
            return None

    async def archive_thread(self, thread_id: str) -> bool:
        """
        Archive a thread.

        Args:
            thread_id: Thread identifier

        Returns:
            True if successful

        Raises:
            AgcomNotFoundError: Thread not found
        """
        response = await self._request("POST", f"/api/threads/{thread_id}/archive")
        return response.get("success", False)

    async def unarchive_thread(self, thread_id: str) -> bool:
        """
        Unarchive a thread.

        Args:
            thread_id: Thread identifier

        Returns:
            True if successful

        Raises:
            AgcomNotFoundError: Thread not found
        """
        response = await self._request("POST", f"/api/threads/{thread_id}/unarchive")
        return response.get("success", False)

    # Contact methods

    async def add_contact(
        self,
        handle: str,
        display_name: str | None = None,
        description: str | None = None,
        tags: list[str] | None = None,
    ) -> Contact:
        """
        Add a new contact to the address book.

        Args:
            handle: Agent handle
            display_name: Optional display name
            description: Optional description
            tags: Optional list of tags

        Returns:
            Created contact

        Raises:
            AgcomConflictError: Contact already exists
        """
        data = {"handle": handle}
        if display_name:
            data["display_name"] = display_name
        if description:
            data["description"] = description
        if tags:
            data["tags"] = tags

        response = await self._request("POST", "/api/contacts", json=data)
        return self._parse_contact(response)

    async def list_contacts(
        self, active_only: bool = True, limit: int | None = None, offset: int = 0
    ) -> list[Contact]:
        """
        List contacts from the address book.

        Args:
            active_only: Only return active contacts
            limit: Maximum contacts to return
            offset: Number of contacts to skip

        Returns:
            List of contacts
        """
        params = {"active_only": str(active_only).lower(), "offset": offset}
        if limit:
            params["limit"] = limit

        response = await self._request("GET", "/api/contacts", params=params)
        return [self._parse_contact(c) for c in response["contacts"]]

    async def get_contact(self, handle: str) -> Contact:
        """
        Get a specific contact by handle.

        Args:
            handle: Contact handle

        Returns:
            Contact details

        Raises:
            AgcomNotFoundError: Contact not found
        """
        response = await self._request("GET", f"/api/contacts/{handle}")
        return self._parse_contact(response)

    async def update_contact(
        self,
        handle: str,
        display_name: str | None = None,
        description: str | None = None,
        tags: list[str] | None = None,
        is_active: bool | None = None,
        expected_version: int | None = None,
    ) -> Contact:
        """
        Update a contact in the address book.

        Args:
            handle: Contact handle
            display_name: New display name
            description: New description
            tags: New list of tags
            is_active: Whether entry is active
            expected_version: Expected version for optimistic locking

        Returns:
            Updated contact

        Raises:
            AgcomNotFoundError: Contact not found
            AgcomConflictError: Version conflict
        """
        data = {}
        if display_name is not None:
            data["display_name"] = display_name
        if description is not None:
            data["description"] = description
        if tags is not None:
            data["tags"] = tags
        if is_active is not None:
            data["is_active"] = is_active
        if expected_version is not None:
            data["expected_version"] = expected_version

        response = await self._request("PUT", f"/api/contacts/{handle}", json=data)
        return self._parse_contact(response)

    async def search_contacts(self, query: str, limit: int | None = None) -> list[Contact]:
        """
        Search contacts by text.

        Args:
            query: Search query string
            limit: Maximum results

        Returns:
            List of matching contacts
        """
        params = {"q": query}
        if limit:
            params["limit"] = limit

        response = await self._request("GET", "/api/contacts/search", params=params)
        return [self._parse_contact(c) for c in response["contacts"]]

    async def deactivate_contact(self, handle: str) -> bool:
        """
        Deactivate a contact (soft delete).

        Args:
            handle: Contact handle

        Returns:
            True if successful

        Raises:
            AgcomNotFoundError: Contact not found
        """
        response = await self._request("DELETE", f"/api/contacts/{handle}")
        return response.get("success", False)

    # Audit methods

    async def list_audit_events(
        self,
        event_type: str | None = None,
        actor_handle: str | None = None,
        target_handle: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[AuditEvent]:
        """
        List audit events with optional filters.

        Args:
            event_type: Filter by event type
            actor_handle: Filter by actor
            target_handle: Filter by target
            limit: Maximum events to return
            offset: Number of events to skip

        Returns:
            List of audit events
        """
        params = {"offset": offset}
        if event_type:
            params["event_type"] = event_type
        if actor_handle:
            params["actor_handle"] = actor_handle
        if target_handle:
            params["target_handle"] = target_handle
        if limit:
            params["limit"] = limit

        response = await self._request("GET", "/api/audit/events", params=params)
        return [self._parse_audit_event(e) for e in response["events"]]

    # Health check

    async def health_check(self) -> dict[str, Any]:
        """
        Check API health status.

        Returns:
            Health check response with status and version info
        """
        try:
            response = await self._request("GET", "/api/health", auth_required=False)
            self._available = True
            return response
        except Exception as e:
            logger.warning(f"Health check failed: {e}")
            self._available = False
            raise AgcomConnectionError(f"API health check failed: {e}")

    # Helper parsing methods

    def _parse_message(self, data: dict) -> Message:
        """Parse message from API response."""
        return Message(
            message_id=data["message_id"],
            thread_id=data["thread_id"],
            from_handle=data["from_handle"],
            to_handles=data["to_handles"],
            subject=data["subject"],
            body=data["body"],
            created_at=datetime.fromisoformat(data["created_at"].replace("Z", "+00:00")),
            in_reply_to=data.get("in_reply_to"),
            tags=data.get("tags"),
        )

    def _parse_thread(self, data: dict) -> Thread:
        """Parse thread from API response."""
        return Thread(
            thread_id=data["thread_id"],
            subject=data["subject"],
            participant_handles=data["participant_handles"],
            created_at=datetime.fromisoformat(data["created_at"].replace("Z", "+00:00")),
            last_activity_at=datetime.fromisoformat(
                data["last_activity_at"].replace("Z", "+00:00")
            ),
            metadata=data.get("metadata"),
        )

    def _parse_contact(self, data: dict) -> Contact:
        """Parse contact from API response."""
        return Contact(
            handle=data["handle"],
            display_name=data.get("display_name"),
            description=data.get("description"),
            tags=data.get("tags"),
            is_active=data["is_active"],
            created_at=datetime.fromisoformat(data["created_at"].replace("Z", "+00:00")),
            updated_at=datetime.fromisoformat(data["updated_at"].replace("Z", "+00:00")),
            updated_by=data["updated_by"],
            version=data["version"],
        )

    def _parse_audit_event(self, data: dict) -> AuditEvent:
        """Parse audit event from API response."""
        return AuditEvent(
            event_id=data["event_id"],
            event_type=data["event_type"],
            actor_handle=data["actor_handle"],
            target_handle=data.get("target_handle"),
            details=data.get("details"),
            timestamp=datetime.fromisoformat(data["timestamp"].replace("Z", "+00:00")),
        )
