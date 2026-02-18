# Banana

A local-first LLM assistant with multi-agent team coordination.

## Overview

Three packages in `python/`:
- **agcom** — Agent communication library (email-like messaging, threading, address book)
- **agcom_api** — REST API server for agcom (FastAPI, 28 endpoints)
- **assistant** — LLM assistant with multi-agent team (EM, Coder, Runner, Planner, Reviewer, Security)

## Quick Start

```bash
cd python
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Unix
pip install -e ".[dev]"

# Run (3 terminals)
agcom-api           # Terminal 1: messaging backend (port 8700)
agent-team start    # Terminal 2: agent team
my-assist           # Terminal 3: assistant
```

## Documentation

| File | Purpose |
|------|---------|
| [python/README.md](./python/README.md) | Developer guide — setup, commands, testing |
| [python/agcom/README.md](./python/agcom/README.md) | agcom package documentation |
| [specs.md](./specs.md) | Project requirements |
| [progress.md](./progress.md) | Phase status and session logs |
