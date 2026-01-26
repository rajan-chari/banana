"""
Configuration for agcom REST API client.

Settings loaded from environment variables with sensible defaults.
"""

import os
import getpass
from dataclasses import dataclass


@dataclass
class AgcomSettings:
    """Configuration settings for agcom integration."""

    enabled: bool = True
    api_url: str = "http://localhost:8700"
    handle: str = ""  # Default to current user
    display_name: str | None = None
    auto_login: bool = True
    poll_interval_seconds: int = 30

    def __post_init__(self):
        """Set default handle to current username if not provided."""
        if not self.handle:
            self.handle = getpass.getuser()


def load_agcom_config() -> AgcomSettings:
    """
    Load agcom configuration from environment variables.

    Environment variables:
        AGCOM_ENABLED: Enable/disable agcom integration (default: true)
        AGCOM_API_URL: Base URL for agcom API (default: http://localhost:8700)
        AGCOM_HANDLE: Agent handle for authentication (default: current user)
        AGCOM_DISPLAY_NAME: Display name for agent (optional)
        AGCOM_AUTO_LOGIN: Auto-login on first request (default: true)
        AGCOM_POLL_INTERVAL: Polling interval in seconds (default: 30)

    Returns:
        AgcomSettings with values from environment or defaults
    """
    return AgcomSettings(
        enabled=os.getenv("AGCOM_ENABLED", "true").lower() in ("true", "1", "yes"),
        api_url=os.getenv("AGCOM_API_URL", "http://localhost:8700"),
        handle=os.getenv("AGCOM_HANDLE", ""),
        display_name=os.getenv("AGCOM_DISPLAY_NAME"),
        auto_login=os.getenv("AGCOM_AUTO_LOGIN", "true").lower() in ("true", "1", "yes"),
        poll_interval_seconds=int(os.getenv("AGCOM_POLL_INTERVAL", "30")),
    )
