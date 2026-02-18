"""Contacts router: CRUD operations on the address book."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..dependencies import get_current_user
from ..models import ContactCreateRequest, ContactResponse, ContactUpdateRequest
from .messages import _get_agcom_session

router = APIRouter(prefix="/contacts", tags=["contacts"])


def _contact_to_response(entry) -> ContactResponse:
    """Convert an agcom AddressBookEntry to a ContactResponse."""
    return ContactResponse(
        handle=entry.handle,
        display_name=entry.display_name or None,
        description=entry.description or None,
        tags=entry.tags or [],
        active=entry.active,
        version=entry.version,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


@router.post("", response_model=ContactResponse, status_code=201)
async def create_contact(body: ContactCreateRequest, request: Request, user=Depends(get_current_user)):
    """Add a new contact to the address book."""
    session = _get_agcom_session(request, user)
    try:
        entry = session.add_contact(
            handle=body.handle,
            display_name=body.display_name or "",
            description=body.description or "",
            tags=body.tags,
        )
    except Exception as e:
        if "UNIQUE" in str(e).upper() or "already exists" in str(e).lower():
            raise HTTPException(status_code=409, detail=f"Contact already exists: {body.handle}")
        raise HTTPException(status_code=400, detail=str(e))
    return _contact_to_response(entry)


@router.get("", response_model=list[ContactResponse])
async def list_contacts(
    request: Request,
    user=Depends(get_current_user),
    active_only: bool = Query(True),
    search: str | None = Query(None),
    tag: str | None = Query(None),
):
    """List contacts with optional filtering."""
    session = _get_agcom_session(request, user)
    contacts = session.list_contacts(active_only=active_only, search=search, tag=tag)
    return [_contact_to_response(c) for c in contacts]


@router.get("/{handle}", response_model=ContactResponse)
async def get_contact(handle: str, request: Request, user=Depends(get_current_user)):
    """Get a contact by handle."""
    session = _get_agcom_session(request, user)
    contact = session.get_contact(handle)
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    return _contact_to_response(contact)


@router.put("/{handle}", response_model=ContactResponse)
async def update_contact(
    handle: str, body: ContactUpdateRequest, request: Request, user=Depends(get_current_user)
):
    """Update a contact with optimistic locking (version must match)."""
    session = _get_agcom_session(request, user)

    # Build kwargs for the fields to update
    fields = {}
    if body.display_name is not None:
        fields["display_name"] = body.display_name
    if body.description is not None:
        fields["description"] = body.description
    if body.tags is not None:
        fields["tags"] = body.tags

    try:
        updated = session.update_contact(handle=handle, version=body.version, **fields)
    except ValueError as e:
        error_msg = str(e)
        if "version" in error_msg.lower() or "conflict" in error_msg.lower():
            raise HTTPException(status_code=409, detail=error_msg)
        if "not found" in error_msg.lower():
            raise HTTPException(status_code=404, detail=error_msg)
        raise HTTPException(status_code=400, detail=error_msg)
    return _contact_to_response(updated)


@router.delete("/{handle}")
async def deactivate_contact(
    handle: str,
    request: Request,
    user=Depends(get_current_user),
    version: int = Query(..., ge=1),
):
    """Deactivate (soft-delete) a contact. Requires version for optimistic locking."""
    session = _get_agcom_session(request, user)
    try:
        session.deactivate_contact(handle, version)
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(status_code=404, detail=error_msg)
        if "version" in error_msg.lower() or "conflict" in error_msg.lower():
            raise HTTPException(status_code=409, detail=error_msg)
        raise HTTPException(status_code=400, detail=error_msg)
    return {"status": "ok"}
