```markdown
# Project Brief: Local LLM Assistant with Script-to-Tool Expansion (Python)

## Summary
We want to build a **local-first LLM-based assistant** in **Python** that runs on a user’s **computer** and can be accessed through multiple client interfaces (starting with desktop, later adding Android).

A defining feature of this system is that it can **generate scripts**, run them locally, and—after those scripts are proven reliable—**promote them into reusable tools** that become part of the assistant’s growing tool library.

The assistant must include a **natural-language configuration system** using a **Markdown file** to define its local execution environment and permission policies for sensitive tasks.

---

## Problem Statement
Traditional LLM assistants are either:
1. Cloud-hosted and unable to safely or directly access local system resources, or
2. Locally run but static—limited to a fixed set of pre-coded tools.

This project aims to build an assistant that is both:
- **Local-first** (runs on the user’s machine and can access local resources)
- **Incrementally extensible** (creates scripts and gradually upgrades them into first-class tools)

The challenge is to make this extensibility **safe, repeatable, and manageable**, so the assistant does not become insecure or unstable as it gains new capabilities.

---

## Goals

### 1) Local-First Assistant Runtime
- The core assistant process should run on the user’s **local computer**
- It should be able to access local resources such as:
  - files and folders
  - local scripting and execution environments
  - local developer tooling

### 2) Multi-Client Access
The assistant should be reachable from:
- **Computer client** (first priority / first milestone)
- **Android client** (later)

The Android client should support:
- **Text input**
- **Voice input** (speech-to-text transcription, then send to assistant)

### 3) Script Creation and Execution
The assistant should be able to:
- generate Python scripts on demand
- run those scripts locally in a controlled environment
- return outputs (text / logs / structured results)

### 4) Script-to-Tool Promotion
The assistant should support a lifecycle where:
- it generates a script to solve a task
- the user validates it works reliably
- the system then registers it as a reusable tool
- the assistant can call that tool in future sessions

This creates a self-expanding loop:
**Write script → test/use → approve → register tool → reuse tool**

### 5) Natural-Language Config & Permissioning
The system must include a configuration file that is:
- **Markdown**
- written in **natural language**
- used to define:
  - the local execution / scripting environment
  - permission settings for sensitive operations

This config should enable controlling risk boundaries without requiring code edits.

---

## Primary Interface (MVP)
For the first iteration, use **Teams SDK DevTools** as the primary interface for interacting with the assistant.

Reference:
- https://microsoft.github.io/teams-sdk/python/getting-started/quickstart

This will act as the initial host/interface layer for the assistant while the rest of the system is being developed.

---

## Key Requirements

### Functional Requirements
1. **Accept user instructions** and route them to an LLM.
2. **Generate scripts** to fulfill tasks.
3. **Run scripts locally** (in a sandboxed/controlled environment).
4. **Capture outputs** and return results to the user.
5. **Maintain a tool library** of promoted scripts.
6. **Allow the assistant to call tools** once registered.
7. **Support permissions / approvals** for sensitive actions.
8. **Use a Markdown natural-language config file** to control execution + permissions.

### Non-Functional Requirements
- **Safety-first**: local access must be guarded with permissions
- **Reliability**: promoted tools should remain stable across sessions
- **Extensibility**: easy to add new tools without rewriting core code
- **Portability**: the system should be runnable on a standard developer machine
- **Auditability**: logs should show what happened and why (especially for sensitive tasks)

---

## Sensitive Task Categories (Permission-Controlled)
The assistant should treat these as high-risk operations requiring explicit permission policy:

- Reading/modifying/deleting files
- Running shell commands or subprocesses
- Installing packages or modifying environments
- Accessing secrets / credentials / tokens
- Network calls to external endpoints
- Accessing restricted directories

The config file should be able to specify what is allowed, what requires confirmation, and what is forbidden.

---

## Deliverables Expected from Engineering Team

### Initial Deliverable (Computer-first MVP)
- A local Python-based assistant runtime with:
  - Teams SDK DevTools interface integration
  - ability to send prompts to an LLM
  - ability to generate and run scripts locally
  - basic permission gating
  - basic tool registration mechanism

### Later Deliverable (Android Client)
- Android client supporting:
  - typed text input
  - voice input (speech-to-text transcription)
  - sending user requests to the local assistant runtime

---

## Open Questions / Clarifications (for kickoff)
These are not decisions yet, but should be resolved early by the team:

1. **Tool registration policy**
   - What qualifies as “reliable enough” to promote a script to a tool?
   - Is the promotion user-confirmed only, or based on automated tests?

2. **Execution sandboxing**
   - Should scripts run in a subprocess?
   - Should there be path restrictions and resource limits?

3. **State & storage**
   - Where are tool definitions stored?
   - Where does conversation history live (if any)?

4. **LLM backend**
   - Which LLM provider is used initially (OpenAI, Azure OpenAI, local model, etc.)?
   - Should we support multiple backends?

5. **Permissions UX**
   - How are confirmations requested (CLI prompt, DevTools UI message, config rule)?

---

## Success Criteria
This project is successful when:

1. A user can interact with the assistant on their computer using Teams SDK DevTools.
2. The assistant can generate and run a local script to accomplish a real task.
3. The user can promote a working script into a named tool.
4. The assistant can later invoke that tool reliably.
5. Sensitive actions are guarded by a configurable permission policy in Markdown.
6. The system is clean enough to hand off to additional client development (Android next).

---
```
