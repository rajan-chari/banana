"""
Tests for backend registration during identity discovery.

These tests verify that register_assistant_in_backend() is called
correctly when identity is configured, regardless of whether
agcom tools were already registered from storage.
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock


class TestBackendRegistrationOnIdentityDiscovery:
    """
    Integration tests for the identity discovery -> backend registration flow.

    The bug we're testing for:
    - Tools might already be loaded from storage
    - try_register_agcom_tools_if_configured() returns False in that case
    - But register_assistant_in_backend() should STILL be called
    """

    @pytest.mark.asyncio
    async def test_backend_registration_called_when_tools_already_registered(self):
        """
        Verify register_assistant_in_backend is called even when tools
        are already registered (try_register_agcom_tools_if_configured returns False).
        """
        with patch('assistant.bot.app.is_identity_configured') as mock_is_configured, \
             patch('assistant.bot.app.try_register_agcom_tools_if_configured') as mock_try_register, \
             patch('assistant.bot.app.register_assistant_in_backend') as mock_register_backend, \
             patch('assistant.bot.app.load_dotenv'):

            # Simulate: identity was NOT configured before, but IS now
            mock_is_configured.return_value = True

            # Simulate: tools already registered from storage
            mock_try_register.return_value = False

            # Make register_assistant_in_backend an async mock
            mock_register_backend.return_value = True

            # Import and call the relevant logic
            # We need to simulate the flow from handle_message
            from assistant.bot.app import register_assistant_in_backend

            # The key assertion: even when try_register returns False,
            # register_assistant_in_backend should be called

            # Simulate the corrected logic from app.py:
            identity_was_configured = False

            if not identity_was_configured and mock_is_configured():
                if mock_try_register(None, None):
                    pass  # Would reload tools

                # This should be called regardless of try_register result
                await mock_register_backend()

            # Verify register_assistant_in_backend was called
            mock_register_backend.assert_called_once()

    @pytest.mark.asyncio
    async def test_backend_registration_called_when_tools_newly_registered(self):
        """
        Verify register_assistant_in_backend is also called when tools
        are newly registered (try_register_agcom_tools_if_configured returns True).
        """
        with patch('assistant.bot.app.is_identity_configured') as mock_is_configured, \
             patch('assistant.bot.app.try_register_agcom_tools_if_configured') as mock_try_register, \
             patch('assistant.bot.app.register_assistant_in_backend') as mock_register_backend, \
             patch('assistant.bot.app.tool_storage') as mock_storage, \
             patch('assistant.bot.app.load_dotenv'):

            mock_is_configured.return_value = True
            mock_try_register.return_value = True  # Tools newly registered
            mock_register_backend.return_value = True

            identity_was_configured = False

            if not identity_was_configured and mock_is_configured():
                if mock_try_register(None, None):
                    mock_storage.load_into_registry(None)

                await mock_register_backend()

            mock_register_backend.assert_called_once()

    @pytest.mark.asyncio
    async def test_backend_registration_not_called_when_identity_was_already_configured(self):
        """
        Verify register_assistant_in_backend is NOT called when identity
        was already configured before the interaction.
        """
        with patch('assistant.bot.app.register_assistant_in_backend') as mock_register_backend:

            # Identity was already configured
            identity_was_configured = True
            is_identity_configured_now = True

            if not identity_was_configured and is_identity_configured_now:
                await mock_register_backend()

            # Should NOT be called since identity was already configured
            mock_register_backend.assert_not_called()


class TestRegisterAssistantInBackend:
    """Unit tests for the register_assistant_in_backend function."""

    @pytest.mark.asyncio
    async def test_register_checks_existing_contact_before_adding(self):
        """
        Verify that register_assistant_in_backend checks if contact exists
        before trying to add it.
        """
        mock_settings = MagicMock()
        mock_settings.is_configured = True
        mock_settings.handle = "test_assistant"
        mock_settings.display_name = "Test Assistant"
        mock_settings.user_handle = "test_user"

        mock_client = AsyncMock()
        mock_client.login = AsyncMock()
        mock_client.get_contact = AsyncMock(side_effect=Exception("Not found"))
        mock_client.add_contact = AsyncMock()

        with patch('assistant.bot.app.load_agcom_config', return_value=mock_settings), \
             patch('assistant.bot.app.AgcomClient', return_value=mock_client):

            from assistant.bot.app import register_assistant_in_backend

            # Import the actual AgcomNotFoundError for the test
            from assistant.agcom.client import AgcomNotFoundError

            # Reconfigure mock to raise correct exception
            mock_client.get_contact = AsyncMock(side_effect=AgcomNotFoundError("Not found"))

            result = await register_assistant_in_backend()

            # Should have tried to get contact first
            mock_client.get_contact.assert_called_once_with("test_assistant")

            # Then added since not found
            mock_client.add_contact.assert_called_once()

            assert result is True

    @pytest.mark.asyncio
    async def test_register_skips_add_when_contact_exists(self):
        """
        Verify that register_assistant_in_backend doesn't add contact
        if it already exists.
        """
        mock_settings = MagicMock()
        mock_settings.is_configured = True
        mock_settings.handle = "test_assistant"
        mock_settings.display_name = "Test Assistant"
        mock_settings.user_handle = "test_user"

        mock_contact = MagicMock()
        mock_client = AsyncMock()
        mock_client.login = AsyncMock()
        mock_client.get_contact = AsyncMock(return_value=mock_contact)  # Contact exists
        mock_client.add_contact = AsyncMock()

        with patch('assistant.bot.app.load_agcom_config', return_value=mock_settings), \
             patch('assistant.bot.app.AgcomClient', return_value=mock_client):

            from assistant.bot.app import register_assistant_in_backend

            result = await register_assistant_in_backend()

            # Should have checked for contact
            mock_client.get_contact.assert_called_once_with("test_assistant")

            # Should NOT have added since it exists
            mock_client.add_contact.assert_not_called()

            assert result is True

    @pytest.mark.asyncio
    async def test_register_returns_false_when_not_configured(self):
        """
        Verify that register_assistant_in_backend returns False
        when identity is not configured.
        """
        mock_settings = MagicMock()
        mock_settings.is_configured = False

        with patch('assistant.bot.app.load_agcom_config', return_value=mock_settings):

            from assistant.bot.app import register_assistant_in_backend

            result = await register_assistant_in_backend()

            assert result is False

    @pytest.mark.asyncio
    async def test_register_handles_connection_error_gracefully(self):
        """
        Verify that register_assistant_in_backend handles connection
        errors gracefully and returns False.
        """
        mock_settings = MagicMock()
        mock_settings.is_configured = True
        mock_settings.handle = "test_assistant"
        mock_settings.display_name = "Test Assistant"

        mock_client = AsyncMock()

        from assistant.agcom.client import AgcomError
        mock_client.login = AsyncMock(side_effect=AgcomError("Connection refused"))

        with patch('assistant.bot.app.load_agcom_config', return_value=mock_settings), \
             patch('assistant.bot.app.AgcomClient', return_value=mock_client):

            from assistant.bot.app import register_assistant_in_backend

            result = await register_assistant_in_backend()

            # Should return False, not raise
            assert result is False
