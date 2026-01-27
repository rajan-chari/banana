# Banana Python

Local-first LLM assistant with agent communication capabilities.

## Packages

### agcom
Agent communication library with:
- Email-like messaging with threaded conversations
- Address book with role management
- Admin system with permissions
- Full CLI interface (`agcom` command)

**Quick Start:**
```bash
agcom init --store mydb.db --me alice
agcom send bob "Hello" "How are you?"
agcom screen
```

See [agcom/README.md](./agcom/README.md) for complete documentation.

### assistant
LLM assistant with:
- Teams SDK integration
- Script generation and execution
- Script-to-tool promotion
- Multi-agent communication via agcom

**Quick Start:**
```bash
my-assist
```

**With multi-agent team:**
```bash
# Terminal 1: Start API
agcom-api  # Runs on port 8700

# Terminal 2: Start agent team
agent-team start

# Terminal 3: Start assistant
my-assist
```

## Setup

### Quick Install

```bash
# Create virtual environment
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Unix

# Install with dev dependencies (includes testing tools)
pip install -e ".[dev]"
```

**What's included:**
- **Runtime**: assistant, agcom, agcom_api packages
- **Dev tools** (`[dev]`): pytest, pytest-asyncio, pytest-cov, coverage, black, ruff

**Note:** Dev dependencies are **required** for running tests with coverage. If you only need to run the application, you can omit `[dev]`, but pytest will fail without coverage tools.

## Commands

After installation, these commands are available:

```bash
# agcom - Agent communication CLI
agcom init --store mydb.db --me alice
agcom send bob "Subject" "Message"
agcom screen
agcom view 1
agcom reply 1 "Response"

# my-assist - LLM assistant
my-assist

# agcom-api - REST API server (if implemented)
agcom-api
```

## Multi-Agent Communication (agcom Integration)

The assistant integrates with agcom to enable multi-agent collaboration.

### Prerequisites

1. **agcom library installed** (included in this monorepo)
2. **agcom-api running** (REST API server)

```bash
# Install dependencies (if not already installed)
pip install -e ".[dev]"

# Start the API server
agcom-api
```

### Quick Start

**Terminal 1: Start agcom API**
```bash
cd python
agcom-api

# Server runs at http://localhost:8700
# API docs at http://localhost:8700/docs
```

**Terminal 2: Start agent team**
```bash
cd python
agent-team start
```

**Terminal 3: Start assistant**
```bash
cd python
my-assist
```

### Features

**Multi-Agent Messaging:**
- Send and receive messages with other agents
- Thread-based conversations
- Message search and history

**Contact Management:**
- Address book with agent handles
- Contact discovery and search
- Display names and descriptions

**LLM Integration:**
- 6 tools callable by LLM (send, inbox, search, reply, contacts, threads)
- Natural language: "Send bob a message about the project"
- Automatic tool invocation based on user intent

**Manual Control:**
- 7 slash commands for direct access
- `/agcom-send`, `/agcom-inbox`, `/agcom-threads`, etc.
- Power user features

### Usage Examples

**Natural Language (LLM):**
```
User: "Send alice a message: Project deployment is complete"
Assistant: ✅ Message sent to alice
           Subject: Project deployment is complete
           ID: msg_xyz789

User: "Check my messages"
Assistant: 📬 Inbox (3 messages)
           1. From: bob, Subject: Review request...

User: "Who can I message?"
Assistant: Found 3 contact(s):
           Handle: alice, Display Name: Alice Cooper...
```

**Slash Commands (Manual):**
```
/agcom-send bob "Subject" "Message body"
/agcom-inbox 10
/agcom-threads 5
/agcom-contacts
/agcom-reply msg_123 "Thanks for the update!"
/agcom-search "deployment"
/agcom-status
```

### Configuration

**Environment Variables:**
- `AGCOM_ENABLED` - Enable/disable integration (default: false)
- `AGCOM_API_URL` - API server URL (default: http://localhost:8700)
- `AGCOM_HANDLE` - Your agent handle (default: system username)
- `AGCOM_DISPLAY_NAME` - Display name shown to others (optional)
- `AGCOM_AUTO_LOGIN` - Auto-login on startup (default: true)
- `AGCOM_POLL_INTERVAL` - Polling interval in seconds (default: 30)

**Markdown Configuration:**

See `config/assistant.sample.md` for markdown-based configuration example.

### Documentation

- [assistant/agcom/README.md](./assistant/agcom/README.md) - Comprehensive integration guide
- [agcom/QUICKSTART.md](./agcom/QUICKSTART.md) - Get started with agcom in 60 seconds
- [agcom/README.md](./agcom/README.md) - Complete agcom guide
- [agcom/CHANGELOG.md](./agcom/CHANGELOG.md) - What's new in agcom

## Development

### Running Tests

```bash
# Run all tests
pytest

# Run unit tests only (fast)
pytest -m "not integration"

# Run integration tests (requires agcom-api running)
pytest -m integration

# Run tests with verbose output
pytest -v

# Run specific test file
pytest tests/test_agcom_client.py
```

### Test Coverage

The project uses **pytest-cov** for test coverage metrics.

```bash
# Run tests with coverage (generates HTML + terminal + JSON reports)
pytest

# Open HTML coverage report
start htmlcov/index.html  # Windows
open htmlcov/index.html   # Mac/Linux

# Run coverage with convenience script
python run_coverage.py            # All tests
python run_coverage.py --unit     # Unit tests only
python run_coverage.py --open     # Auto-open HTML report
python run_coverage.py --min 80   # Fail if coverage < 80%

# View coverage for specific package
pytest --cov=assistant.agcom --cov-report=html
```

**Coverage Reports:**
- **Terminal**: Displayed after test run
- **HTML**: Interactive report at `htmlcov/index.html`
- **JSON**: Machine-readable at `coverage.json`

**Coverage Targets:**
- Minimum: 70% overall
- Target: 80% overall
- Critical paths: 95%+

See [COVERAGE.md](./COVERAGE.md) for comprehensive coverage guide.

### Code Quality

```bash
# Format code
black .

# Lint code
ruff check .

# Type checking (if mypy installed)
mypy assistant/ agcom/ agcom_api/
```

## Project Structure

```
python/
├── agcom/              # Agent communication library
│   ├── console/        # CLI interface
│   ├── models.py       # Data models
│   ├── session.py      # Session management
│   └── storage.py      # SQLite operations
├── assistant/          # LLM assistant
│   └── main.py         # Main entry point
├── config/             # Configuration files
├── scripts/            # Generated scripts
├── tests/              # Test suite
└── pyproject.toml      # Project configuration
```
