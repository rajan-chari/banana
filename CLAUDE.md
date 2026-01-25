# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **workspace repository** containing multiple independent projects. Each project has its own directory with complete source code, documentation, and CLAUDE.md file.

## Workspace Structure

```
banana/                  (workspace root)
├── CLAUDE.md           (this file - workspace-level guidance)
├── agcom2/             (Agent Communication library and REST API)
│   ├── CLAUDE.md       (project-specific guidance)
│   ├── agcom/          (Python library)
│   ├── app/            (REST API)
│   └── ...
└── [future projects]/  (additional projects will be added here)
```

## Working with This Workspace

### When Starting Work

1. **Identify the target project** - Each subdirectory is an independent project
2. **Navigate to the project directory** - `cd <project-name>`
3. **Read the project's CLAUDE.md** - Each project has its own detailed guidance
4. **Follow project-specific setup** - Build, test, and run commands are project-specific

### Project Independence

- Each project is **self-contained** with its own:
  - Dependencies and virtual environments
  - Build and test commands
  - Documentation
  - Configuration files
  - Version control practices (potentially)

- Projects **do not share code** unless explicitly designed to do so
- Each project should be treated as a separate codebase

## Current Projects

### agcom2
**Type:** Python Library + REST API
**Purpose:** Multi-agent communication system with email-like messaging, threading, and address book
**Tech Stack:** Python 3.10+, SQLite, FastAPI, JWT authentication
**Entry Point:** `cd agcom2 && cat CLAUDE.md`

**Quick Commands:**
```bash
cd agcom2
pip install -e .
pytest agcom/tests/ -v
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

## Adding New Projects

When adding a new project to this workspace:

1. Create a new directory at the workspace root: `mkdir <project-name>`
2. Add a `CLAUDE.md` file in the project directory with project-specific guidance
3. Include project setup, build, test, and run commands
4. Document the project's purpose, architecture, and key constraints
5. Update this workspace-level CLAUDE.md to list the new project

## Navigation

To work on a specific project:

1. Navigate to project directory: `cd <project-name>`
2. Read project documentation: `cat CLAUDE.md` or `cat README.md`
3. Follow project-specific setup instructions

## Workspace-Level Guidelines

- **No shared dependencies** - Each project manages its own dependencies
- **No workspace-level build** - Build each project independently
- **Independent testing** - Each project has its own test suite
- **Project-specific documentation** - Always read the project's CLAUDE.md first
- **Isolation** - Changes in one project should not affect others

## Common Patterns

When working across multiple projects in this workspace:

1. **Always check which directory you're in** before running commands
2. **Use project-specific virtual environments** (e.g., `agcom2/venv/`)
3. **Read project documentation first** - don't assume commands work across projects
4. **Test in isolation** - test one project at a time
5. **Document cross-project dependencies** if they exist (currently none)

## Future Expansion

As this workspace grows:

- Keep projects logically separated
- Consider adding a workspace README.md with project index
- Document any cross-project relationships or shared infrastructure
- Maintain independent versioning per project
