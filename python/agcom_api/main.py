"""Main FastAPI application for the agcom REST API."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from agcom_api import __version__

# Set up logging to both console and file
LOGS_DIR = Path(__file__).parent.parent / "logs"
LOG_FILE = LOGS_DIR / "agcom-api.log"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Custom handler that flushes on every write
class FlushingFileHandler(logging.FileHandler):
    def emit(self, record):
        super().emit(record)
        self.flush()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        FlushingFileHandler(LOG_FILE, mode='w', encoding='utf-8'),
    ],
)
logger = logging.getLogger(__name__)
from agcom_api.auth import SessionManager
from agcom_api import dependencies
from agcom_api.routers import auth, messages, threads, contacts, audit, health, admin
from agcom.storage import init_database
from agcom.console.config import load_config as load_agcom_config
# from agcom_api.write_queue import WriteQueue  # TODO: Integrate if needed after testing


# Configuration: env var > agcom config > default
def get_db_path() -> str:
    """Get database path from env, agcom config, or default."""
    if os.getenv("AGCOM_DB_PATH"):
        return os.getenv("AGCOM_DB_PATH")
    agcom_config = load_agcom_config()
    if agcom_config.get("store"):
        return agcom_config["store"]
    return "./data/agcom.db"


DB_PATH = get_db_path()
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

    # Initialize database at startup (creates tables if needed)
    conn = init_database(DB_PATH)
    conn.close()
    print(f"Database initialized: {DB_PATH}")

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
# Note: allow_origins=["*"] with allow_credentials=True doesn't work properly
# Must list specific origins when credentials are enabled
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8701",
        "http://127.0.0.1:8701",
        "http://localhost:8700",
        "http://127.0.0.1:8700",
    ],
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
app.include_router(admin.router)


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
