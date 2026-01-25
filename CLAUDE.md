# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **local-first LLM assistant** project with a language-based folder structure. Python code lives in `python/`, containing two packages: `agcom` (communication library) and `assistant` (LLM assistant with script-to-tool promotion).

## Workspace Structure

```
banana/
├── instructions.md     # Workflow guide - READ THIS FIRST
├── plan.md             # Implementation plan
├── progress.md         # Execution tracker
├── specs.md            # Requirements (source of truth)
├── CLAUDE.md           # This file - AI guidance
├── README.md           # Project overview
└── python/             # All Python code
    ├── agcom/          # Agent communication library
    ├── assistant/      # LLM assistant package
    ├── config/         # Configuration files
    ├── scripts/        # Generated scripts
    ├── tests/          # Test suite
    ├── data/           # Data files
    ├── appPackage/     # Teams app package
    └── pyproject.toml  # Python project config
```

## Workflow

1. **Start here** — Read `instructions.md`
2. **Check progress** — Open `progress.md` to see current state
3. **Consult the plan** — Open `plan.md` to understand next steps
4. **Do the work** — Implement the next incomplete task
5. **Update progress** — Mark completed items in `progress.md`

## Python Packages

### agcom
**Purpose:** Multi-agent communication system with email-like messaging, threading, and address book
**Tech Stack:** Python 3.10+, SQLite
**CLI:** Full-featured console interface with numbered indices and smart formatting
**Quick Start:** `agcom init --store db.db --me alice`

### assistant
**Purpose:** Local-first LLM assistant with script-to-tool promotion
**Tech Stack:** Python 3.10+, Teams SDK, LLM integration

## Quick Commands

```bash
cd python

# Setup
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -e ".[dev]"

# Run tests
pytest tests/ -v

# Run assistant
my-assist
```

## Guidelines

- **Follow the workflow** - Use instructions.md, plan.md, progress.md
- **Specs are source of truth** - Check specs.md for requirements
- **Python code in python/** - All code lives under the python/ directory
- **Update progress** - Mark tasks complete after finishing work
