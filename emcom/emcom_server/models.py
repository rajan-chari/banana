"""Pydantic request/response models for emcom-server."""

from __future__ import annotations
from pydantic import BaseModel


class RegisterRequest(BaseModel):
    name: str | None = None
    description: str = ""
    force: bool = False


class SendEmailRequest(BaseModel):
    to: list[str]
    cc: list[str] = []
    subject: str = ""
    body: str = ""
    in_reply_to: str | None = None


class AddTagsRequest(BaseModel):
    tags: list[str]


class AddNamesRequest(BaseModel):
    names: list[str]


class UpdateDescriptionRequest(BaseModel):
    description: str
