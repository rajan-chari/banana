"""Email endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from emcom_server.models import SendEmailRequest

router = APIRouter()


def _get_caller(request: Request) -> str:
    name = request.headers.get("X-Emcom-Name")
    if not name:
        raise HTTPException(401, "Missing X-Emcom-Name header")
    return name


@router.post("/email")
def send_email(req: SendEmailRequest, request: Request):
    caller = _get_caller(request)
    db = request.app.state.db

    # Validate all recipients exist
    for name in req.to + req.cc:
        if not db.is_registered(name):
            raise HTTPException(404, f"Recipient '{name}' is not registered")

    # Resolve in_reply_to short ID
    in_reply_to = req.in_reply_to
    if in_reply_to:
        resolved = db.resolve_email_id(in_reply_to)
        if not resolved:
            raise HTTPException(404, f"Email '{in_reply_to}' not found (in_reply_to)")
        in_reply_to = resolved

    email = db.create_email(
        sender=caller,
        recipients=req.to,
        cc=req.cc,
        subject=req.subject,
        body=req.body,
        in_reply_to=in_reply_to,
    )
    return email


@router.get("/email/inbox")
def inbox(request: Request, all: bool = False):
    caller = _get_caller(request)
    db = request.app.state.db
    return db.inbox(caller, include_all=all)


@router.get("/email/sent")
def sent(request: Request):
    caller = _get_caller(request)
    db = request.app.state.db
    return db.sent(caller)


@router.get("/email/all")
def all_mail(request: Request):
    caller = _get_caller(request)
    db = request.app.state.db
    return db.all_mail(caller)


@router.get("/email/{email_id}")
def get_email(email_id: str, request: Request, add_tags: str | None = None):
    caller = _get_caller(request)
    db = request.app.state.db
    # Resolve short ID prefix to full UUID
    resolved = db.resolve_email_id(email_id)
    if not resolved:
        raise HTTPException(404, f"Email '{email_id}' not found")
    email = db.get_email(resolved, viewer=caller)
    if not email:
        raise HTTPException(404, f"Email '{email_id}' not found")
    # Atomically: remove unread, add any requested tags (e.g. pending)
    extra = [t.strip() for t in add_tags.split(",") if t.strip()] if add_tags else []
    db.mark_read_and_tag(resolved, caller, extra)
    # Refresh tags
    email = db.get_email(resolved, viewer=caller)
    return email
