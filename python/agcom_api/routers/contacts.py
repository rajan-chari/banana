"""Address book / contacts endpoints."""

from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel

from agcom.session import AgentCommsSession
from agcom_api.dependencies import get_session
from agcom_api.models.requests import AddContactRequest, UpdateContactRequest
from agcom_api.models.responses import AddressBookEntryResponse, address_book_entry_to_response


router = APIRouter(prefix="/api/contacts", tags=["Contacts"])


class ContactListResponse(BaseModel):
    """Response model for contact list."""
    contacts: list[AddressBookEntryResponse]


class SuccessResponse(BaseModel):
    """Generic success response."""
    success: bool


@router.post("", response_model=AddressBookEntryResponse, status_code=status.HTTP_201_CREATED)
def add_contact(
    request: AddContactRequest,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Add a new contact to the address book.

    Args:
        request: Contact details
        session: Authenticated session

    Returns:
        Created contact entry
    """
    try:
        entry = session.address_book_add(
            handle=request.handle,
            display_name=request.display_name,
            description=request.description,
            tags=request.tags
        )
        return address_book_entry_to_response(entry)
    except ValueError as e:
        error_msg = str(e)
        if "already exists" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "already_exists", "message": error_msg}
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "validation_error", "message": error_msg}
        )


@router.get("/search", response_model=ContactListResponse)
def search_contacts(
    session: Annotated[AgentCommsSession, Depends(get_session)],
    q: Optional[str] = Query(None, description="Search query"),
    tags: Optional[list[str]] = Query(None, description="Filter by tags"),
    active_only: bool = Query(True, description="Only search active contacts")
):
    """Search contacts by text or tags.

    Args:
        session: Authenticated session
        q: Search query string
        tags: Filter by tags
        active_only: Only search active contacts

    Returns:
        List of matching contacts
    """
    entries = session.address_book_search(
        query=q,
        tags=tags,
        active_only=active_only
    )
    return ContactListResponse(
        contacts=[address_book_entry_to_response(e) for e in entries]
    )


@router.get("", response_model=ContactListResponse)
def list_contacts(
    session: Annotated[AgentCommsSession, Depends(get_session)],
    active_only: bool = Query(True, description="Only return active contacts")
):
    """List all contacts in the address book.

    Args:
        session: Authenticated session
        active_only: Filter to only active contacts

    Returns:
        List of contacts
    """
    entries = session.address_book_list(active_only=active_only)
    return ContactListResponse(
        contacts=[address_book_entry_to_response(e) for e in entries]
    )


@router.get("/{handle}", response_model=AddressBookEntryResponse)
def get_contact(
    handle: str,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Get a specific contact by handle.

    Args:
        handle: Contact handle
        session: Authenticated session

    Returns:
        Contact details
    """
    entry = session.address_book_get(handle)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "resource": f"contact {handle}"}
        )
    return address_book_entry_to_response(entry)


@router.put("/{handle}", response_model=AddressBookEntryResponse)
def update_contact(
    handle: str,
    request: UpdateContactRequest,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Update a contact in the address book.

    Args:
        handle: Contact handle
        request: Updated contact details
        session: Authenticated session

    Returns:
        Updated contact entry
    """
    try:
        # Build kwargs dict with only provided fields
        kwargs = {"handle": handle}
        if request.display_name is not None:
            kwargs["display_name"] = request.display_name
        if request.description is not None:
            kwargs["description"] = request.description
        if request.tags is not None:
            kwargs["tags"] = request.tags
        if request.is_active is not None:
            kwargs["is_active"] = request.is_active
        if request.expected_version is not None:
            kwargs["expected_version"] = request.expected_version

        entry = session.address_book_update(**kwargs)
        return address_book_entry_to_response(entry)
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "not_found", "resource": f"contact {handle}"}
            )
        if "version conflict" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "version_conflict", "message": error_msg}
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "validation_error", "message": error_msg}
        )


@router.delete("/{handle}", response_model=SuccessResponse)
def deactivate_contact(
    handle: str,
    session: Annotated[AgentCommsSession, Depends(get_session)]
):
    """Deactivate a contact (soft delete).

    Args:
        handle: Contact handle
        session: Authenticated session

    Returns:
        Success status
    """
    try:
        session.address_book_update(handle=handle, is_active=False)
        return SuccessResponse(success=True)
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "not_found", "resource": f"contact {handle}"}
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "validation_error", "message": error_msg}
        )
