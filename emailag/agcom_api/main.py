"""agcom-api server: FastAPI application with lifespan management."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import SessionManager
from .routers import (
    admin_router,
    audit_router,
    auth_router,
    contacts_router,
    health_router,
    messages_router,
    threads_router,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize storage and session manager on startup."""
    db_path = os.environ.get("AGCOM_DB_PATH", "./agcom.db")
    session_db = os.environ.get("AGCOM_SESSION_DB", "./sessions.db")

    # Initialize agcom storage
    try:
        from agcom.storage import Storage

        storage = Storage(db_path)
        logger.info("agcom storage initialized: %s", db_path)
    except ImportError:
        logger.warning("agcom library not available — storage disabled")
        storage = None

    # Initialize session manager
    session_manager = SessionManager(db_path=session_db)
    session_manager.cleanup_expired()

    app.state.storage = storage
    app.state.session_manager = session_manager

    logger.info("agcom-api started")
    yield
    logger.info("agcom-api shutting down")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="agcom-api",
        description="Agent Communication REST API",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS middleware — allow all origins for local dev
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(messages_router)
    app.include_router(threads_router)
    app.include_router(contacts_router)
    app.include_router(audit_router)
    app.include_router(admin_router)

    return app


def run():
    """Entry point for the agcom-api server."""
    import uvicorn

    log_level = os.environ.get("LOG_LEVEL", "INFO").lower()
    host = os.environ.get("AGCOM_API_HOST", "0.0.0.0")
    port = int(os.environ.get("AGCOM_API_PORT", "8700"))

    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )

    logger.info("Starting agcom-api on %s:%d", host, port)
    uvicorn.run(create_app(), host=host, port=port, log_level=log_level)
