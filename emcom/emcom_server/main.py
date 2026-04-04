"""emcom-server entry point."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware


class _SuppressPollingFilter(logging.Filter):
    """Suppress access-log lines for high-frequency polling endpoints."""

    _QUIET_PATHS = ("/email/tags/unread",)

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not any(p in msg for p in self._QUIET_PATHS)

from emcom_server.db import Database
from emcom_server.routers import identity, names, email, threads, tags, search, attachments, tracker

# Endpoints that skip auth
NO_AUTH_PATHS = {"/health", "/who", "/names", "/admin/purge"}
NO_AUTH_PREFIXES = ("/docs", "/openapi", "/redoc", "/register")


@asynccontextmanager
async def lifespan(app: FastAPI):
    data_dir = Path(os.environ.get("EMCOM_DATA_DIR", Path.home() / ".emcom"))
    data_dir.mkdir(parents=True, exist_ok=True)
    app.state.data_dir = data_dir
    app.state.db = Database(data_dir / "emcom.db")
    # Install after uvicorn's dictConfig so it doesn't get cleared
    logging.getLogger("uvicorn.access").addFilter(_SuppressPollingFilter())
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="emcom-server", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        path = request.url.path

        # Skip auth for health, registration, who, names, docs
        needs_auth = True
        if path in NO_AUTH_PATHS:
            needs_auth = False
        elif any(path.startswith(p) for p in NO_AUTH_PREFIXES):
            needs_auth = False
        elif request.method == "POST" and path == "/register":
            needs_auth = False

        if needs_auth:
            name = request.headers.get("X-Emcom-Name")
            if not name:
                return Response(
                    content='{"detail":"Missing X-Emcom-Name header"}',
                    status_code=401,
                    media_type="application/json",
                )
            db: Database = request.app.state.db
            if not db.check_registered_and_touch(name):
                return Response(
                    content=f'{{"detail":"Identity \'{name}\' is not registered or inactive"}}',
                    status_code=401,
                    media_type="application/json",
                )

        return await call_next(request)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/admin/purge")
    def purge():
        counts = app.state.db.purge()
        return {"purged": counts}

    app.include_router(identity.router)
    app.include_router(names.router)
    app.include_router(email.router)
    app.include_router(threads.router)
    app.include_router(tags.router)
    app.include_router(search.router)
    app.include_router(attachments.router)
    app.include_router(tracker.router)

    return app


def run():
    host = os.environ.get("EMCOM_HOST", "127.0.0.1")
    port = int(os.environ.get("EMCOM_PORT", "8800"))
    app = create_app()
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    run()
