"""Work tracker endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from emcom_server.db import VALID_STATUSES, VALID_TYPES, VALID_SEVERITIES, VALID_LINK_TYPES

router = APIRouter(prefix="/tracker", tags=["tracker"])


def _get_caller(request: Request) -> str:
    name = request.headers.get("X-Emcom-Name")
    if not name:
        raise HTTPException(401, "Missing X-Emcom-Name header")
    return name


# --- Request models ---

class CreateWorkItemRequest(BaseModel):
    repo: str
    title: str
    number: int | None = None
    type: str = "issue"
    severity: str = "normal"
    status: str = "new"
    assigned_to: str | None = None
    labels: list[str] = []
    notes: str = ""


class UpdateWorkItemRequest(BaseModel):
    title: str | None = None
    type: str | None = None
    severity: str | None = None
    status: str | None = None
    assigned_to: str | None = None
    number: int | None = None
    blocker: str | None = None
    findings: str | None = None
    decision: str | None = None
    decision_rationale: str | None = None
    labels: list[str] | None = None
    notes: str | None = None
    comment: str = ""


class CommentRequest(BaseModel):
    comment: str


class LinkRequest(BaseModel):
    to_id: str
    link_type: str = "related"


# --- Endpoints ---

@router.post("")
def create_work_item(req: CreateWorkItemRequest, request: Request):
    caller = _get_caller(request)
    db = request.app.state.db
    if req.type not in VALID_TYPES:
        raise HTTPException(400, f"Invalid type '{req.type}'. Valid: {sorted(VALID_TYPES)}")
    if req.severity not in VALID_SEVERITIES:
        raise HTTPException(400, f"Invalid severity '{req.severity}'. Valid: {sorted(VALID_SEVERITIES)}")
    if req.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status '{req.status}'. Valid: {sorted(VALID_STATUSES)}")
    return db.create_work_item(
        repo=req.repo, title=req.title, created_by=caller,
        number=req.number, type_=req.type, severity=req.severity,
        status=req.status, assigned_to=req.assigned_to,
        labels=req.labels, notes=req.notes,
    )


@router.get("")
def list_work_items(request: Request, status: str | None = None, repo: str | None = None,
                    assigned_to: str | None = None, created_by: str | None = None,
                    severity: str | None = None, label: str | None = None,
                    type: str | None = None, blocked: bool = False,
                    since: str | None = None):
    db = request.app.state.db
    return db.list_work_items(
        status=status, repo=repo, assigned_to=assigned_to,
        created_by=created_by, severity=severity, label=label,
        type_=type, blocked=blocked, since=since,
    )


@router.get("/stale")
def stale_work_items(request: Request, hours: int = 24):
    db = request.app.state.db
    return db.stale_work_items(hours=hours)


@router.get("/blocked")
def blocked_work_items(request: Request):
    db = request.app.state.db
    return db.blocked_work_items()


@router.get("/stats")
def work_item_stats(request: Request):
    db = request.app.state.db
    return db.work_item_stats()


@router.get("/decisions")
def work_item_decisions(request: Request, repo: str | None = None):
    db = request.app.state.db
    return db.work_item_decisions(repo=repo)


@router.get("/search")
def search_work_items(request: Request, q: str = ""):
    if not q:
        raise HTTPException(400, "Query parameter 'q' is required")
    db = request.app.state.db
    return db.search_work_items(q)


@router.get("/queue/{agent}")
def agent_queue(agent: str, request: Request):
    db = request.app.state.db
    return db.agent_queue(agent)


@router.get("/{item_ref}")
def get_work_item(item_ref: str, request: Request):
    db = request.app.state.db
    item_id = db.resolve_work_item_id(item_ref)
    if not item_id:
        raise HTTPException(404, f"Work item '{item_ref}' not found")
    item = db.get_work_item(item_id)
    if not item:
        raise HTTPException(404, f"Work item '{item_ref}' not found")
    return item


@router.patch("/{item_ref}")
def update_work_item(item_ref: str, req: UpdateWorkItemRequest, request: Request):
    caller = _get_caller(request)
    db = request.app.state.db
    item_id = db.resolve_work_item_id(item_ref)
    if not item_id:
        raise HTTPException(404, f"Work item '{item_ref}' not found")
    if req.status and req.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status '{req.status}'. Valid: {sorted(VALID_STATUSES)}")
    if req.type and req.type not in VALID_TYPES:
        raise HTTPException(400, f"Invalid type '{req.type}'. Valid: {sorted(VALID_TYPES)}")
    if req.severity and req.severity not in VALID_SEVERITIES:
        raise HTTPException(400, f"Invalid severity '{req.severity}'. Valid: {sorted(VALID_SEVERITIES)}")

    updates = {k: v for k, v in req.model_dump().items() if v is not None and k != "comment"}
    try:
        return db.update_work_item(item_id, caller, comment=req.comment, **updates)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/{item_ref}/history")
def get_work_item_history(item_ref: str, request: Request):
    db = request.app.state.db
    item_id = db.resolve_work_item_id(item_ref)
    if not item_id:
        raise HTTPException(404, f"Work item '{item_ref}' not found")
    return db.get_work_item_history(item_id)


@router.post("/{item_ref}/comment")
def add_comment(item_ref: str, req: CommentRequest, request: Request):
    caller = _get_caller(request)
    db = request.app.state.db
    item_id = db.resolve_work_item_id(item_ref)
    if not item_id:
        raise HTTPException(404, f"Work item '{item_ref}' not found")
    try:
        return db.add_work_item_comment(item_id, caller, req.comment)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/{item_ref}/link")
def add_link(item_ref: str, req: LinkRequest, request: Request):
    db = request.app.state.db
    item_id = db.resolve_work_item_id(item_ref)
    if not item_id:
        raise HTTPException(404, f"Work item '{item_ref}' not found")
    to_id = db.resolve_work_item_id(req.to_id)
    if not to_id:
        raise HTTPException(404, f"Work item '{req.to_id}' not found")
    if req.link_type not in VALID_LINK_TYPES:
        raise HTTPException(400, f"Invalid link_type '{req.link_type}'. Valid: {sorted(VALID_LINK_TYPES)}")
    db.add_work_item_link(item_id, to_id, req.link_type)
    return {"status": "ok"}


@router.delete("/{item_ref}/link/{to_ref}")
def remove_link(item_ref: str, to_ref: str, request: Request):
    db = request.app.state.db
    item_id = db.resolve_work_item_id(item_ref)
    if not item_id:
        raise HTTPException(404, f"Work item '{item_ref}' not found")
    to_id = db.resolve_work_item_id(to_ref)
    if not to_id:
        raise HTTPException(404, f"Work item '{to_ref}' not found")
    if not db.remove_work_item_link(item_id, to_id):
        raise HTTPException(404, "Link not found")
    return {"status": "ok"}
