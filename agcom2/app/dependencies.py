"""Dependency injection for FastAPI routes."""

from typing import Annotated, Generator
from fastapi import Depends, Header, HTTPException, Request
from jose import jwt, JWTError

from agcom import init, AgentIdentity, AgentCommsSession
from app.config import settings


def get_agent_handle(request: Request) -> str:
    """Extract agent handle for rate limiting (per-agent, not per-IP)."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header:
        return "anonymous"

    try:
        token = auth_header.replace("Bearer ", "")
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload.get("agent_handle", "unknown")
    except Exception:
        return "anonymous"


async def get_current_agent(
    authorization: str = Header(..., description="Bearer token")
) -> AgentIdentity:
    """Extract agent identity from JWT token."""
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

        handle = payload.get("agent_handle")
        display_name = payload.get("agent_display_name")

        if not handle:
            raise HTTPException(
                status_code=401,
                detail="Invalid token: missing agent_handle"
            )

        return AgentIdentity(handle=handle, display_name=display_name)

    except JWTError as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid authentication token: {str(e)}"
        )


def get_session(
    agent: Annotated[AgentIdentity, Depends(get_current_agent)]
) -> Generator[AgentCommsSession, None, None]:
    """Create AgCom session for authenticated agent."""
    session = init(settings.DB_PATH, agent)
    try:
        yield session
    finally:
        session.conn.close()


# Type alias for cleaner endpoint signatures
SessionDep = Annotated[AgentCommsSession, Depends(get_session)]
