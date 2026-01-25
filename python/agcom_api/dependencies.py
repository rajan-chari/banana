"""FastAPI dependencies for database connections and authentication."""

import sqlite3
from typing import Annotated
from fastapi import Depends, HTTPException, status, Header

from agcom.models import AgentIdentity
from agcom.session import AgentCommsSession
from agcom.storage import init_database


# Global session manager (will be set by main.py)
session_manager = None

# Global database path (will be set by main.py)
db_path = None


def get_db_connection():
    """FastAPI dependency for database connections.

    Yields:
        Database connection
    """
    if db_path is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database not configured"
        )

    conn = init_database(db_path)
    try:
        yield conn
    finally:
        conn.close()


def get_current_identity(
    authorization: Annotated[str | None, Header()] = None
) -> AgentIdentity:
    """FastAPI dependency to extract and validate auth token.

    Args:
        authorization: Authorization header value

    Returns:
        AgentIdentity for the authenticated user

    Raises:
        HTTPException: If token is missing or invalid
    """
    # Import here to avoid circular dependency and allow runtime access
    import agcom_api.dependencies as deps

    if deps.session_manager is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Session manager not configured"
        )

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Expected format: "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = parts[1]
    identity = deps.session_manager.get_session(token)

    if identity is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return identity


def get_session(
    conn: Annotated[sqlite3.Connection, Depends(get_db_connection)],
    identity: Annotated[AgentIdentity, Depends(get_current_identity)]
) -> AgentCommsSession:
    """FastAPI dependency to create an AgentCommsSession.

    Args:
        conn: Database connection
        identity: Authenticated agent identity

    Returns:
        AgentCommsSession instance
    """
    return AgentCommsSession(conn, identity)
