"""Work tracker endpoints."""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from emcom_server.db import VALID_STATUSES, VALID_TYPES, VALID_SEVERITIES, VALID_LINK_TYPES

router = APIRouter(prefix="/tracker", tags=["tracker"])


# --- WebSocket broadcast manager ---

class TrackerWSManager:
    """Manages WebSocket connections and broadcasts tracker mutations."""

    def __init__(self):
        self._clients: dict[WebSocket, str] = {}  # ws -> agent name

    async def connect(self, ws: WebSocket, name: str):
        await ws.accept()
        self._clients[ws] = name

    def disconnect(self, ws: WebSocket):
        self._clients.pop(ws, None)

    async def broadcast(self, action: str, item: dict):
        msg = json.dumps({"type": "tracker-update", "payload": {"action": action, "item": item}})
        dead = []
        for ws in self._clients:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.pop(ws, None)


_ws_manager = TrackerWSManager()


def _broadcast(action: str, item: dict):
    """Fire-and-forget broadcast to all WS clients from sync context."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_ws_manager.broadcast(action, item))
    except RuntimeError:
        pass  # no event loop — skip (e.g. during tests)


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
    item = db.create_work_item(
        repo=req.repo, title=req.title, created_by=caller,
        number=req.number, type_=req.type, severity=req.severity,
        status=req.status, assigned_to=req.assigned_to,
        labels=req.labels, notes=req.notes,
    )
    _broadcast("create", item)
    return item


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
        item = db.update_work_item(item_id, caller, comment=req.comment, **updates)
        _broadcast("update", item)
        return item
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
        result = db.add_work_item_comment(item_id, caller, req.comment)
        full_item = db.get_work_item(item_id)
        if full_item:
            _broadcast("update", full_item)
        return result
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


# --- WebSocket ---

@router.websocket("/ws")
async def tracker_ws(ws: WebSocket, name: str = ""):
    """WebSocket endpoint for real-time tracker updates.

    Connect: ws://host:port/tracker/ws?name=frost
    On connect: sends tracker-snapshot with all open items.
    On mutations: sends tracker-update with action + full item.
    """
    if not name:
        await ws.close(code=4001, reason="Missing 'name' query parameter")
        return

    db = ws.app.state.db
    if not db.is_registered(name):
        await ws.close(code=4003, reason=f"Identity '{name}' is not registered")
        return

    await _ws_manager.connect(ws, name)
    try:
        # Send initial snapshot of open items
        items = db.list_work_items(status="open")
        await ws.send_text(json.dumps({"type": "tracker-snapshot", "payload": items}))

        # Keep connection alive — listen for pings/close
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _ws_manager.disconnect(ws)
