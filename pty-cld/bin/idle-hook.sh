#!/bin/bash
# Called by Claude Code's global Notification hook.
# Only signals pty-cld when Claude is truly idle (at input prompt).
# Stdin: JSON with notification_type field from Claude Code.

INPUT=$(cat)

# Only act on idle_prompt — ignore permission_prompt, auth_success, etc.
echo "$INPUT" | grep -q '"notification_type":"idle_prompt"' || exit 0

# Read the port file written by pty-cld in this project's CWD
PORT=$(cat .pty-cld-port 2>/dev/null) || exit 0

curl -s -X POST "http://127.0.0.1:$PORT/idle" > /dev/null 2>&1
