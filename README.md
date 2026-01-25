# Banana

A local-first LLM assistant with script-to-tool promotion capabilities.

## Overview

This project combines:
- **agcom** - Agent communication library with email-like messaging
- **assistant** - LLM assistant that can generate, run, and promote scripts to tools

## Quick Start

```bash
cd python

# Setup virtual environment
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Unix

# Install dependencies
pip install -e ".[dev]"

# Configure
cp .env.sample .env
cp config/assistant.sample.md config/assistant.md

# Run
my-assist
```

## Project Structure

```
banana/
├── instructions.md     # Workflow guide - START HERE
├── plan.md             # Implementation plan
├── progress.md         # Execution tracker
├── specs.md            # Requirements source of truth
├── CLAUDE.md           # AI assistant guidance
└── python/             # All Python code
    ├── agcom/          # Communication library
    ├── assistant/      # LLM assistant package
    ├── config/         # Configuration files
    ├── scripts/        # Generated scripts
    ├── tests/          # Test suite
    └── pyproject.toml  # Project config
```

## Workflow

This project uses a structured workflow:

1. **instructions.md** - How to work on this project
2. **specs.md** - What we're building (requirements)
3. **plan.md** - How we're building it (implementation plan)
4. **progress.md** - What's done and what's next

## Packages

### agcom
Multi-agent communication system with:
- Email-like messaging with numbered indices
- Threaded conversations
- Address book with role management
- Admin system with permissions
- Full-featured CLI (`agcom` command)
- SQLite persistence

Quick start:
```bash
agcom init --store mydb.db --me alice
agcom send bob "Hello" "How are you?"
agcom screen
```

See [python/agcom/README.md](./python/agcom/README.md) for full documentation.

### assistant
Local-first LLM assistant with:
- Teams SDK integration
- Script generation and execution
- Script-to-tool promotion
- Permission-controlled sensitive actions

## Development

```bash
cd python

# Run tests
pytest tests/ -v

# Format code
black .

# Lint
ruff check .
```

## Documentation

**Project Documentation:**
- [specs.md](./specs.md) - Full project requirements
- [instructions.md](./instructions.md) - Development workflow
- [python/README.md](./python/README.md) - Python-specific setup

**agcom Documentation:**
- [python/agcom/QUICKSTART.md](./python/agcom/QUICKSTART.md) - Get started in 60 seconds
- [python/agcom/README.md](./python/agcom/README.md) - Complete guide
- [python/agcom/CHANGELOG.md](./python/agcom/CHANGELOG.md) - Recent improvements
