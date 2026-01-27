"""
Configuration for agcom REST API client.

Settings loaded from environment variables with sensible defaults.
"""

import os
from dataclasses import dataclass


@dataclass
class AgcomSettings:
    """Configuration settings for agcom integration."""

    enabled: bool = True
    api_url: str = "http://localhost:8700"
    handle: str = ""
    user_handle: str = ""
    display_name: str | None = None
    auto_login: bool = True
    poll_interval_seconds: int = 30
    is_configured: bool = False


def load_agcom_config() -> AgcomSettings:
    """
    Load agcom configuration from environment variables.

    Requires identity to be configured via AGCOM_USER_HANDLE.
    If identity is not configured, returns disabled settings.

    Environment variables:
        AGCOM_USER_HANDLE: User's agcom handle (required for configuration)
        AGCOM_HANDLE: Assistant's handle (auto-derived if not set)
        AGCOM_ENABLED: Enable/disable agcom integration (default: true)
        AGCOM_API_URL: Base URL for agcom API (default: http://localhost:8700)
        AGCOM_DISPLAY_NAME: Display name for agent (optional)
        AGCOM_AUTO_LOGIN: Auto-login on first request (default: true)
        AGCOM_POLL_INTERVAL: Polling interval in seconds (default: 30)

    Returns:
        AgcomSettings with values from environment or defaults.
        If identity not configured, returns disabled settings.
    """
    from .identity import is_identity_configured, load_identity

    # Check if identity is configured
    if not is_identity_configured():
        # Not configured yet - return disabled settings
        return AgcomSettings(
            enabled=False,
            is_configured=False,
        )

    # Load identity from environment
    identity = load_identity()
    if not identity:
        # Should not happen if is_identity_configured() returned True
        # but handle gracefully
        return AgcomSettings(
            enabled=False,
            is_configured=False,
        )

    # Return fully configured settings
    return AgcomSettings(
        enabled=os.getenv("AGCOM_ENABLED", "true").lower() in ("true", "1", "yes"),
        api_url=os.getenv("AGCOM_API_URL", "http://localhost:8700"),
        handle=identity.assistant_handle,
        user_handle=identity.user_handle,
        display_name=identity.display_name,
        auto_login=os.getenv("AGCOM_AUTO_LOGIN", "true").lower() in ("true", "1", "yes"),
        poll_interval_seconds=int(os.getenv("AGCOM_POLL_INTERVAL", "30")),
        is_configured=True,
    )
