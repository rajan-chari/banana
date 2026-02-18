"""FastAPI dependencies for agcom-api."""

from __future__ import annotations

import os
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request

from .auth import SessionInfo, SessionManager


def get_session_manager(request: Request) -> SessionManager:
    """Get the session manager from app state."""
    return request.app.state.session_manager


def get_storage(request: Request):
    """Get the agcom storage instance from app state."""
    return request.app.state.storage


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    session_manager: SessionManager = Depends(get_session_manager),
) -> SessionInfo:
    """Extract and validate the bearer token from the Authorization header."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    # Support "Bearer <token>" or just "<token>"
    parts = authorization.split(" ", 1)
    token = parts[1] if len(parts) == 2 and parts[0].lower() == "bearer" else parts[0]

    session = session_manager.validate(token)
    if session is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return session


async def require_admin(
    user: SessionInfo = Depends(get_current_user),
) -> SessionInfo:
    """Require that the current user has admin privileges."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
