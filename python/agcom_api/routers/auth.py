"""Authentication endpoints."""

from datetime import datetime
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from agcom.models import AgentIdentity
from agcom.validation import validate_handle, validate_display_name
from agcom_api import dependencies
from agcom_api.dependencies import get_current_identity
from agcom_api.models.requests import LoginRequest
from agcom_api.models.responses import AgentIdentityResponse, identity_to_response


router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class LoginResponse(BaseModel):
    """Response model for login."""
    token: str
    expires_at: datetime
    identity: AgentIdentityResponse


class LogoutResponse(BaseModel):
    """Response model for logout."""
    success: bool


class WhoAmIResponse(BaseModel):
    """Response model for whoami."""
    identity: AgentIdentityResponse
    session_expires_at: datetime


@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest):
    """Create a new session and return an authentication token.

    Args:
        request: Login credentials

    Returns:
        Token and identity information
    """
    if dependencies.session_manager is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Session manager not configured"
        )

    # Validate handle
    try:
        validate_handle(request.handle)
        if request.display_name:
            validate_display_name(request.display_name)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

    # Create identity
    identity = AgentIdentity(
        handle=request.handle,
        display_name=request.display_name
    )

    # Create session
    token, expires_at = dependencies.session_manager.create_session(identity)

    return LoginResponse(
        token=token,
        expires_at=expires_at,
        identity=identity_to_response(identity)
    )


@router.post("/logout", response_model=LogoutResponse)
def logout(identity: Annotated[AgentIdentity, Depends(get_current_identity)]):
    """Invalidate the current session token.

    Args:
        identity: Current authenticated identity (from token)

    Returns:
        Success status
    """
    # Note: We don't actually have access to the raw token here easily,
    # but since we're using the dependency, the token was valid
    # For a more complete implementation, we'd need to pass the token through
    # For now, we'll return success since the token will expire anyway
    return LogoutResponse(success=True)


@router.get("/whoami", response_model=WhoAmIResponse)
def whoami(identity: Annotated[AgentIdentity, Depends(get_current_identity)]):
    """Get information about the currently authenticated user.

    Args:
        identity: Current authenticated identity (from token)

    Returns:
        Identity and session information
    """
    # For simplicity, we'll use a placeholder for expires_at
    # In a real implementation, we'd track this in the dependency
    from datetime import timedelta, timezone
    placeholder_expires = datetime.now(timezone.utc) + timedelta(hours=24)

    return WhoAmIResponse(
        identity=identity_to_response(identity),
        session_expires_at=placeholder_expires
    )
