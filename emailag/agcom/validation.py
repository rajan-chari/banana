"""Input validation for the agcom library."""

from __future__ import annotations

import re

_HANDLE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,49}$")
_TAG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,49}$")


def validate_handle(handle: str) -> str:
    """Validate an agent handle: 1-50 chars, lowercase alphanumeric + underscores/hyphens."""
    if not isinstance(handle, str) or not handle:
        raise ValueError("Handle must be a non-empty string")
    if not _HANDLE_PATTERN.match(handle):
        raise ValueError(
            f"Invalid handle '{handle}': must be 1-50 lowercase alphanumeric characters, "
            "underscores, or hyphens, starting with alphanumeric"
        )
    return handle


def validate_subject(subject: str) -> str:
    """Validate a message subject: 1-200 chars, non-empty after strip."""
    if not isinstance(subject, str):
        raise ValueError("Subject must be a string")
    subject = subject.strip()
    if not subject:
        raise ValueError("Subject must not be empty")
    if len(subject) > 200:
        raise ValueError(f"Subject too long ({len(subject)} chars, max 200)")
    return subject


def validate_body(body: str) -> str:
    """Validate a message body: 1-10000 chars, non-empty after strip."""
    if not isinstance(body, str):
        raise ValueError("Body must be a string")
    body = body.strip()
    if not body:
        raise ValueError("Body must not be empty")
    if len(body) > 10000:
        raise ValueError(f"Body too long ({len(body)} chars, max 10000)")
    return body


def validate_tag(tag: str) -> str:
    """Validate a tag: 1-50 chars, lowercase alphanumeric + underscores/hyphens."""
    if not isinstance(tag, str) or not tag:
        raise ValueError("Tag must be a non-empty string")
    if not _TAG_PATTERN.match(tag):
        raise ValueError(
            f"Invalid tag '{tag}': must be 1-50 lowercase alphanumeric characters, "
            "underscores, or hyphens, starting with alphanumeric"
        )
    return tag


def validate_recipients(recipients: list[str]) -> list[str]:
    """Validate a recipients list: non-empty, valid handles, no duplicates."""
    if not isinstance(recipients, list) or not recipients:
        raise ValueError("Recipients must be a non-empty list")
    seen = set()
    validated = []
    for r in recipients:
        handle = validate_handle(r)
        if handle in seen:
            raise ValueError(f"Duplicate recipient: '{handle}'")
        seen.add(handle)
        validated.append(handle)
    return validated
