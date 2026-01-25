"""Error handling for the REST API."""

import uuid
import sqlite3
import logging
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi import FastAPI

logger = logging.getLogger(__name__)


async def validation_error_handler(request: Request, exc: ValueError):
    """Handle validation errors from agcom."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "error": {
                "type": "ValidationError",
                "message": str(exc),
                "request_id": str(uuid.uuid4())
            }
        }
    )


async def sqlite_error_handler(request: Request, exc: sqlite3.OperationalError):
    """Handle SQLite operational errors (database locked, etc.)."""
    message = str(exc).lower()

    if "locked" in message or "busy" in message:
        logger.warning(f"Database busy/locked: {exc}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "error": {
                    "type": "DatabaseBusy",
                    "message": "Database is temporarily busy, please retry",
                    "retry_after": 1,
                    "request_id": str(uuid.uuid4())
                }
            },
            headers={"Retry-After": "1"}
        )

    # Other SQLite errors
    logger.error(f"SQLite operational error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "type": "DatabaseError",
                "message": "A database error occurred",
                "request_id": str(uuid.uuid4())
            }
        }
    )


async def runtime_error_handler(request: Request, exc: RuntimeError):
    """Handle runtime errors from agcom."""
    message = str(exc).lower()

    # Version conflict (optimistic locking failure)
    if "version conflict" in message:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "error": {
                    "type": "VersionConflict",
                    "message": str(exc),
                    "request_id": str(uuid.uuid4())
                }
            }
        )

    # Not found errors
    if "not found" in message:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "error": {
                    "type": "NotFound",
                    "message": str(exc),
                    "request_id": str(uuid.uuid4())
                }
            }
        )

    # Generic runtime error
    logger.error(f"Runtime error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "type": "InternalError",
                "message": "An unexpected error occurred",
                "request_id": str(uuid.uuid4())
            }
        }
    )


async def generic_error_handler(request: Request, exc: Exception):
    """Catch-all handler for unexpected exceptions."""
    request_id = str(uuid.uuid4())
    logger.error(f"Unhandled exception (request_id={request_id}): {exc}", exc_info=True)
    logger.error(f"Exception type: {type(exc).__name__}")
    logger.error(f"Request path: {request.url.path}")
    logger.error(f"Request method: {request.method}")

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "type": "InternalError",
                "message": "An unexpected error occurred",
                "request_id": request_id
            }
        }
    )


def setup_exception_handlers(app: FastAPI):
    """Register all exception handlers with the FastAPI app."""
    app.add_exception_handler(ValueError, validation_error_handler)
    app.add_exception_handler(sqlite3.OperationalError, sqlite_error_handler)
    app.add_exception_handler(RuntimeError, runtime_error_handler)
    app.add_exception_handler(Exception, generic_error_handler)
