"""ULID generation utilities for unique identifiers."""

import ulid


def generate_ulid() -> str:
    """Generate a new ULID (Universally Unique Lexicographically Sortable Identifier).

    ULIDs are:
    - 26 characters long (Base32 encoded)
    - Lexicographically sortable by timestamp
    - Case-insensitive (uppercase by convention)
    - Monotonic within the same millisecond

    Returns:
        str: A new ULID as a string
    """
    return str(ulid.new())
