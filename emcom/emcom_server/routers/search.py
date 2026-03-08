"""Search endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


@router.get("/search")
def search(
    request: Request,
    from_: str | None = None,
    to: str | None = None,
    subject: str | None = None,
    tag: str | None = None,
    body: str | None = None,
):
    caller = request.headers.get("X-Emcom-Name")
    if not caller:
        raise HTTPException(401, "Missing X-Emcom-Name header")
    db = request.app.state.db
    return db.search(from_=from_, to=to, subject=subject, tag=tag, body=body, viewer=caller)
