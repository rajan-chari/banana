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
