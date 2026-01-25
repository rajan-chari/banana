# app/routers/auth.py
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from jose import jwt
from datetime import datetime, timedelta

from app.config import settings

router = APIRouter()

class TokenRequest(BaseModel):
    """Request to generate JWT token."""
    agent_handle: str = Field(..., min_length=2, max_length=64)
    agent_secret: str = Field(..., min_length=8)

class TokenResponse(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int

@router.post("/auth/token", response_model=TokenResponse)
async def generate_token(token_request: TokenRequest):
    """
    Generate JWT token for agent authentication.

    Note: In production, implement proper authentication (OAuth2, API keys,
    or integrate with existing identity provider). This endpoint is simplified
    for initial implementation.
    """
    # TODO: In production, validate agent_secret against a secure store
    # For now, we just accept any secret and generate a token
    # This is a security risk and should be replaced with proper authentication

    # Create token payload
    expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = datetime.utcnow() + expires_delta

    payload = {
        "agent_handle": token_request.agent_handle,
        "agent_display_name": token_request.agent_handle.title(),
        "exp": expire,
        "iat": datetime.utcnow()
    }

    # Generate token
    access_token = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
