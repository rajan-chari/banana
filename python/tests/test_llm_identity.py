"""Tests for LLM identity context injection."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock


class TestIdentityContext:
    """Test identity context is properly injected into LLM calls."""

    def test_identity_context_format(self):
        """Test identity context string format."""
        identity = {
            "handle": "rajan_assistant",
            "user_handle": "rajan",
            "display_name": "Rajan's Assistant",
        }

        # Build context the same way chat() does
        identity_context = f"""[CONTEXT: You are {identity.get('display_name', identity.get('handle', 'an assistant'))} (handle: {identity.get('handle', 'unknown')}), assistant for {identity.get('user_handle', 'unknown')}. When listing contacts/agents, DO NOT list yourself - you ARE {identity.get('handle')}.]

"""
        user_message = "any agents?"
        message_with_context = identity_context + user_message

        assert "Rajan's Assistant" in message_with_context
        assert "rajan_assistant" in message_with_context
        assert "rajan" in message_with_context
        assert "DO NOT list yourself" in message_with_context
        assert "any agents?" in message_with_context

    def test_identity_context_without_display_name(self):
        """Test identity context when display_name is missing."""
        identity = {
            "handle": "bob_assistant",
            "user_handle": "bob",
            "display_name": None,
        }

        identity_context = f"""[CONTEXT: You are {identity.get('display_name') or identity.get('handle', 'an assistant')} (handle: {identity.get('handle', 'unknown')}), assistant for {identity.get('user_handle', 'unknown')}. When listing contacts/agents, DO NOT list yourself - you ARE {identity.get('handle')}.]

"""
        # Should fall back to handle when display_name is None
        assert "bob_assistant" in identity_context

    def test_no_identity_no_context(self):
        """Test that no identity means no context prefix."""
        identity = None
        user_message = "hello"

        # Simulate chat() logic
        message_with_context = user_message
        if identity:
            identity_context = f"[CONTEXT: ...]"
            message_with_context = identity_context + user_message

        assert message_with_context == "hello"
        assert "[CONTEXT:" not in message_with_context


class TestChatWithIdentity:
    """Test chat function with identity parameter."""

    @pytest.mark.asyncio
    async def test_chat_passes_identity_to_message(self):
        """Test that chat() prepends identity context to message."""
        from assistant.llm.client import chat

        identity = {
            "handle": "test_assistant",
            "user_handle": "testuser",
            "display_name": "Test Assistant",
        }

        # Mock the agent's run method to capture what message it receives
        captured_message = None

        async def mock_run(message, deps=None):
            nonlocal captured_message
            captured_message = message
            # Return a mock result
            mock_output = MagicMock()
            mock_output.output = MagicMock(
                message="test response",
                should_execute_script=False,
                script_code=None,
                script_description=None,
            )
            return mock_output

        with patch("assistant.llm.client.assistant_agent") as mock_agent:
            # Setup mock
            mock_agent.override.return_value.__enter__ = MagicMock(return_value=mock_agent)
            mock_agent.override.return_value.__exit__ = MagicMock(return_value=False)
            mock_agent.run = mock_run

            await chat(
                user_message="list agents",
                user_id="user1",
                conversation_id="conv1",
                model="openai:gpt-4o",
                identity=identity,
            )

        # Verify identity context was prepended
        assert captured_message is not None
        assert "[CONTEXT:" in captured_message
        assert "test_assistant" in captured_message
        assert "Test Assistant" in captured_message
        assert "list agents" in captured_message

    @pytest.mark.asyncio
    async def test_chat_without_identity(self):
        """Test that chat() works without identity."""
        from assistant.llm.client import chat

        captured_message = None

        async def mock_run(message, deps=None):
            nonlocal captured_message
            captured_message = message
            mock_output = MagicMock()
            mock_output.output = MagicMock(
                message="test response",
                should_execute_script=False,
                script_code=None,
                script_description=None,
            )
            return mock_output

        with patch("assistant.llm.client.assistant_agent") as mock_agent:
            mock_agent.override.return_value.__enter__ = MagicMock(return_value=mock_agent)
            mock_agent.override.return_value.__exit__ = MagicMock(return_value=False)
            mock_agent.run = mock_run

            await chat(
                user_message="hello",
                user_id="user1",
                conversation_id="conv1",
                model="openai:gpt-4o",
                identity=None,
            )

        # Verify no context prefix
        assert captured_message == "hello"
        assert "[CONTEXT:" not in captured_message
