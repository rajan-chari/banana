# Banana Workspace

A multi-project workspace containing independent, self-contained projects.

## Overview

This repository is organized as a **monorepo workspace** where each subdirectory contains a complete, independent project with its own dependencies, documentation, and build system.

## Projects

### 📬 [agcom2](./agcom2/)

**Agent Communication Library & REST API**

A Python library and REST API for multi-agent communication that emulates email-like messaging with threading, address book management, and SQLite persistence.

- **Type:** Python Library + REST API
- **Tech Stack:** Python 3.10+, SQLite, FastAPI, JWT
- **Features:** Email-like messaging, threaded conversations, address book, audit logging
- **Documentation:** [agcom2/README.md](./agcom2/README.md)

**Quick Start:**
```bash
cd agcom2
pip install -e .
pytest agcom/tests/ -v
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

## Workspace Structure

```
banana/
├── README.md           # This file
├── CLAUDE.md           # Guidance for Claude Code
├── agcom2/             # Agent Communication project
│   ├── README.md       # Project documentation
│   ├── CLAUDE.md       # Project-specific guidance
│   ├── agcom/          # Python library
│   ├── app/            # REST API
│   └── tests/          # Test suite
└── [future projects]/  # Additional projects
```

## Working with Projects

Each project is **fully independent**:

- **Separate dependencies** - Each project has its own `requirements.txt` or `pyproject.toml`
- **Independent builds** - Build and run each project separately
- **Isolated testing** - Each project has its own test suite
- **Own documentation** - Refer to each project's README.md for details

### General Pattern

```bash
# Navigate to project
cd <project-name>

# Read project documentation
cat README.md

# Follow project-specific setup
# (varies by project)
```

## Projects Index

| Project | Type | Status | Description |
|---------|------|--------|-------------|
| [agcom2](./agcom2/) | Python Library + API | ✅ Active | Multi-agent communication system |

## Adding New Projects

To add a new project to this workspace:

1. Create a directory at workspace root: `mkdir <project-name>`
2. Add complete project with its own:
   - README.md (project documentation)
   - CLAUDE.md (development guidance)
   - Source code and dependencies
   - Build and test configurations
3. Update this README to list the new project
4. Maintain project independence (no shared dependencies)

## Development

### Prerequisites

- Each project lists its own prerequisites in its README
- No workspace-level dependencies

### Getting Started

1. **Choose a project** from the list above
2. **Navigate** to the project directory: `cd <project-name>`
3. **Read documentation** in the project's README.md
4. **Follow setup** instructions specific to that project

## Documentation

- **Workspace Level:**
  - `README.md` (this file) - Workspace overview and project index
  - `CLAUDE.md` - Guidance for Claude Code when working in this workspace

- **Project Level:**
  - Each project has its own `README.md` with usage documentation
  - Each project has its own `CLAUDE.md` with development guidance

## License

See individual project directories for license information.

## Contributing

Contributions should be made to individual projects. Refer to each project's documentation for contribution guidelines.

---

For detailed information about a specific project, navigate to its directory and read its README.md file.
