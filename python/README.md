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

**Quick Start:**
```bash
my-assist
```

## Setup

```bash
# Create virtual environment
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Unix

# Install with dev dependencies
pip install -e ".[dev]"
```

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

## Documentation

- [agcom/QUICKSTART.md](./agcom/QUICKSTART.md) - Get started with agcom in 60 seconds
- [agcom/README.md](./agcom/README.md) - Complete agcom guide
- [agcom/CHANGELOG.md](./agcom/CHANGELOG.md) - What's new in agcom

## Development

```bash
# Run tests
pytest tests/ -v

# Format code
black .

# Lint code
ruff check .
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
