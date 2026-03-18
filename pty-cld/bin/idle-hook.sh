#!/bin/bash
# Called by Claude Code's global Notification hook.
# Only signals pty-cld when Claude is truly idle (at input prompt).
# Stdin: JSON with notification_type field from Claude Code.
#
# Debug: set PTY_CLD_HOOK_DEBUG=1 to log to ~/.pty-cld-hook.log,
#        or PTY_CLD_HOOK_DEBUG=/path/to/file to log there.

_debug() {
  [ -z "$PTY_CLD_HOOK_DEBUG" ] && return
  local logfile
  if [ "$PTY_CLD_HOOK_DEBUG" = "1" ]; then
    logfile="$HOME/.pty-cld-hook.log"
  else
    logfile="$PTY_CLD_HOOK_DEBUG"
  fi
  printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >> "$logfile"
}

INPUT=$(cat)
_debug "hook fired: $INPUT"

# Only act on idle_prompt — ignore permission_prompt, auth_success, etc.
if ! echo "$INPUT" | grep -q '"notification_type".*"idle_prompt"'; then
  _debug "not idle_prompt, exiting"
  exit 0
fi

# Read the port file written by pty-cld in this project's CWD
PORT=$(cat .pty-cld-port) 2>/dev/null
if [ -z "$PORT" ]; then
  _debug "no port file at $(pwd)/.pty-cld-port"
  exit 0
fi
_debug "port=$PORT"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:$PORT/idle")
_debug "curl response: $HTTP_CODE"
