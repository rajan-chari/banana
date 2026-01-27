# Banana

A local-first LLM assistant with multi-agent team coordination.

## Overview

This project combines:
- **agcom** - Agent communication library with email-like messaging
- **agcom_api** - REST API server for agent communication
- **assistant** - LLM assistant with multi-agent team (EM, Coder, Runner, etc.)

## Quick Start

```bash
cd python

# Setup
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -e ".[dev]"

# Configure
cp .env.sample .env

# Run (3 terminals)
agcom-api           # Terminal 1: messaging backend
agent-team start    # Terminal 2: agent team
my-assist           # Terminal 3: assistant
```

## Project Structure

```
banana/
├── CLAUDE.md           # AI assistant guidance
├── README.md           # This file
├── progress.md         # Status tracker
├── specs.md            # Requirements
└── python/
    ├── agcom/          # Communication library
    ├── agcom_api/      # REST API server
    ├── assistant/
    │   ├── agents/     # Multi-agent team
    │   ├── bot/        # Teams bot
    │   ├── llm/        # LLM client
    │   └── ...
    └── pyproject.toml
```

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
- Multi-agent team (EM coordinates Coder, Runner, Planner, Reviewer, Security)
- Teams SDK integration
- Script generation and execution
- Script-to-tool promotion

**Agent Team:**
```
User → Assistant → EM → Coder → Runner → EM → User
```

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
