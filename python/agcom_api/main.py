"""Main FastAPI application for the agcom REST API."""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from agcom_api import __version__
from agcom_api.auth import SessionManager
from agcom_api import dependencies
from agcom_api.routers import auth, messages, threads, contacts, audit, health
# from agcom_api.write_queue import WriteQueue  # TODO: Integrate if needed after testing


# Configuration from environment variables
DB_PATH = os.getenv("AGCOM_DB_PATH", "./data/agcom.db")
API_HOST = os.getenv("AGCOM_API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("AGCOM_API_PORT", "8700"))
API_RELOAD = os.getenv("AGCOM_API_RELOAD", "false").lower() == "true"
SESSION_EXPIRY = int(os.getenv("AGCOM_SESSION_EXPIRY", "24"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for startup and shutdown events."""
    # Startup
    print(f"Starting agcom API v{__version__}")
    print(f"Database path: {DB_PATH}")

    # Initialize session manager
    dependencies.session_manager = SessionManager(session_expiry_hours=SESSION_EXPIRY)
    dependencies.db_path = DB_PATH

    # TODO: Initialize write queue for handling SQLite write operations
    # dependencies.write_queue = WriteQueue()
    # await dependencies.write_queue.start()
    # print("Write queue started")

    # Ensure database directory exists
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)

    yield

    # Shutdown
    # TODO: Shutdown write queue
    # print("Shutting down write queue...")
    # await dependencies.write_queue.stop()
    print("Shutting down agcom API")


# Create FastAPI app
app = FastAPI(
    title="agcom REST API",
    description="REST API for multi-agent communication using the agcom library",
    version=__version__,
    lifespan=lifespan
)

# Add CORS middleware for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler for better error responses
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions."""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "internal_error",
            "message": str(exc)
        }
    )


# Register routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(messages.router)
app.include_router(threads.router)
app.include_router(contacts.router)
app.include_router(audit.router)


# Root endpoint
@app.get("/")
def root():
    """Root endpoint with API information."""
    return {
        "name": "agcom REST API",
        "version": __version__,
        "docs": "/docs",
        "health": "/api/health"
    }


def run():
    """Entry point for running the API server."""
    uvicorn.run(
        "agcom_api.main:app",
        host=API_HOST,
        port=API_PORT,
        reload=API_RELOAD
    )


if __name__ == "__main__":
    run()
