"""Tests for console configuration management."""

import json
import os
import pytest
from pathlib import Path
from unittest.mock import patch
from agcom.console.config import (
    get_config_dir,
    get_config_file,
    load_config,
    save_config,
    clear_config,
    get_config_value,
    get_index_cache_file,
    load_index_cache,
    save_index_cache,
)


class TestConfigPaths:
    """Tests for configuration path functions."""

    def test_get_config_dir_returns_path(self):
        """Test that get_config_dir returns a Path object."""
        config_dir = get_config_dir()
        assert isinstance(config_dir, Path)
        assert "agcom" in str(config_dir)

    def test_get_config_file_returns_path(self):
        """Test that get_config_file returns correct path."""
        config_file = get_config_file()
        assert isinstance(config_file, Path)
        assert config_file.name == "config.json"
        assert "agcom" in str(config_file.parent)

    def test_get_index_cache_file_returns_path(self):
        """Test that get_index_cache_file returns correct path."""
        cache_file = get_index_cache_file()
        assert isinstance(cache_file, Path)
        assert cache_file.name == "index_cache.json"
        assert "agcom" in str(cache_file.parent)

    @patch("agcom.console.config.user_config_dir")
    def test_platform_specific_paths(self, mock_user_config_dir):
        """Test that platformdirs is called with correct parameters."""
        mock_user_config_dir.return_value = "/mock/path"
        get_config_dir()
        mock_user_config_dir.assert_called_once_with("agcom", appauthor=False, roaming=True)


class TestConfigSaveLoad:
    """Tests for saving and loading configuration."""

    def test_save_and_load_config(self, tmp_path, monkeypatch):
        """Test saving and loading config."""
        # Mock config directory
        config_dir = tmp_path / "agcom"
        config_file = config_dir / "config.json"

        with patch("agcom.console.config.get_config_dir", return_value=config_dir):
            with patch("agcom.console.config.get_config_file", return_value=config_file):
                # Save config
                save_config(store="test.db", me="alice")

                # Verify file exists
                assert config_file.exists()

                # Load config
                config = load_config()
                assert config["store"] == "test.db"
                assert config["me"] == "alice"

    def test_save_config_creates_directory(self, tmp_path, monkeypatch):
        """Test that save_config creates directory if it doesn't exist."""
        config_dir = tmp_path / "agcom"
        config_file = config_dir / "config.json"

        assert not config_dir.exists()

        with patch("agcom.console.config.get_config_dir", return_value=config_dir):
            with patch("agcom.console.config.get_config_file", return_value=config_file):
                save_config(store="test.db", me="bob")

                assert config_dir.exists()
                assert config_file.exists()

    def test_save_config_partial_update(self, tmp_path):
        """Test updating only one config value."""
        config_dir = tmp_path / "agcom"
        config_file = config_dir / "config.json"

        with patch("agcom.console.config.get_config_dir", return_value=config_dir):
            with patch("agcom.console.config.get_config_file", return_value=config_file):
                # Save initial config
                save_config(store="old.db", me="alice")

                # Update only store
                save_config(store="new.db")

                # Load and verify
                config = load_config()
                assert config["store"] == "new.db"
                assert config["me"] == "alice"  # Should remain unchanged

    def test_load_config_nonexistent_file(self, tmp_path):
        """Test loading config when file doesn't exist."""
        config_file = tmp_path / "nonexistent.json"

        with patch("agcom.console.config.get_config_file", return_value=config_file):
            config = load_config()
            assert config == {}

    def test_load_config_invalid_json(self, tmp_path):
        """Test loading config with invalid JSON."""
        config_file = tmp_path / "config.json"
        config_file.write_text("invalid json")

        with patch("agcom.console.config.get_config_file", return_value=config_file):
            config = load_config()
            assert config == {}  # Should return empty dict on error


class TestEnvironmentVariables:
    """Tests for environment variable override."""

    def test_env_vars_override_file(self, tmp_path):
        """Test that environment variables override file config."""
        config_dir = tmp_path / "agcom"
        config_file = config_dir / "config.json"

        with patch("agcom.console.config.get_config_dir", return_value=config_dir):
            with patch("agcom.console.config.get_config_file", return_value=config_file):
                # Save config to file
                save_config(store="file.db", me="alice")

                # Set environment variables
                with patch.dict(os.environ, {"AGCOM_STORE": "env.db", "AGCOM_ME": "bob"}):
                    config = load_config()

                    # Env vars should override file
                    assert config["store"] == "env.db"
                    assert config["me"] == "bob"

    def test_env_vars_partial_override(self, tmp_path):
        """Test partial override from environment variables."""
        config_dir = tmp_path / "agcom"
        config_file = config_dir / "config.json"

        with patch("agcom.console.config.get_config_dir", return_value=config_dir):
            with patch("agcom.console.config.get_config_file", return_value=config_file):
                # Save config to file
                save_config(store="file.db", me="alice")

                # Only override store
                with patch.dict(os.environ, {"AGCOM_STORE": "env.db"}):
                    config = load_config()

                    assert config["store"] == "env.db"
                    assert config["me"] == "alice"  # From file


