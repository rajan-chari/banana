# app/routers/contacts.py
import logging
from fastapi import APIRouter, Request, HTTPException, status
from slowapi import Limiter
from typing import Optional

from app.dependencies import SessionDep, get_agent_handle
from app.models.requests import CreateContactRequest, UpdateContactRequest
from app.models.responses import ContactResponse, PaginatedContactsResponse

router = APIRouter()
limiter = Limiter(key_func=get_agent_handle)
logger = logging.getLogger(__name__)

@router.get("/contacts", response_model=PaginatedContactsResponse)
@limiter.limit("500/minute")
async def list_contacts(
    request: Request,
    session: SessionDep,
    active_only: bool = True,
    tags: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """List contacts."""
    logger.info(f"Listing contacts: active_only={active_only}, tags={tags}, limit={limit}, offset={offset}")
    try:
        if limit > 100:
            limit = 100

        # Parse tags if provided (comma-separated)
        tag_list = None
        if tags:
            tag_list = [t.strip() for t in tags.split(",")]

        # Get contacts
        logger.debug(f"Calling session.address_book_list(active_only={active_only})")
        all_contacts = session.address_book_list(active_only=active_only)
        logger.debug(f"Got {len(all_contacts)} contacts")

        # Filter by tags if specified
        if tag_list:
            all_contacts = [
                c for c in all_contacts
                if c.tags and any(tag in c.tags for tag in tag_list)
            ]

        # Apply pagination
        total = len(all_contacts)
        contacts = all_contacts[offset:offset+limit]
        has_more = offset + limit < total

        logger.debug(f"Converting {len(contacts)} contacts to response")
        contact_responses = [ContactResponse.from_entry(c) for c in contacts]
        logger.info(f"Returning {len(contact_responses)} contacts")

        return {
            "contacts": contact_responses,
            "pagination": {
                "offset": offset,
                "limit": limit,
                "total": total,
                "has_more": has_more
            }
        }
    except Exception as e:
        logger.error(f"Error listing contacts: {e}", exc_info=True)
        raise

@router.post("/contacts", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("100/minute")
async def create_contact(
    request: Request,
    contact_request: CreateContactRequest,
    session: SessionDep
):
    """Create contact."""
    logger.info(f"Creating contact: {contact_request.handle}")
    try:
        logger.debug(f"Session: {session}")
        logger.debug(f"Contact data: handle={contact_request.handle}, display_name={contact_request.display_name}")

        entry = session.address_book_add(
            handle=contact_request.handle,
            display_name=contact_request.display_name,
            description=contact_request.description,
            tags=contact_request.tags
        )
        logger.info(f"Contact created successfully: {entry.handle}")

        response = ContactResponse.from_entry(entry)
        logger.debug(f"Response object created: {response}")
        return response
    except ValueError as e:
        logger.error(f"ValueError creating contact: {e}")
        if "already exists" in str(e).lower():
            raise HTTPException(status_code=409, detail=str(e))
        raise
    except Exception as e:
        logger.error(f"Unexpected error creating contact: {e}", exc_info=True)
        raise

@router.get("/contacts/{handle}", response_model=ContactResponse)
@limiter.limit("500/minute")
async def get_contact(
    request: Request,
    handle: str,
    session: SessionDep
):
    """Get specific contact."""
    entry = session.address_book_get(handle)
    if not entry:
        raise HTTPException(status_code=404, detail="Contact not found")
    return ContactResponse.from_entry(entry)

@router.put("/contacts/{handle}", response_model=ContactResponse)
@limiter.limit("100/minute")
async def update_contact(
    request: Request,
    handle: str,
    update_request: UpdateContactRequest,
    session: SessionDep
):
    """Update contact (with optimistic locking)."""
    try:
        entry = session.address_book_update(
            handle=handle,
            display_name=update_request.display_name,
            description=update_request.description,
            tags=update_request.tags,
            is_active=update_request.is_active,
            expected_version=update_request.expected_version
        )
        return ContactResponse.from_entry(entry)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise
    except RuntimeError as e:
        if "version conflict" in str(e).lower():
            raise HTTPException(status_code=409, detail=str(e))
        raise

@router.delete("/contacts/{handle}", response_model=dict)
@limiter.limit("100/minute")
async def delete_contact(
    request: Request,
    handle: str,
    session: SessionDep
):
    """Deactivate contact (soft delete)."""
    # Get contact to verify it exists
    entry = session.address_book_get(handle)
    if not entry:
        raise HTTPException(status_code=404, detail="Contact not found")

    # Deactivate by updating with is_active=False
    session.address_book_update(
        handle=handle,
        is_active=False,
        expected_version=entry.version
    )

    return {
        "handle": handle,
        "is_active": False
    }

@router.get("/contacts/search", response_model=PaginatedContactsResponse)
@limiter.limit("50/minute")
async def search_contacts(
    request: Request,
    session: SessionDep,
    query: Optional[str] = None,
    tags: Optional[str] = None,
    active_only: bool = True,
    limit: int = 50
):
    """Search contacts."""
    if limit > 100:
        limit = 100

    # Parse tags if provided (comma-separated)
    tag_list = None
    if tags:
        tag_list = [t.strip() for t in tags.split(",")]

    # Get all contacts first
    contacts = session.address_book_list(active_only=active_only)

    # Filter by tags if specified
    if tag_list:
        contacts = [
            c for c in contacts
            if c.tags and any(tag in c.tags for tag in tag_list)
        ]

    # Apply text search if query provided
    if query:
        query_lower = query.lower()
        contacts = [
            c for c in contacts
            if (query_lower in c.handle.lower() or
                (c.display_name and query_lower in c.display_name.lower()) or
                (c.description and query_lower in c.description.lower()))
        ]

    # Apply limit
    contacts = contacts[:limit]

    return {
        "contacts": [ContactResponse.from_entry(c) for c in contacts],
        "pagination": {
            "offset": 0,
            "limit": limit,
            "total": len(contacts),
            "has_more": False
        }
    }
