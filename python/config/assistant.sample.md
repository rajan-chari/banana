# Assistant Configuration

This file configures the local LLM assistant using natural language.

---

## LLM Settings

### Provider
Use OpenAI as the default LLM provider.
- Provider: openai
- Model: gpt-4o
- Temperature: 0.7 for general tasks, 0.2 for code generation

### Alternative Providers
The assistant also supports:
- Azure OpenAI (for enterprise use)
- Anthropic Claude (for longer contexts)
- Ollama (for fully local/offline operation)
- Groq (for fast inference)

To use a local model, set the provider to "ollama" and ensure Ollama is running.

---

## Environment

### File Access

The assistant may:
- Read any file in my projects folder without asking
- Read files in my home directory after confirmation
- Never access system directories like C:\Windows or /etc

The assistant must ask before:
- Writing or modifying any file
- Deleting any file

### Script Execution

The assistant may:
- Run Python scripts it generates, but must show me the code first
- Run scripts in the approved tools list without confirmation

The assistant must ask before:
- Running shell commands
- Installing any packages
- Making network requests to external services

### Secrets

The assistant:
- May read environment variables for API keys
- Must never log or display secret values
- Must never send secrets to external services

---

## Directories

### Allowed Directories
- ~/projects — full access
- ~/Documents — read with confirmation, write with confirmation

### Forbidden Directories
- System directories
- Other users' home directories

---

## Tool Library

Tools are stored in: `~/.my-assist/tools/`

When promoting a script to a tool:
- Require my explicit approval
- Save a copy of the original script
- Generate a description automatically

---

## Logging

Log all assistant actions to: `~/.my-assist/logs/`
Keep logs for 30 days.
Log permission checks and decisions.

---

## Multi-Agent Communication (agcom)

Enable communication with other agents using the agcom REST API.

### Connection Settings
- **Enabled**: Yes
- **API URL**: http://localhost:8000
- **Agent Handle**: my-assistant
- **Display Name**: My Assistant
- **Auto-login**: Yes
- **Poll Interval**: 30 seconds

### Integration
- **Enable agcom tools**: Yes - LLM can send/receive messages
- **Enable slash commands**: Yes - Manual message control

### Features
The agcom integration provides:
- Multi-agent messaging with threaded conversations
- Address book for contact management
- Message search and history
- 6 LLM-callable tools (send, inbox, search, reply, contacts, threads)
- 7 slash commands for manual control

### Usage
Once configured, you can:
- Say: "Send bob a message about the project"
- Use: `/agcom-send bob "Subject" "Message body"`
- Ask: "Check my messages" or "Who can I message?"

### Requirements
- agcom library installed
- agcom-api server running (start with: `agcom-api`)
- Shared database with CLI or other agents
