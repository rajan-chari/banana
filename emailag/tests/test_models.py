"""Tests for Pydantic request/response models."""

import pytest
from datetime import datetime, timezone
from pydantic import ValidationError

from agcom_api.models import (
    LoginRequest,
    LoginResponse,
    SendRequest,
    ReplyRequest,
    MessageResponse,
    ThreadResponse,
    ContactCreateRequest,
    ContactUpdateRequest,
    PaginationParams,
    ErrorResponse,
)


class TestLoginRequest:
    def test_valid(self):
        req = LoginRequest(handle="alice")
        assert req.handle == "alice"
        assert req.display_name is None

    def test_with_display_name(self):
        req = LoginRequest(handle="alice", display_name="Alice")
        assert req.display_name == "Alice"

    def test_empty_handle_rejected(self):
        with pytest.raises(ValidationError):
            LoginRequest(handle="")


class TestSendRequest:
    def test_valid(self):
        req = SendRequest(
            recipients=["bob"], subject="Hello", body="Hi there"
        )
        assert req.recipients == ["bob"]
        assert req.tags is None

    def test_with_tags(self):
        req = SendRequest(
            recipients=["bob", "charlie"],
            subject="Update",
            body="Status update",
            tags=["urgent"],
        )
        assert req.tags == ["urgent"]

    def test_empty_recipients_rejected(self):
        with pytest.raises(ValidationError):
            SendRequest(recipients=[], subject="Hello", body="Hi")

    def test_empty_subject_rejected(self):
        with pytest.raises(ValidationError):
            SendRequest(recipients=["bob"], subject="", body="Hi")


class TestReplyRequest:
    def test_valid(self):
        req = ReplyRequest(body="Thanks!")
        assert req.body == "Thanks!"

    def test_empty_body_rejected(self):
        with pytest.raises(ValidationError):
            ReplyRequest(body="")


class TestContactCreateRequest:
    def test_valid(self):
        req = ContactCreateRequest(handle="bob")
        assert req.handle == "bob"

    def test_with_all_fields(self):
        req = ContactCreateRequest(
            handle="bob",
            display_name="Bob",
            description="A developer",
            tags=["dev"],
        )
        assert req.tags == ["dev"]


class TestContactUpdateRequest:
    def test_requires_version(self):
        with pytest.raises(ValidationError):
            ContactUpdateRequest()

    def test_valid(self):
        req = ContactUpdateRequest(display_name="New Name", version=1)
        assert req.version == 1


class TestPaginationParams:
    def test_defaults(self):
        p = PaginationParams()
        assert p.limit == 50
        assert p.offset == 0

    def test_limit_bounds(self):
        with pytest.raises(ValidationError):
            PaginationParams(limit=0)
        with pytest.raises(ValidationError):
            PaginationParams(limit=201)

    def test_negative_offset_rejected(self):
        with pytest.raises(ValidationError):
            PaginationParams(offset=-1)
