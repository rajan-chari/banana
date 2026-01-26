"""
Pytest configuration and fixtures.

This module provides:
- Automatic agcom API server lifecycle management for integration tests
- Shared fixtures for test clients
"""

import os
import sys
import time
import subprocess
import tempfile
import atexit
import json
import urllib.request
import urllib.error
import socket
import pytest
from pathlib import Path


# Track server process globally for cleanup
_api_server_process = None
_test_api_url = None


def _find_free_port() -> int:
    """Find an available port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port


def _wait_for_api_server(url: str, timeout: int = 30) -> bool:
    """
    Wait for API server to be ready.

    Args:
        url: Base URL of the API server
        timeout: Maximum seconds to wait

    Returns:
        True if server is ready, False if timeout
    """
    start_time = time.time()
    health_url = f"{url}/api/health"  # Health endpoint is at /api/health

    while time.time() - start_time < timeout:
        try:
            req = urllib.request.Request(health_url, method="GET")
            with urllib.request.urlopen(req, timeout=2.0) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    if data.get("status") == "ok":
                        return True
        except (urllib.error.URLError, urllib.error.HTTPError, OSError):
            pass
        time.sleep(0.5)

    return False


def _cleanup_api_server():
    """Clean up API server process on exit."""
    global _api_server_process
    if _api_server_process is not None:
        try:
            _api_server_process.terminate()
            _api_server_process.wait(timeout=10)  # Give it time to shut down gracefully
        except subprocess.TimeoutExpired:
            try:
                _api_server_process.kill()
                _api_server_process.wait(timeout=5)  # Wait for kill to complete
            except Exception:
                pass
        except Exception:
            pass
        finally:
            _api_server_process = None
            # Give OS time to release file locks
            time.sleep(0.5)


@pytest.fixture(scope="session")
def api_server(request):
    """
    Start agcom API server for integration tests.

    This fixture:
    - Starts the API server in a subprocess
    - Waits for it to be healthy
    - Runs for the entire test session
    - Automatically shuts down after tests complete
    - Used by integration tests (NOT autouse, must be explicitly requested)
    - Automatically finds an available port if not specified
    """
    global _api_server_process, _test_api_url

    # Skip if explicitly disabled
    if os.getenv("SKIP_API_SERVER") == "1":
        yield
        return

    # Use temporary database for tests
    temp_dir = tempfile.gettempdir()
    db_path = os.path.join(temp_dir, f"agcom_test_{os.getpid()}.db")

    # Clean up old test database if it exists
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except Exception:
            pass

    # Get port: use env var if set, otherwise find a free port
    if os.getenv("AGCOM_API_URL"):
        api_url = os.getenv("AGCOM_API_URL")
        port = api_url.rstrip("/").split(":")[-1] if ":" in api_url else "8000"
    else:
        port = str(_find_free_port())
        api_url = f"http://localhost:{port}"

    # Store for api_url fixture
    _test_api_url = api_url

    # Start API server
    print(f"\n[TEST] Starting agcom API server on {api_url}")
    print(f"       Database: {db_path}")

    try:
        # Prepare environment variables for server
        server_env = os.environ.copy()
        server_env.update({
            "AGCOM_DB_PATH": db_path,
            "AGCOM_API_PORT": port,
            "AGCOM_API_HOST": "127.0.0.1",  # Use localhost for tests
            "AGCOM_API_RELOAD": "false",     # Disable reload in tests
        })

        # Run agcom-api command with test database
        _api_server_process = subprocess.Popen(
            [sys.executable, "-m", "agcom_api.main"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=server_env
        )

        # Register cleanup handler
        atexit.register(_cleanup_api_server)

        # Wait for server to be ready
        print(f"       Waiting for server to be ready...")
        if not _wait_for_api_server(api_url, timeout=30):
            # Server didn't start - capture output
            _api_server_process.terminate()
            stdout, stderr = _api_server_process.communicate(timeout=5)
            raise RuntimeError(
                f"API server failed to start within 30 seconds.\n"
                f"STDOUT: {stdout}\n"
                f"STDERR: {stderr}"
            )

        print(f"       API server ready at {api_url}\n")

        # Yield control to run tests
        yield

    finally:
        # Clean up server process
        print(f"\n[TEST] Shutting down API server...")
        _cleanup_api_server()

        # Clean up test database with retries
        if os.path.exists(db_path):
            for attempt in range(5):
                try:
                    os.remove(db_path)
                    print(f"       Cleaned up test database")
                    break
                except PermissionError as e:
                    if attempt < 4:
                        time.sleep(0.5)  # Wait for file lock to release
                    else:
                        print(f"       WARNING: Failed to clean up test database after 5 attempts: {e}")
                except Exception as e:
                    print(f"       WARNING: Failed to clean up test database: {e}")
                    break


@pytest.fixture(scope="session")
def api_url(api_server):
    """Get API URL for tests. Depends on api_server to ensure it's running."""
    global _test_api_url
    return _test_api_url or os.getenv("AGCOM_API_URL", "http://localhost:8000")


# Integration test marker configuration
def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers",
        "integration: marks tests as integration tests (require live API server)"
    )
