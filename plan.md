# Implementation Plan

> **Source**: [specs.md](specs.md)  
> **Last Updated**: 2026-01-23

This plan breaks down the project into phases with actionable tasks. See [progress.md](progress.md) for execution status.

---

## Phase 1: Project Setup & Teams SDK Integration ✅

**Goal**: Get a basic assistant running with Teams SDK DevTools interface.

**Status**: Complete

### Tasks

1.1. **Initialize Python project structure** ✅
   - Create project directory layout under `python/` (for multi-language support)
   - Package: `assistant/` with submodules: `bot/`, `llm/`, `scripts/`, `tools/`, `permissions/`
   - Set up `pyproject.toml` with hatchling build system
   - Create virtual environment

1.2. **Install Teams SDK dependencies** ✅
   - Install `microsoft-teams-ai` v2 package (2.0.0a8)
   - Install `microsoft-teams-devtools` for local testing

1.3. **Create basic bot scaffold** ✅
   - Implement minimal Teams bot that responds to messages
   - Test with DevTools

1.4. **Verify DevTools connection** ✅
   - Confirmed bot receives and responds to messages via DevTools
   - HTTP server: http://localhost:3978
   - DevTools: http://localhost:3979/devtools

---

## Phase 2: LLM Integration ✅

**Goal**: Connect the assistant to an LLM backend for generating responses.

**Status**: Complete

### Tasks

2.1. **Choose LLM provider** ✅
   - Decision: **PydanticAI** as the LLM abstraction layer
   - Supports: OpenAI, Azure OpenAI, Anthropic, Ollama (local), Groq
   - Chosen for: type-safe outputs, native tool support, agent patterns

2.2. **Implement LLM client** ✅
   - Created `assistant/llm/client.py` with PydanticAI agent
   - Structured `AssistantResponse` with message + optional script
   - Config via environment variables

2.3. **Integrate LLM with bot** ✅
   - Bot routes all messages through LLM
   - Displays generated scripts with code blocks
   - Error handling for provider issues

2.4. **Create Markdown config file** ✅
   - Updated `.env.sample` with all provider options
   - Updated `assistant.sample.md` with LLM section

2.2. **Implement LLM client**
   - Create abstraction layer for LLM calls
   - Support prompt → response flow

2.3. **Integrate LLM with bot**
   - Route user messages through LLM
   - Return LLM responses to user

2.4. **Create Markdown config file**
   - Define config schema (natural language format)
   - Include LLM settings, environment settings

---

## Phase 3: Script Generation & Execution

**Goal**: Enable the assistant to generate and run Python scripts locally.

### Tasks

3.1. **Implement script generator**
   - LLM generates Python scripts based on user requests
   - Scripts saved to designated directory

3.2. **Implement script executor**
   - Run scripts in subprocess
   - Capture stdout, stderr, return code
   - Implement timeout handling

3.3. **Add execution sandboxing**
   - Path restrictions
   - Resource limits (memory, time)
   - Environment isolation

3.4. **Return results to user**
   - Format script output for display
   - Handle errors gracefully

---

## Phase 4: Permission System

**Goal**: Gate sensitive operations with configurable permissions.

### Tasks

4.1. **Define permission categories**
   - File operations (read/write/delete)
   - Shell commands
   - Package installation
   - Network access
   - Secrets access

4.2. **Implement permission checker**
   - Parse Markdown config for permission rules
   - Check operations against rules before execution

4.3. **Implement confirmation flow**
   - For operations requiring user approval
   - Integrate with Teams DevTools UI

4.4. **Add audit logging**
   - Log all permission checks and decisions
   - Log sensitive operation executions

---

## Phase 5: Tool Registration & Promotion

**Goal**: Allow scripts to be promoted to reusable tools.

### Tasks

5.1. **Design tool registry**
   - Storage format for tool definitions
   - Tool metadata (name, description, parameters, source script)

5.2. **Implement tool storage**
   - File-based or SQLite storage
   - CRUD operations for tools

5.3. **Create promotion workflow**
   - User command to promote script to tool
   - Validation before promotion
   - Registration in tool library

5.4. **Implement tool invocation**
   - Assistant can discover registered tools
   - LLM can decide when to use tools
   - Execute tool and return results

5.5. **Add tool management commands**
   - List tools
   - View tool details
   - Delete/disable tools

---

## Phase 6: agcom REST API Integration ✅ (3/5 Complete)

**Goal**: Integrate agcom multi-agent communication system with the assistant.

**Status**: In Progress (Phases 1-3 Complete, 4-5 In Progress)

### Tasks

6.1. **Core client layer** ✅
   - Implement `AgcomClient` with async REST API methods
   - Support all agcom operations: messages, threads, contacts, audit
   - Retry logic with exponential backoff
   - Auto-login and session management
   - **Delivered**: 1,082 lines in `assistant/agcom/client.py`

6.2. **Tool integration** ✅
   - Register agcom tools with tool registry
   - Create LLM-callable tool wrappers
   - Tools: send, list messages, list threads, search, contacts, reply
   - **Delivered**: 6 tools, 290 lines in `assistant/agcom/tools.py`

6.3. **Slash commands** ✅
   - Add bot commands for agcom operations
   - Commands: `/agcom-send`, `/agcom-inbox`, `/agcom-threads`, `/agcom-contacts`, `/agcom-reply`, `/agcom-search`, `/agcom-status`
   - Integrate with bot help and routing
   - **Delivered**: 7 commands, 240 lines in `assistant/bot/app.py`

6.4. **Testing** 🟡
   - Unit tests for client methods
   - Integration tests with live API
   - Error case coverage
   - **Status**: In progress

6.5. **Documentation** 🟡
   - README with setup instructions
   - Configuration guide
   - Usage examples
   - **Status**: In progress

### Critical Bugs Fixed
- Fixed 4 response parsing bugs in `client.py` (incorrect JSON key access)

---

## Phase 7: Polish & Hardening

**Goal**: Make the system production-ready for handoff.

### Tasks

7.1. **Error handling review**
   - Ensure all error paths are handled
   - User-friendly error messages

7.2. **Logging & observability**
   - Structured logging throughout
   - Debug mode for troubleshooting

7.3. **Documentation**
   - Usage guide
   - Configuration reference
   - Developer guide for extending

7.4. **Testing**
   - Unit tests for core components
   - Integration tests for workflows

---

## Phase 8: Android Client (Future)

**Goal**: Mobile access to the assistant.

### Tasks

8.1. **Define API for remote access**
   - REST or WebSocket API
   - Authentication

8.2. **Build Android app**
   - Text input interface
   - Voice input with speech-to-text

8.3. **Connect to local assistant**
   - Network discovery or manual config
   - Secure connection

---

## Open Questions

> Track decisions needed here. Move to "Resolved" section when answered.

- [ ] Conversation history persistence requirements
- [ ] Phase 6: Should agcom integration be documented in main README or separate doc?

### Resolved

- [x] **LLM provider selection** → PydanticAI (supports OpenAI, Azure, Anthropic, Ollama, Groq)
- [x] **Tool promotion criteria** → User-confirmed, AST-based parameter detection (Phase 5.3)
- [x] **Storage backend for tools** → Hybrid SQLite metadata + file-based scripts (Phase 5.2)
- [x] **agcom integration approach** → REST API client + tool wrappers + slash commands (Phase 6)

---

## Dependencies

- Python 3.10+
- Teams SDK for Python
- LLM provider SDK (TBD)
