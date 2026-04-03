# Claude Code Permission System — Complete Reference

*Source analysis by jade, 2026-04-02. All file references relative to claude-code-src.*

---

## 1. Permission Architecture

### Checking Flow

Every tool call goes through hasPermissionsToUseTool() (permissions.ts:473), which calls hasPermissionsToUseToolInner() (permissions.ts:1158). The sequence:

1. **Deny rules (entire tool)** — getDenyRuleForTool() -> immediate deny
2. **Ask rules (entire tool)** — getAskRuleForTool() -> force prompt
3. **Tool own checkPermissions()** — tool-specific logic (domain checks, path validation, etc.)
4. **Content-based deny/ask rules** — matches against tool input (e.g., Bash(rm:*), WebFetch(domain:evil.com))
5. **Content-based allow rules** — matches against tool input
6. **Safety checks** — bypass-immune checks (.git/, .claude/, .vscode/ paths)
7. **Permission mode** — bypassPermissions, acceptEdits, auto, etc.
8. **Fallback** — ask (prompt user)

### Result Types

| Behavior | Meaning | When |
|----------|---------|------|
| allow | Execute immediately | Rule matched, mode allows, or preapproved |
| deny | Block execution | Deny rule matched or safety violation |
| ask | Prompt user | No allow rule, ambiguous, or explicit ask rule |
| passthrough | Tool says no opinion | Converted to ask by the framework |

### Permission Modes

| Mode | Behavior |
|------|----------|
| default | Prompt for everything not explicitly allowed |
| acceptEdits | Auto-allow Edit/Write in working directory |
| bypassPermissions | Auto-allow all (except safety checks) |
| dontAsk | Convert ask to deny (headless/SDK mode) |
| plan | Like bypass but with hook support |
| auto | AI classifier decides (internal only) |

---

## 2. Rule Syntax

### Format

Rules in settings.json: "ToolName" or "ToolName(content)"

### Three matching types (shellRuleMatching.ts:25-184)

**Exact match:**
- "Bash(npm install)" matches only "npm install"

**Prefix match (legacy :* syntax):**
- "Bash(git:*)" matches "git commit", "git push", "git status"
- "Bash(npm run:*)" matches "npm run build", "npm run test"

**Wildcard match (* syntax):**
- "Bash(git * --force)" matches "git push --force", "git reset --force"
- "Edit(/src/**)" matches any file under /src/

Wildcards: * matches any characters. \* for literal asterisk. Trailing space+* is optional (git * matches bare git).

### Tool-specific content formats

