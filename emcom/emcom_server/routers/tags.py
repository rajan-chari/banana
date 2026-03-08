"""Tag endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from emcom_server.models import AddTagsRequest

router = APIRouter()


def _get_caller(request: Request) -> str:
    name = request.headers.get("X-Emcom-Name")
    if not name:
        raise HTTPException(401, "Missing X-Emcom-Name header")
    return name


def _resolve(db, email_id: str) -> str:
    resolved = db.resolve_email_id(email_id)
    if not resolved:
        raise HTTPException(404, f"Email '{email_id}' not found")
    return resolved


@router.post("/email/{email_id}/tags")
def add_tags(email_id: str, req: AddTagsRequest, request: Request):
    caller = _get_caller(request)
    db = request.app.state.db
    email_id = _resolve(db, email_id)
    db.add_tags(email_id, caller, req.tags)
    return {"status": "ok", "tags": req.tags}


@router.delete("/email/{email_id}/tags/{tag}")
def remove_tag(email_id: str, tag: str, request: Request):
    caller = _get_caller(request)
    db = request.app.state.db
    email_id = _resolve(db, email_id)
    if db.remove_tag(email_id, caller, tag):
        return {"status": "removed", "tag": tag}
    raise HTTPException(404, "Tag not found")


@router.get("/email/tags/{tag}")
def emails_by_tag(tag: str, request: Request):
    caller = _get_caller(request)
    db = request.app.state.db
    return db.emails_by_tag(caller, tag)
