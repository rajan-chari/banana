"""
Identity management for agcom integration.

Handles assistant self-registration with derived handle format: {user}_assistant
"""

import os
import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class AgcomIdentity:
    """Identity configuration for agcom assistant."""

    user_handle: str
    assistant_handle: str
    display_name: str | None = None

    def __post_init__(self):
        """Validate identity on creation."""
        if not self.user_handle:
            raise ValueError("user_handle cannot be empty")
        if not self.assistant_handle:
            raise ValueError("assistant_handle cannot be empty")


def name_to_handle(name: str) -> str:
    """
    Convert user's name to a valid handle.

    Args:
        name: User's name (e.g., "Alice", "Bob Smith", "alice123")

    Returns:
        Valid handle (lowercase, underscores, alphanumeric ASCII)

    Examples:
        >>> name_to_handle("Alice")
        'alice'
        >>> name_to_handle("Bob Smith")
        'bob_smith'
        >>> name_to_handle("Alice-Marie")
        'alice_marie'
    """
    import unicodedata

    # Convert to lowercase
    handle = name.lower().strip()

    # Normalize Unicode characters (decompose accents)
    # NFD = Canonical Decomposition
    handle = unicodedata.normalize('NFD', handle)

    # Remove combining characters (accents)
    handle = ''.join(c for c in handle if not unicodedata.combining(c))

    # Replace spaces and hyphens with underscores
    handle = handle.replace(' ', '_').replace('-', '_')

    # Remove non-ASCII alphanumeric characters except underscores
    handle = ''.join(c for c in handle if c.isascii() and (c.isalnum() or c == '_'))

    # Remove duplicate underscores
    while '__' in handle:
        handle = handle.replace('__', '_')

    # Strip leading/trailing underscores
    handle = handle.strip('_')

    return handle


def derive_assistant_handle(user_handle: str) -> str:
    """
    Derive assistant handle from user handle.

    Args:
        user_handle: The user's agcom handle (e.g., "alice")

    Returns:
        Assistant handle in format "{user}_assistant" (e.g., "alice_assistant")

    Examples:
        >>> derive_assistant_handle("alice")
        'alice_assistant'
        >>> derive_assistant_handle("bob")
        'bob_assistant'
    """
    if not user_handle:
        raise ValueError("user_handle cannot be empty")

    return f"{user_handle}_assistant"


def is_identity_configured() -> bool:
    """
    Check if user identity is configured.

    Returns:
        True if AGCOM_USER_HANDLE environment variable is set
    """
    user_handle = os.getenv("AGCOM_USER_HANDLE")
    configured = bool(user_handle)
    logger.debug(f"is_identity_configured: AGCOM_USER_HANDLE={user_handle!r} -> {configured}")
    return configured


def load_identity() -> AgcomIdentity | None:
    """
    Load identity from environment variables.

    Reads configuration from:
    - AGCOM_USER_HANDLE: User's agcom handle (required)
    - AGCOM_HANDLE: Assistant's handle (derived if not set)
    - AGCOM_DISPLAY_NAME: Display name (optional)

    Returns:
        AgcomIdentity if configured, None otherwise

    Examples:
        >>> os.environ["AGCOM_USER_HANDLE"] = "alice"
        >>> os.environ["AGCOM_HANDLE"] = "alice_assistant"
        >>> identity = load_identity()
        >>> identity.user_handle
        'alice'
        >>> identity.assistant_handle
        'alice_assistant'
    """
    user_handle = os.getenv("AGCOM_USER_HANDLE")
    if not user_handle:
        return None

    # Derive assistant handle if not explicitly set
    assistant_handle = os.getenv("AGCOM_HANDLE")
    if not assistant_handle:
        assistant_handle = derive_assistant_handle(user_handle)

    display_name = os.getenv("AGCOM_DISPLAY_NAME")

    return AgcomIdentity(
        user_handle=user_handle,
        assistant_handle=assistant_handle,
        display_name=display_name,
    )


def save_identity_to_env(identity: AgcomIdentity, env_file: Path) -> None:
    """
    Save identity to .env file, preserving existing variables.

    Args:
        identity: Identity configuration to save
        env_file: Path to .env file

    Raises:
        IOError: If file cannot be written
    """
    # Read existing .env file if it exists
    existing_vars = {}
    if env_file.exists():
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    # Skip empty lines and comments
                    if not line or line.startswith("#"):
                        continue
                    # Parse key=value
                    if "=" in line:
                        key, value = line.split("=", 1)
                        existing_vars[key.strip()] = value.strip()
        except IOError as e:
            logger.warning(f"Could not read existing .env file: {e}")

    # Update identity variables
    existing_vars["AGCOM_USER_HANDLE"] = identity.user_handle
    existing_vars["AGCOM_HANDLE"] = identity.assistant_handle
    if identity.display_name:
        existing_vars["AGCOM_DISPLAY_NAME"] = identity.display_name

    # Write back to file
    try:
        # Ensure parent directory exists
        env_file.parent.mkdir(parents=True, exist_ok=True)

        with open(env_file, "w", encoding="utf-8") as f:
            f.write("# agcom Identity Configuration\n")
            f.write(f"AGCOM_USER_HANDLE={existing_vars.get('AGCOM_USER_HANDLE', '')}\n")
            f.write(f"AGCOM_HANDLE={existing_vars.get('AGCOM_HANDLE', '')}\n")
            if existing_vars.get("AGCOM_DISPLAY_NAME"):
                f.write(f"AGCOM_DISPLAY_NAME={existing_vars['AGCOM_DISPLAY_NAME']}\n")
            f.write("\n")

            # Write other variables
            for key, value in existing_vars.items():
                if key not in ("AGCOM_USER_HANDLE", "AGCOM_HANDLE", "AGCOM_DISPLAY_NAME"):
                    f.write(f"{key}={value}\n")

        logger.info(f"Saved identity to {env_file}")
    except IOError as e:
        logger.error(f"Failed to write .env file: {e}")
        raise


def configure_identity(
    user_handle: str,
    env_file: Path,
    display_name: str | None = None,
    user_name: str | None = None,
) -> AgcomIdentity:
    """
    Configure identity from user input and save to .env file.

    Args:
        user_handle: User's agcom handle (e.g., "alice")
        env_file: Path to .env file
        display_name: Optional display name (auto-generated if not provided)
        user_name: Optional original user name for better display name generation

    Returns:
        Configured AgcomIdentity

    Raises:
        ValueError: If user_handle is empty
        IOError: If .env file cannot be written

    Examples:
        >>> identity = configure_identity("alice", Path(".env"))
        >>> identity.user_handle
        'alice'
        >>> identity.assistant_handle
        'alice_assistant'
        >>> identity.display_name
        "Alice's Assistant"
    """
    if not user_handle:
        raise ValueError("user_handle cannot be empty")

    # Auto-generate display name if not provided
    if not display_name:
        # Use original name for display if available, otherwise title-case handle
        name_for_display = user_name.title() if user_name else user_handle.title()
        display_name = f"{name_for_display}'s Assistant"

    # Create identity
    identity = AgcomIdentity(
        user_handle=user_handle,
        assistant_handle=derive_assistant_handle(user_handle),
        display_name=display_name,
    )

    # Save to .env file
    save_identity_to_env(identity, env_file)

    logger.info(
        f"Configured identity: user={identity.user_handle}, "
        f"assistant={identity.assistant_handle}"
    )

    return identity
