# Test Suite

This directory contains the test suite for the my-assist project.

## Test Types

### Unit Tests
- `test_agcom_client.py`: Unit tests for the agcom REST API client (no server required)
- `test_api.py`: FastAPI endpoint tests using TestClient

### Integration Tests
- `test_agcom_integration.py`: Full end-to-end tests requiring a live API server

## Running Tests

### All Tests (Default)
```powershell
pytest
```

This will:
1. Automatically start an agcom API server on `localhost:8000`
2. Run all tests (unit + integration)
3. Automatically shut down the server
4. Generate coverage reports

### Unit Tests Only (Skip Integration)
```powershell
pytest -m "not integration"
```

### Integration Tests Only
```powershell
pytest -m integration
```

### Specific Test File
```powershell
pytest tests/test_agcom_client.py -v
```

### With Coverage
```powershell
pytest --cov=assistant --cov=agcom --cov=agcom_api
```

## Automatic Server Management

The `conftest.py` file provides a session-scoped fixture that:
- Starts the agcom API server before any integration tests run
- Uses a temporary test database (auto-cleaned after tests)
- Waits for the server to be healthy before proceeding
- Automatically shuts down the server after all tests complete
- Is transparent to tests (no manual setup required)

## Configuration

### Custom API URL
Set the `AGCOM_API_URL` environment variable:
```powershell
$env:AGCOM_API_URL = "http://localhost:9000"
pytest
```

### Skip Automatic Server
If you're running your own server:
```powershell
$env:SKIP_API_SERVER = "1"
pytest -m integration
```

## Test Database

Integration tests use a temporary database:
- Location: `$TEMP/agcom_test_<pid>.db`
- Automatically created before tests
- Automatically deleted after tests
- Isolated from your development database

## Troubleshooting

### Server fails to start
Check if port 8000 is already in use:
```powershell
netstat -ano | findstr :8000
```

### Tests timeout
The server waits 30 seconds to start. If tests timeout:
1. Check if the server started (look for startup messages)
2. Verify no firewall is blocking localhost
3. Try running the server manually: `agcom-api`

### Integration tests fail with connection errors
1. Ensure `SKIP_API_SERVER` is not set
2. Check server startup output for errors
3. Verify port is available
