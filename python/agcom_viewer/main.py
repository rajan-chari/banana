"""Main FastAPI application for the agcom viewer."""

import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn

from agcom_viewer import __version__


# Configuration
VIEWER_HOST = os.getenv("AGCOM_VIEWER_HOST", "0.0.0.0")
VIEWER_PORT = int(os.getenv("AGCOM_VIEWER_PORT", "8701"))
API_URL = os.getenv("AGCOM_API_URL", "http://localhost:8700")

# Paths
STATIC_DIR = Path(__file__).parent / "static"


# Create app
app = FastAPI(
    title="agcom Message Viewer",
    description="Web UI for viewing agcom messages",
    version=__version__
)


# API config endpoint (so JS can know where to call)
@app.get("/api/config")
def get_config():
    """Return configuration for the frontend."""
    return {
        "api_url": API_URL,
        "version": __version__
    }


# Serve static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# Serve index.html for root and any unmatched routes (SPA style)
@app.get("/")
def serve_root():
    """Serve the main index.html."""
    return FileResponse(STATIC_DIR / "index.html")


def run():
    """Entry point for running the viewer."""
    print(f"Starting agcom Viewer v{__version__}")
    print(f"API URL: {API_URL}")
    print(f"Open http://localhost:{VIEWER_PORT} in your browser")
    uvicorn.run(
        "agcom_viewer.main:app",
        host=VIEWER_HOST,
        port=VIEWER_PORT,
        reload=False
    )


if __name__ == "__main__":
    run()
