"""Identity registration endpoints."""

from __future__ import annotations

import sqlite3
from fastapi import APIRouter, HTTPException, Request

from emcom_server.models import RegisterRequest, UpdateDescriptionRequest

router = APIRouter()


@router.post("/register")
def register(req: RegisterRequest, request: Request):
    db = request.app.state.db

    if req.name:
        name = req.name
    else:
        name = db.assign_name()
        if not name:
            raise HTTPException(503, "No names available in pool")

    if req.force:
        result = db.force_register(name, req.description)
        return result

    try:
        result = db.register(name, req.description)
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"Name '{name}' is already registered")
    return result


@router.delete("/register/{name}")
def unregister(name: str, request: Request):
    db = request.app.state.db
    if db.unregister(name):
        return {"status": "unregistered", "name": name}
    raise HTTPException(404, f"Name '{name}' not found or already inactive")


@router.get("/who")
def who(request: Request):
    db = request.app.state.db
    return db.list_identities()


@router.patch("/who/{name}")
def update_who(name: str, req: UpdateDescriptionRequest, request: Request):
    # Auth: only the owner can update (checked via header)
    caller = request.headers.get("X-Emcom-Name")
    if caller != name:
        raise HTTPException(403, "Can only update your own description")
    db = request.app.state.db
    result = db.update_description(name, req.description)
    if result:
        return result
    raise HTTPException(404, f"Identity '{name}' not found")