class TestConfigOperations:
    """Tests for config operations."""

    def test_clear_config(self, tmp_path):
        """Test clearing configuration."""
        config_dir = tmp_path / "agcom"
        config_file = config_dir / "config.json"

        with patch("agcom.console.config.get_config_dir", return_value=config_dir):
            with patch("agcom.console.config.get_config_file", return_value=config_file):
                # Create config
                save_config(store="test.db", me="alice")
                assert config_file.exists()

                # Clear config
                clear_config()
                assert not config_file.exists()

    def test_clear_config_nonexistent(self, tmp_path):
        """Test clearing config when file doesn't exist."""
        config_file = tmp_path / "nonexistent.json"

        with patch("agcom.console.config.get_config_file", return_value=config_file):
            # Should not raise error
            clear_config()

    def test_get_config_value(self, tmp_path):
        """Test getting specific config value."""
        config_dir = tmp_path / "agcom"
        config_file = config_dir / "config.json"

        with patch("agcom.console.config.get_config_dir", return_value=config_dir):
            with patch("agcom.console.config.get_config_file", return_value=config_file):
                # Save config
                save_config(store="test.db", me="alice")

                # Get specific values
                assert get_config_value("store") == "test.db"
                assert get_config_value("me") == "alice"
                assert get_config_value("nonexistent") is None


class TestIndexCache:
    """Tests for index cache functionality."""

    def test_save_and_load_index_cache(self, tmp_path):
        """Test saving and loading index cache."""
        config_dir = tmp_path / "agcom"
        cache_file = config_dir / "index_cache.json"

        with patch("agcom.console.config.get_config_dir", return_value=config_dir):
            with patch("agcom.console.config.get_index_cache_file", return_value=cache_file):
                # Save cache
                thread_index = {1: "thread-id-1", 2: "thread-id-2"}
                message_index = {1: "msg-id-1", 2: "msg-id-2"}
                save_index_cache(thread_index, message_index)

                # Verify file exists
                assert cache_file.exists()

                # Load cache
                cache = load_index_cache()
                assert cache["thread_index"] == {"1": "thread-id-1", "2": "thread-id-2"}
                assert cache["message_index"] == {"1": "msg-id-1", "2": "msg-id-2"}

    def test_load_index_cache_nonexistent(self, tmp_path):
        """Test loading index cache when file doesn't exist."""
        cache_file = tmp_path / "nonexistent.json"

        with patch("agcom.console.config.get_index_cache_file", return_value=cache_file):
            cache = load_index_cache()
            assert cache == {"thread_index": {}, "message_index": {}}

    def test_load_index_cache_invalid_json(self, tmp_path):
        """Test loading index cache with invalid JSON."""
        cache_file = tmp_path / "cache.json"
        cache_file.write_text("invalid json")

        with patch("agcom.console.config.get_index_cache_file", return_value=cache_file):
            cache = load_index_cache()
            assert cache == {"thread_index": {}, "message_index": {}}

    def test_index_cache_creates_directory(self, tmp_path):
        """Test that saving index cache creates directory."""
        config_dir = tmp_path / "agcom"
        cache_file = config_dir / "index_cache.json"

        assert not config_dir.exists()

        with patch("agcom.console.config.get_config_dir", return_value=config_dir):
            with patch("agcom.console.config.get_index_cache_file", return_value=cache_file):
                save_index_cache({1: "t1"}, {1: "m1"})

                assert config_dir.exists()
                assert cache_file.exists()

    def test_index_cache_int_keys_serialization(self, tmp_path):
        """Test that integer keys are properly serialized to strings."""
        config_dir = tmp_path / "agcom"
        cache_file = config_dir / "index_cache.json"

        with patch("agcom.console.config.get_config_dir", return_value=config_dir):
            with patch("agcom.console.config.get_index_cache_file", return_value=cache_file):
                # Save with int keys
                save_index_cache({1: "t1", 42: "t42"}, {1: "m1", 99: "m99"})

                # Read raw JSON
                with open(cache_file) as f:
                    data = json.load(f)

                # Keys should be strings in JSON
                assert "1" in data["thread_index"]
                assert "42" in data["thread_index"]
                assert "1" in data["message_index"]
                assert "99" in data["message_index"]
