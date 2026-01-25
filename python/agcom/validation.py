"""Input validation functions for the Agent Communication system."""

import re


def validate_handle(handle: str) -> None:
    """Validate an agent handle.

    Rules:
    - Must not be empty or only whitespace
    - Must contain only lowercase letters, numbers, periods, hyphens, and underscores
    - Must be between 2 and 64 characters
    - Must not start or end with period or hyphen

    Args:
        handle: The handle string to validate

    Raises:
        ValueError: If the handle is invalid
    """
    if not handle or not handle.strip():
        raise ValueError("Handle cannot be empty or only whitespace")

    if len(handle) < 2:
        raise ValueError("Handle must be at least 2 characters")

    if len(handle) > 64:
        raise ValueError("Handle must not exceed 64 characters")

    if not re.match(r'^[a-z0-9._-]+$', handle):
        raise ValueError(
            "Handle must contain only lowercase letters, numbers, periods, hyphens, and underscores"
        )

    if handle[0] in '.-' or handle[-1] in '.-':
        raise ValueError("Handle cannot start or end with period or hyphen")


def validate_subject(subject: str) -> None:
    """Validate a message subject.

    Rules:
    - Must not be empty or only whitespace
    - Must not exceed 200 characters

    Args:
        subject: The subject string to validate

    Raises:
        ValueError: If the subject is invalid
    """
    if not subject or not subject.strip():
        raise ValueError("Subject cannot be empty or only whitespace")

    if len(subject) > 200:
        raise ValueError("Subject must not exceed 200 characters")


def validate_body(body: str) -> None:
    """Validate a message body.

    Rules:
    - Must not be empty or only whitespace
    - Must not exceed 50,000 characters

    Args:
        body: The body string to validate

    Raises:
        ValueError: If the body is invalid
    """
    if not body or not body.strip():
        raise ValueError("Body cannot be empty or only whitespace")

    if len(body) > 50000:
        raise ValueError("Body must not exceed 50,000 characters")


def validate_tags(tags: list[str]) -> list[str]:
    """Validate and normalize a list of tags.

    Rules:
    - Maximum 20 tags allowed
    - Each tag must contain only lowercase letters, numbers, hyphens, and underscores
    - Each tag must be 1-30 characters
    - Duplicates are automatically removed

    Args:
        tags: The list of tag strings to validate

    Returns:
        Deduplicated list of validated tags

    Raises:
        ValueError: If any tag is invalid
    """
    if len(tags) > 20:
        raise ValueError("Cannot exceed 20 tags")

    validated = []
    for tag in tags:
        if not tag or not tag.strip():
            raise ValueError("Tags cannot be empty or only whitespace")

        if not re.match(r'^[a-z0-9_-]+$', tag):
            raise ValueError(
                f"Tag '{tag}' must contain only lowercase letters, numbers, hyphens, and underscores"
            )

        if len(tag) < 1 or len(tag) > 30:
            raise ValueError(f"Tag '{tag}' must be 1-30 characters")

        validated.append(tag)

    # Deduplicate while preserving order
    return list(dict.fromkeys(validated))


def validate_description(description: str) -> None:
    """Validate a description (e.g., for address book entries).

    Rules:
    - Must not be empty or only whitespace
    - Must not exceed 500 characters

    Args:
        description: The description string to validate

    Raises:
        ValueError: If the description is invalid
    """
    if not description or not description.strip():
        raise ValueError("Description cannot be empty or only whitespace")

    if len(description) > 500:
        raise ValueError("Description must not exceed 500 characters")


def validate_display_name(display_name: str) -> None:
    """Validate a display name.

    Rules:
    - Must not be empty or only whitespace
    - Must not exceed 100 characters

    Args:
        display_name: The display name string to validate

    Raises:
        ValueError: If the display name is invalid
    """
    if not display_name or not display_name.strip():
        raise ValueError("Display name cannot be empty or only whitespace")

    if len(display_name) > 100:
        raise ValueError("Display name must not exceed 100 characters")
