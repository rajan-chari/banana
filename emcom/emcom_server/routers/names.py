"""Name pool endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Request

from emcom_server.models import AddNamesRequest

router = APIRouter()


@router.get("/names")
def list_names(request: Request):
    db = request.app.state.db
    return db.available_names()


@router.post("/names")
def add_names(req: AddNamesRequest, request: Request):
    db = request.app.state.db
    added = db.add_names(req.names)
    return {"added": added}
