"""Authentication router: login, logout, identity."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..auth import SessionManager
from ..dependencies import get_current_user, get_session_manager
from ..models import IdentityResponse, LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    request: Request,
    session_manager: SessionManager = Depends(get_session_manager),
):
    """Login with a handle and optional display name. Returns a bearer token."""
    storage = request.app.state.storage
    if storage is not None:
        # Auto-register in address book if not already present
        try:
            from agcom.models import AddressBookEntry

            existing = storage.get_contact(body.handle)
            if existing is None:
                storage.save_contact(AddressBookEntry(
                    handle=body.handle,
                    display_name=body.display_name or "",
                ))
        except Exception:
            pass  # Non-critical, don't block login

    session = session_manager.login(body.handle, body.display_name)

    # Check if user is admin (has "admin" tag in address book)
    if storage is not None:
        try:
            contact = storage.get_contact(body.handle)
            if contact and "admin" in (contact.tags or []):
                session_manager.set_admin(session.token, True)
                session.is_admin = True
        except Exception:
            pass

    return LoginResponse(
        token=session.token,
        expires_at=session.expires_at,
        handle=session.handle,
        display_name=session.display_name,
    )


@router.post("/logout")
async def logout(
    request: Request,
    session_manager: SessionManager = Depends(get_session_manager),
):
    """Logout and invalidate the current session."""
    auth = request.headers.get("authorization", "")
    parts = auth.split(" ", 1)
    token = parts[1] if len(parts) == 2 and parts[0].lower() == "bearer" else parts[0]

    if not token:
        raise HTTPException(status_code=401, detail="Authorization header required")

    session_manager.logout(token)
    return {"status": "ok"}


@router.get("/me", response_model=IdentityResponse)
async def get_identity(user=Depends(get_current_user)):
    """Get the current user's identity and session info."""
    return IdentityResponse(
        handle=user.handle,
        display_name=user.display_name,
        is_admin=user.is_admin,
    )
