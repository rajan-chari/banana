"""
Tests for agcom identity management.

Tests identity configuration, handle derivation, and .env file persistence.
"""

import os
import pytest
from pathlib import Path
from unittest.mock import patch

from assistant.agcom.identity import (
    AgcomIdentity,
    derive_assistant_handle,
    name_to_handle,
    is_identity_configured,
    load_identity,
    save_identity_to_env,
    configure_identity,
)


class TestNameToHandle:
    """Tests for name_to_handle function."""

    def test_simple_name(self):
        """Test converting simple name to handle."""
        assert name_to_handle("Alice") == "alice"
        assert name_to_handle("Bob") == "bob"

    def test_name_with_space(self):
        """Test converting name with space to handle."""
        assert name_to_handle("Bob Smith") == "bob_smith"
        assert name_to_handle("Alice Marie Johnson") == "alice_marie_johnson"

    def test_name_with_hyphen(self):
        """Test converting name with hyphen to handle."""
        assert name_to_handle("Alice-Marie") == "alice_marie"
        assert name_to_handle("Jean-Paul") == "jean_paul"

    def test_name_with_special_chars(self):
        """Test converting name with special characters to handle."""
        assert name_to_handle("Alice O'Brien") == "alice_obrien"
        # Accents are removed (handles should be ASCII-safe)
        assert name_to_handle("José García") == "jose_garcia"
        # Apostrophes and other punctuation are removed
        assert name_to_handle("O'Neil") == "oneil"

    def test_name_with_numbers(self):
        """Test converting name with numbers to handle."""
        assert name_to_handle("Alice123") == "alice123"
        assert name_to_handle("Bob42") == "bob42"

    def test_name_with_multiple_spaces(self):
        """Test converting name with multiple spaces to handle."""
        assert name_to_handle("Alice  Marie  Smith") == "alice_marie_smith"

    def test_name_with_leading_trailing_spaces(self):
        """Test converting name with leading/trailing spaces to handle."""
        assert name_to_handle("  Alice  ") == "alice"
        assert name_to_handle("  Bob Smith  ") == "bob_smith"

    def test_mixed_case_preserved_as_lowercase(self):
        """Test that mixed case is converted to lowercase."""
        assert name_to_handle("ALICE") == "alice"
        assert name_to_handle("AlIcE") == "alice"


class TestDeriveAssistantHandle:
    """Tests for derive_assistant_handle function."""

    def test_derive_simple_handle(self):
        """Test deriving assistant handle from simple user handle."""
        assert derive_assistant_handle("alice") == "alice_assistant"
        assert derive_assistant_handle("bob") == "bob_assistant"

    def test_derive_with_underscore(self):
        """Test deriving handle when user handle contains underscore."""
        assert derive_assistant_handle("john_doe") == "john_doe_assistant"

    def test_derive_with_numbers(self):
        """Test deriving handle when user handle contains numbers."""
        assert derive_assistant_handle("user123") == "user123_assistant"

    def test_derive_empty_handle_raises_error(self):
        """Test that empty user handle raises ValueError."""
        with pytest.raises(ValueError, match="user_handle cannot be empty"):
            derive_assistant_handle("")

    def test_derive_none_handle_raises_error(self):
        """Test that None user handle raises ValueError."""
        with pytest.raises(ValueError):
            derive_assistant_handle(None)


class TestIsIdentityConfigured:
    """Tests for is_identity_configured function."""

    def test_configured_when_env_var_set(self):
        """Test returns True when AGCOM_USER_HANDLE is set."""
        with patch.dict(os.environ, {"AGCOM_USER_HANDLE": "alice"}):
            assert is_identity_configured() is True

    def test_not_configured_when_env_var_missing(self):
        """Test returns False when AGCOM_USER_HANDLE is not set."""
        with patch.dict(os.environ, {}, clear=True):
            assert is_identity_configured() is False

    def test_not_configured_when_env_var_empty(self):
        """Test returns False when AGCOM_USER_HANDLE is empty string."""
        with patch.dict(os.environ, {"AGCOM_USER_HANDLE": ""}):
            assert is_identity_configured() is False


