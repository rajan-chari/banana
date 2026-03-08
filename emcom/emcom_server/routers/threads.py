"""Thread endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


def _get_caller(request: Request) -> str:
    name = request.headers.get("X-Emcom-Name")
    if not name:
        raise HTTPException(401, "Missing X-Emcom-Name header")
    return name


@router.get("/threads")
def list_threads(request: Request):
    caller = _get_caller(request)
    db = request.app.state.db
    return db.list_threads(caller)


@router.get("/threads/{thread_id}")
def get_thread(thread_id: str, request: Request):
    db = request.app.state.db
    resolved = db.resolve_thread_id(thread_id)
    if not resolved:
        raise HTTPException(404, f"Thread '{thread_id}' not found")
    emails = db.get_thread(resolved)
    if not emails:
        raise HTTPException(404, f"Thread '{thread_id}' not found")
    return emails
