"""agcom-viewer: lightweight static file server with config endpoint."""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


def create_app() -> FastAPI:
    app = FastAPI(title="agcom-viewer", version="0.1.0")

    @app.get("/config")
    async def config(request: Request):
        """Return API URL using request hostname to avoid CORS issues."""
        api_host = os.environ.get("AGCOM_API_HOST_PUBLIC", request.url.hostname or "127.0.0.1")
        api_port = os.environ.get("AGCOM_API_PORT", "8700")
        return JSONResponse({"api_url": f"http://{api_host}:{api_port}"})

    @app.get("/")
    async def index():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    return app


def run():
    import uvicorn

    host = os.environ.get("AGCOM_VIEWER_HOST", "127.0.0.1")
    port = int(os.environ.get("AGCOM_VIEWER_PORT", "8701"))
    uvicorn.run(create_app(), host=host, port=port)