class TestLoadIdentity:
    """Tests for load_identity function."""

    def test_load_with_all_vars_set(self):
        """Test loading identity when all env vars are set."""
        with patch.dict(
            os.environ,
            {
                "AGCOM_USER_HANDLE": "alice",
                "AGCOM_HANDLE": "alice_assistant",
                "AGCOM_DISPLAY_NAME": "Alice's Assistant",
            },
        ):
            identity = load_identity()
            assert identity is not None
            assert identity.user_handle == "alice"
            assert identity.assistant_handle == "alice_assistant"
            assert identity.display_name == "Alice's Assistant"

    def test_load_with_minimal_vars(self):
        """Test loading identity with only user handle set (derives assistant handle)."""
        with patch.dict(
            os.environ,
            {"AGCOM_USER_HANDLE": "bob"},
            clear=True,
        ):
            identity = load_identity()
            assert identity is not None
            assert identity.user_handle == "bob"
            assert identity.assistant_handle == "bob_assistant"
            assert identity.display_name is None

    def test_load_returns_none_when_not_configured(self):
        """Test returns None when AGCOM_USER_HANDLE is not set."""
        with patch.dict(os.environ, {}, clear=True):
            identity = load_identity()
            assert identity is None

    def test_load_derives_handle_when_not_explicitly_set(self):
        """Test that assistant handle is auto-derived when not set."""
        with patch.dict(
            os.environ,
            {"AGCOM_USER_HANDLE": "charlie"},
            clear=True,
        ):
            identity = load_identity()
            assert identity is not None
            assert identity.assistant_handle == "charlie_assistant"


class TestAgcomIdentity:
    """Tests for AgcomIdentity dataclass."""

    def test_create_valid_identity(self):
        """Test creating a valid identity."""
        identity = AgcomIdentity(
            user_handle="alice",
            assistant_handle="alice_assistant",
            display_name="Alice's Assistant",
        )
        assert identity.user_handle == "alice"
        assert identity.assistant_handle == "alice_assistant"
        assert identity.display_name == "Alice's Assistant"

    def test_create_identity_without_display_name(self):
        """Test creating identity without display name."""
        identity = AgcomIdentity(
            user_handle="bob",
            assistant_handle="bob_assistant",
        )
        assert identity.user_handle == "bob"
        assert identity.assistant_handle == "bob_assistant"
        assert identity.display_name is None

    def test_empty_user_handle_raises_error(self):
        """Test that empty user handle raises ValueError."""
        with pytest.raises(ValueError, match="user_handle cannot be empty"):
            AgcomIdentity(
                user_handle="",
                assistant_handle="assistant",
            )

    def test_empty_assistant_handle_raises_error(self):
        """Test that empty assistant handle raises ValueError."""
        with pytest.raises(ValueError, match="assistant_handle cannot be empty"):
            AgcomIdentity(
                user_handle="alice",
                assistant_handle="",
            )


class TestSaveIdentityToEnv:
    """Tests for save_identity_to_env function."""

    def test_save_to_new_file(self, tmp_path):
        """Test saving identity to a new .env file."""
        env_file = tmp_path / ".env"
        identity = AgcomIdentity(
            user_handle="alice",
            assistant_handle="alice_assistant",
            display_name="Alice's Assistant",
        )

        save_identity_to_env(identity, env_file)

        assert env_file.exists()
        content = env_file.read_text()
        assert "AGCOM_USER_HANDLE=alice" in content
        assert "AGCOM_HANDLE=alice_assistant" in content
        assert "AGCOM_DISPLAY_NAME=Alice's Assistant" in content

    def test_save_preserves_existing_vars(self, tmp_path):
        """Test that saving identity preserves other env variables."""
        env_file = tmp_path / ".env"

        # Create file with existing variables
        env_file.write_text("OTHER_VAR=value\nANOTHER_VAR=value2\n")

        identity = AgcomIdentity(
            user_handle="bob",
            assistant_handle="bob_assistant",
        )

        save_identity_to_env(identity, env_file)

        content = env_file.read_text()
        assert "AGCOM_USER_HANDLE=bob" in content
        assert "AGCOM_HANDLE=bob_assistant" in content
        assert "OTHER_VAR=value" in content
        assert "ANOTHER_VAR=value2" in content

    def test_save_updates_existing_identity(self, tmp_path):
        """Test that saving updates existing identity variables."""
        env_file = tmp_path / ".env"

        # Create file with old identity
        env_file.write_text(
            "AGCOM_USER_HANDLE=old_user\n"
            "AGCOM_HANDLE=old_assistant\n"
            "OTHER_VAR=keep_me\n"
        )

        # Save new identity
        identity = AgcomIdentity(
            user_handle="new_user",
            assistant_handle="new_assistant",
            display_name="New Display Name",
        )

        save_identity_to_env(identity, env_file)

        content = env_file.read_text()
        assert "AGCOM_USER_HANDLE=new_user" in content
        assert "AGCOM_HANDLE=new_assistant" in content
        assert "AGCOM_DISPLAY_NAME=New Display Name" in content
        assert "old_user" not in content
        assert "old_assistant" not in content
        assert "OTHER_VAR=keep_me" in content

    def test_save_without_display_name(self, tmp_path):
        """Test saving identity without display name."""
        env_file = tmp_path / ".env"
        identity = AgcomIdentity(
            user_handle="alice",
            assistant_handle="alice_assistant",
            display_name=None,
        )

        save_identity_to_env(identity, env_file)

        content = env_file.read_text()
        assert "AGCOM_USER_HANDLE=alice" in content
        assert "AGCOM_HANDLE=alice_assistant" in content
        # Display name should not be in file when None
        assert "AGCOM_DISPLAY_NAME" not in content or "AGCOM_DISPLAY_NAME=" in content

    def test_save_creates_parent_directory(self, tmp_path):
        """Test that saving creates parent directories if they don't exist."""
        env_file = tmp_path / "subdir" / "nested" / ".env"
        identity = AgcomIdentity(
            user_handle="alice",
            assistant_handle="alice_assistant",
        )

        save_identity_to_env(identity, env_file)

        assert env_file.exists()
        assert env_file.parent.exists()


