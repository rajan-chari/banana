"""Configuration management for the console application."""

import os
import json
from pathlib import Path
from typing import Optional
from platformdirs import user_config_dir


def get_config_dir() -> Path:
    """Get the configuration directory path.

    Uses platform-specific config directories:
    - Windows: %APPDATA%\\agcom
    - macOS: ~/Library/Application Support/agcom
    - Linux: ~/.config/agcom

    Returns:
        Path to config directory
    """
    return Path(user_config_dir('agcom', appauthor=False, roaming=True))


def get_config_file() -> Path:
    """Get the configuration file path.

    Returns:
        Path to config file (platform-specific agcom/config.json)
    """
    return get_config_dir() / "config.json"


def load_config() -> dict:
    """Load configuration from file or environment.

    Priority:
    1. Config file (platform-specific agcom/config.json)
    2. Environment variables (AGCOM_STORE, AGCOM_ME)

    Returns:
        Dictionary with config values
    """
    config = {}

    # Try loading from file
    config_file = get_config_file()
    if config_file.exists():
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
        except Exception:
            pass  # Ignore errors, will fall back to env vars

    # Override with environment variables if present
    if os.environ.get('AGCOM_STORE'):
        config['store'] = os.environ.get('AGCOM_STORE')
    if os.environ.get('AGCOM_ME'):
        config['me'] = os.environ.get('AGCOM_ME')

    return config


def save_config(store: Optional[str] = None, me: Optional[str] = None) -> None:
    """Save configuration to file.

    Args:
        store: Database path (None to keep existing)
        me: Agent handle (None to keep existing)
    """
    # Load existing config
    config = {}
    config_file = get_config_file()
    if config_file.exists():
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
        except Exception:
            pass

    # Update with new values
    if store is not None:
        config['store'] = store
    if me is not None:
        config['me'] = me

    # Create config directory if needed
    config_dir = get_config_dir()
    config_dir.mkdir(parents=True, exist_ok=True)

    # Save config
    with open(config_file, 'w') as f:
        json.dump(config, f, indent=2)


def clear_config() -> None:
    """Clear the configuration file."""
    config_file = get_config_file()
    if config_file.exists():
        config_file.unlink()


def get_config_value(key: str) -> Optional[str]:
    """Get a specific config value.

    Args:
        key: Configuration key ('store' or 'me')

    Returns:
        Configuration value or None if not found
    """
    config = load_config()
    return config.get(key)


def get_index_cache_file() -> Path:
    """Get the index cache file path.

    Returns:
        Path to index cache file (platform-specific agcom/index_cache.json)
    """
    return get_config_dir() / "index_cache.json"


def load_index_cache() -> dict:
    """Load index cache from file.

    Returns:
        Dictionary with thread_index and message_index mappings
    """
    cache_file = get_index_cache_file()
    if cache_file.exists():
        try:
            with open(cache_file, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {'thread_index': {}, 'message_index': {}}


def save_index_cache(thread_index: dict, message_index: dict) -> None:
    """Save index cache to file.

    Args:
        thread_index: Thread index mapping (int -> thread_id)
        message_index: Message index mapping (int -> message_id)
    """
    # Convert int keys to strings for JSON serialization
    cache = {
        'thread_index': {str(k): v for k, v in thread_index.items()},
        'message_index': {str(k): v for k, v in message_index.items()}
    }

    # Create config directory if needed
    config_dir = get_config_dir()
    config_dir.mkdir(parents=True, exist_ok=True)

    # Save cache
    cache_file = get_index_cache_file()
    with open(cache_file, 'w') as f:
        json.dump(cache, f, indent=2)
