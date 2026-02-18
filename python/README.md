# Banana Python

Local-first LLM assistant with agent communication capabilities.

## Setup

```bash
cd python
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Unix
pip install -e ".[dev]"
```

**What's included:**
- **Runtime**: assistant, agcom, agcom_api packages
- **Dev tools** (`[dev]`): pytest, pytest-asyncio, pytest-cov, coverage, black, ruff

## Commands

```bash
# Assistant
my-assist                       # Start LLM assistant

# Agent team (requires agcom-api running)
agcom-api                       # REST API server (port 8700)
agent-team start                # Start all 6 agents

# agcom CLI
agcom init --store db.db --me alice
agcom send bob "Subject" "Body"
agcom screen
```

## Development

```bash
# Tests
pytest tests/ -v                # All tests
pytest -m "not integration"     # Unit tests only (no server needed)
pytest -m integration           # Integration tests (requires agcom-api)

# Coverage (configured in pyproject.toml)
pytest                          # Runs with coverage by default
start htmlcov/index.html        # Open HTML report (Windows)

# Code quality
black .
ruff check .
```

## agcom Integration

The assistant integrates with agcom for multi-agent collaboration via REST API.

**Environment variables:**
- `AGCOM_ENABLED` — Enable integration (default: false)
- `AGCOM_API_URL` — API server URL (default: http://localhost:8700)
- `AGCOM_HANDLE` — Your agent handle
- `AGCOM_DISPLAY_NAME` — Display name (optional)
- `AGCOM_AUTO_LOGIN` — Auto-login on startup (default: true)
- `AGCOM_POLL_INTERVAL` — Polling interval in seconds (default: 30)

**LLM tools (6):** send, inbox, threads, search, contacts, reply
**Slash commands (7):** `/agcom-send`, `/agcom-inbox`, `/agcom-threads`, `/agcom-contacts`, `/agcom-reply`, `/agcom-search`, `/agcom-status`

## Project Structure

```
python/
├── agcom/              # Agent communication library
│   ├── console/        # CLI interface
│   ├── models.py       # Data models
│   ├── session.py      # Session management
│   └── storage.py      # SQLite operations
├── agcom_api/          # REST API server (FastAPI)
│   ├── routers/        # API endpoints
│   └── main.py         # Entrypoint
├── assistant/          # LLM assistant
│   ├── agents/         # Multi-agent team (EM, Coder, Runner, etc.)
│   ├── agcom/          # agcom REST client + LLM tools
│   ├── bot/            # Teams bot integration
│   ├── llm/            # LLM client (PydanticAI)
│   ├── permissions/    # Permission system
│   ├── scripts/        # Script generation & execution
│   └── tools/          # Tool registry & promotion
├── tests/              # Test suite
└── pyproject.toml      # Project configuration
```