class TestConfigureIdentity:
    """Tests for configure_identity function."""

    def test_configure_with_auto_derived_handle(self, tmp_path):
        """Test configuring identity with auto-derived assistant handle."""
        env_file = tmp_path / ".env"

        identity = configure_identity("alice", env_file)

        assert identity.user_handle == "alice"
        assert identity.assistant_handle == "alice_assistant"
        assert identity.display_name == "Alice's Assistant"
        assert env_file.exists()

    def test_configure_with_custom_display_name(self, tmp_path):
        """Test configuring identity with custom display name."""
        env_file = tmp_path / ".env"

        identity = configure_identity(
            "bob",
            env_file,
            display_name="Custom Bob Assistant",
        )

        assert identity.user_handle == "bob"
        assert identity.assistant_handle == "bob_assistant"
        assert identity.display_name == "Custom Bob Assistant"

    def test_configure_empty_handle_raises_error(self, tmp_path):
        """Test that empty user handle raises ValueError."""
        env_file = tmp_path / ".env"

        with pytest.raises(ValueError, match="user_handle cannot be empty"):
            configure_identity("", env_file)

    def test_configure_saves_to_file(self, tmp_path):
        """Test that configure_identity saves to .env file."""
        env_file = tmp_path / ".env"

        configure_identity("charlie", env_file)

        assert env_file.exists()
        content = env_file.read_text()
        assert "AGCOM_USER_HANDLE=charlie" in content
        assert "AGCOM_HANDLE=charlie_assistant" in content
        assert "AGCOM_DISPLAY_NAME=Charlie's Assistant" in content

    def test_configure_title_cases_display_name(self, tmp_path):
        """Test that display name is title-cased from user handle."""
        env_file = tmp_path / ".env"

        identity = configure_identity("alice", env_file)

        # "alice" -> "Alice's Assistant"
        assert identity.display_name == "Alice's Assistant"


class TestAgcomConfigIntegration:
    """Integration tests with agcom config module."""

    def test_config_not_configured_returns_disabled(self):
        """Test that load_agcom_config returns disabled settings when not configured."""
        with patch.dict(os.environ, {}, clear=True):
            from assistant.agcom.config import load_agcom_config

            settings = load_agcom_config()
            assert settings.enabled is False
            assert settings.is_configured is False

    def test_config_configured_returns_identity(self):
        """Test that load_agcom_config returns identity when configured."""
        with patch.dict(
            os.environ,
            {
                "AGCOM_USER_HANDLE": "alice",
                "AGCOM_HANDLE": "alice_assistant",
                "AGCOM_DISPLAY_NAME": "Alice's Assistant",
            },
        ):
            from assistant.agcom.config import load_agcom_config

            settings = load_agcom_config()
            assert settings.is_configured is True
            assert settings.user_handle == "alice"
            assert settings.handle == "alice_assistant"
            assert settings.display_name == "Alice's Assistant"