| Tool | Content Format | Example |
|------|---------------|---------|
| Bash | Command text | Bash(git commit:*) |
| PowerShell | Command text | PowerShell(Get-Content:*) |
| WebFetch | domain:hostname | WebFetch(domain:example.com) |
| Edit/Write | File path | Edit(/src/**) |
| Read | File path | Read(/src/**) |
| Glob | Pattern | Glob(src/**) |
| Grep | Pattern | Grep(TODO) |
| MCP tools | Server+tool | mcp__servername__toolname |

### No-content rules (blanket)

- "WebFetch" — allow ALL WebFetch (any domain)
- "WebSearch" — allow ALL WebSearch
- "Bash" — allow ALL Bash commands (dangerous!)
- "Edit" — allow ALL file edits

---

## 3. Settings Layers

### File Locations (priority order, lowest to highest)

| Rank | Source | Path | Editable | Scope |
|------|--------|------|----------|-------|
| 1 | userSettings | ~/.claude/settings.json | Yes | Global |
| 2 | projectSettings | .claude/settings.json | Yes | Project (committed) |
| 3 | localSettings | .claude/settings.local.json | Yes | Project (gitignored) |
| 4 | flagSettings | --settings path CLI flag | No | Session |
| 5 | policySettings | Managed (see below) | No | Enterprise |

### Managed settings sources (first-source-wins within policySettings)

1. Remote API (highest)
2. macOS MDM plist / Windows HKLM registry
3. /etc/claude-code/managed-settings.json + drop-ins in /etc/claude-code/managed-settings.d/*.json
4. Windows HKCU registry (lowest)

### Merge behavior

- Arrays are concatenated and deduplicated across sources
- Objects are deep-merged (later overrides earlier)
- Policy settings use first-source-wins (only one policy source applies)
- allowManagedPermissionRulesOnly: true in policy ignores all user/project/local rules

### Settings JSON schema

```json
{
  "permissions": {
    "allow": ["ToolName", "ToolName(content)"],
    "deny": ["ToolName", "ToolName(content)"],
    "ask": ["ToolName", "ToolName(content)"],
    "defaultMode": "default|plan|bypassPermissions|acceptEdits|dontAsk|auto",
    "additionalDirectories": ["/path/to/dir"]
  }
}
```

---

## 4. All Tools and Their Permission Behavior

### Tools that commonly trigger prompts

| Tool | Name | isReadOnly | Common Trigger |
|------|------|-----------|----------------|
| Bash | Bash | Conditional | Non-allowlisted commands, cd+git, bare repo, CWD drift |
| PowerShell | PowerShell | Conditional | Same patterns as Bash |
| WebFetch | WebFetch | true | New/unknown domains |
| WebSearch | WebSearch | true | No allow rule configured |
| Edit | Edit | false | Any file edit without allow rule |
| Write | Write | false | Any file write without allow rule |
| Read | Read | true | Blocked device paths only |
| NotebookEdit | NotebookEdit | false | Notebook modifications |
| Glob | Glob | true | Rarely prompts |
| Grep | Grep | true | Rarely prompts |
| MCP tools | mcp__* | varies | No allow rule configured |

### Bash security gates (always trigger ask)

1. cd+git compound (bashPermissions.ts:2209): cd /path && git ... always asks
2. Bare repo detection (readOnlyValidation.ts:1930): CWD has HEAD+objects/+refs/ without .git/HEAD
3. CWD mismatch (readOnlyValidation.ts:1956): getCwd() !== getOriginalCwd() with sandbox enabled
4. Git-internal writes (readOnlyValidation.ts:1943): Command writes to hooks/, refs/, HEAD AND runs git
5. UNC paths (readOnlyValidation.ts:1903): Windows UNC paths (NTLM credential leak)

### Safety checks (bypass-immune, even in bypassPermissions mode)

- Writes to .git/ directory
- Writes to .claude/ directory
- Writes to .vscode/ directory

---

## 5. Common Patterns Causing Unnecessary Prompts

| # | Pattern | Cause | Fix |
|---|---------|-------|-----|
| 1 | cd && git chaining | bashPermissions.ts:2209 bare-repo attack prevention | Use git -C path instead |
| 2 | WebFetch to new domains | Domain not in preapproved list | Add "WebFetch" to permissions.allow |
| 3 | WebSearch prompts | Returns passthrough, framework converts to ask | Add "WebSearch" to permissions.allow |
| 4 | Heredoc in git commit | Complex command doesn't match simple prefix rules | Use "Bash(git:*)" wildcard |
| 5 | Git after any cd | CWD drift detection (getCwd() !== getOriginalCwd()) | Never use cd; use tool-specific flags |
| 6 | MCP tools always prompting | MCPTool returns passthrough | Add "mcp__servername__*" to permissions.allow |
| 7 | File edits outside project root | Path validation rejects | Add to permissions.additionalDirectories |

---

## 6. Recommended Configs

### Research agent (web-heavy, read-only)

```json
{
  "permissions": {
    "allow": [
      "WebFetch", "WebSearch", "Read", "Glob", "Grep",
      "Bash(git log:*)", "Bash(git diff:*)", "Bash(git status:*)",
      "Bash(git -C:*)", "Bash(curl:*)",
      "Bash(cat:*)", "Bash(ls:*)", "Bash(find:*)", "Bash(grep:*)"
    ]
  }
}
```

### SDK agent (git + file operations)

```json
{
  "permissions": {
    "allow": [
      "Read", "Edit", "Write", "Glob", "Grep",
      "Bash(git:*)", "Bash(npm:*)", "Bash(node:*)", "Bash(npx:*)",
      "Bash(pip:*)", "Bash(python:*)", "Bash(dotnet:*)", "Bash(make:*)",
      "Bash(cat:*)", "Bash(ls:*)", "Bash(find:*)", "Bash(mkdir:*)"
    ]
  }
}
```

### Coordinator (emcom + basic ops)

```json
{
  "permissions": {
    "allow": [
      "Read", "Glob", "Grep",
      "Bash(emcom:*)", "Bash(git -C:*)", "Bash(git log:*)",
      "Bash(git status:*)", "Bash(cat:*)", "Bash(ls:*)"
    ]
  }
}
```

---

## Key Takeaways

1. Cost of prompts is high — each prompt interrupts flow and may block automated agents entirely
2. Prefer specific allow rules over bypassPermissions — security + no prompts for known operations
3. Never chain cd with git — use git -C instead (security gate, by design)
4. WebFetch blanket allow is safe — isReadOnly returns true, no write capability
5. Settings.local.json is gitignored — safe for per-workspace permission tuning
6. Rules merge across sources — project + local + global all contribute
7. Deny always wins — deny rules from any source override allow rules from any source
