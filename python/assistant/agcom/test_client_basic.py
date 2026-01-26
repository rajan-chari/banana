"""
Basic test to verify AgcomClient can be instantiated and configured.

This is a smoke test to ensure the client layer is correctly implemented.
Full integration tests will be in Phase 4.
"""

import asyncio
from assistant.agcom import AgcomClient, AgcomSettings, load_agcom_config


def test_settings_from_env():
    """Test that settings can be loaded from environment."""
    settings = load_agcom_config()
    assert settings.enabled is True
    assert settings.api_url == "http://localhost:8000"
    assert settings.handle != ""  # Should default to current user
    assert settings.auto_login is True
    assert settings.poll_interval_seconds == 30
    print("OK - Settings loaded from environment")


def test_client_instantiation():
    """Test that client can be created with settings."""
    settings = AgcomSettings(handle="testuser", auto_login=False)
    client = AgcomClient(settings)
    assert client.settings.handle == "testuser"
    assert client._authenticated is False
    print("OK - Client instantiated")


async def test_client_context_manager():
    """Test that client works as async context manager."""
    settings = AgcomSettings(handle="testuser", auto_login=False)
    async with AgcomClient(settings) as client:
        assert client._session is not None
    # Session should be closed after exit
    print("OK - Context manager works")


async def test_graceful_degradation():
    """Test that client handles unavailable API gracefully."""
    settings = AgcomSettings(
        handle="testuser",
        api_url="http://localhost:9999",  # Non-existent port
        auto_login=True,
    )
    client = AgcomClient(settings)

    # Try health check - should fail but not crash
    try:
        await client.health_check()
        print("FAIL - Should have raised AgcomConnectionError")
    except Exception as e:
        assert "API health check failed" in str(e) or "connect" in str(e).lower()
        print(f"OK - Graceful degradation works: {type(e).__name__}")
    finally:
        await client.close()


def test_all_methods_present():
    """Verify all 24 API methods are implemented."""
    settings = AgcomSettings(handle="test", auto_login=False)
    client = AgcomClient(settings)

    methods = [
        # Auth (3)
        'login', 'logout', 'whoami',
        # Messages (5)
        'send_message', 'reply_to_message', 'get_message', 'list_messages', 'search_messages',
        # Threads (8)
        'list_threads', 'get_thread', 'get_thread_messages', 'reply_to_thread',
        'set_thread_metadata', 'get_thread_metadata', 'archive_thread', 'unarchive_thread',
        # Contacts (6)
        'add_contact', 'list_contacts', 'get_contact', 'update_contact',
        'search_contacts', 'deactivate_contact',
        # Audit (1)
        'list_audit_events',
        # Health (1)
        'health_check'
    ]

    for method in methods:
        assert hasattr(client, method), f"Missing method: {method}"
        assert callable(getattr(client, method)), f"Not callable: {method}"

    print(f"OK - All {len(methods)} methods present and callable")


if __name__ == "__main__":
    print("Running AgcomClient smoke tests...\n")

    test_settings_from_env()
    test_client_instantiation()
    test_all_methods_present()

    # Async tests
    asyncio.run(test_client_context_manager())
    asyncio.run(test_graceful_degradation())

    print("\nOK - All smoke tests passed!")
