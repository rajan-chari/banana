# Session Log

Chronological record of Claude Code session actions. Append new entries at the bottom.

---

### 2026-02-18 — Session management system created

- Added mandatory on-load section to top of `CLAUDE.md` (read KB, check state, read log, greet user)
- Added self-improvement protocol to `CLAUDE.md` (continuous/inline updates, not deferred)
- Added logging requirement to `CLAUDE.md` (every action gets a dated LOG.md entry)
- Created `Claude-KB.md` with:
  - Prerequisite checks table (Python, venv, packages, servers)
  - 5 error message entries (GPT-5.2 loops, tool errors, .env visibility, stale DB, integration bugs)
  - Diagnostic commands section
  - 12 gotchas extracted from existing CLAUDE.md and project docs
  - 5 lessons learned entries from session logs
- Created `LOG.md` (this file)
- Pattern adapted from `fellow_scholars/teams-e2e` project

### 2026-02-18 — Md file restructuring (14 → 10 files, ~1700 lines removed)

- **CLAUDE.md**: Removed "Gotchas & Lessons Learned" section (moved to Claude-KB.md). CLAUDE.md is now instructions-only.
- **Claude-KB.md**: Absorbed gotchas from CLAUDE.md (organized into subsections: Environment, Code Style, LLM, Multi-Agent, Documentation). Absorbed SQLite performance notes from PERFORMANCE_NOTES.md.
- **README.md** (root): Slimmed from 108 → 35 lines. Removed duplicated package descriptions, just links to python/README.md.
- **python/README.md**: Slimmed from 282 → 85 lines. Removed bloated agcom integration section (95 lines) and coverage tutorial. Kept setup, commands, dev workflow, agcom env vars summary, project structure.
- **Deleted** `python/COVERAGE.md` (489 lines) — generic pytest-cov tutorial, not project knowledge
- **Deleted** `python/PERFORMANCE_NOTES.md` (88 lines) — absorbed into Claude-KB.md > Gotchas > SQLite Performance
- **Deleted** `python/agcom/QUICKSTART.md` (114 lines) — subset of agcom/README.md
- **Deleted** `python/assistant/agcom/README.md` (1001 lines) — over-documented internal layer
- Verified no stale references to deleted files remain
