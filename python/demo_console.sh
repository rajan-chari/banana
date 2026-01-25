#!/bin/bash
# Demo script for agcom console improvements

echo "=== Setting up agcom console ==="
echo ""

echo "1. Configuring defaults..."
.venv/Scripts/python.exe -m agcom.console config set --store demo.db --me alice
echo ""

echo "2. Initializing database..."
.venv/Scripts/python.exe -m agcom.console init
echo ""

echo "3. Sending test messages..."
.venv/Scripts/python.exe -m agcom.console send bob "First message" "Hey Bob, how are you?"
.venv/Scripts/python.exe -m agcom.console send charlie "Project update" "The project is going well"
.venv/Scripts/python.exe -m agcom.console send bob charlie "Team meeting" "Let's meet tomorrow at 2pm"
echo ""

echo "4. Viewing inbox (notice the numbered threads)..."
.venv/Scripts/python.exe -m agcom.console screen
echo ""

echo "5. Viewing thread #1 by number (no need to copy/paste ULID)..."
.venv/Scripts/python.exe -m agcom.console view 1
echo ""

echo "6. Replying to message #1 using simple syntax..."
.venv/Scripts/python.exe -m agcom.console reply 1 "Thanks for reaching out!"
echo ""

echo "7. Viewing thread again to see the reply..."
.venv/Scripts/python.exe -m agcom.console view 1
echo ""

echo "=== Demo complete! ==="
echo ""
echo "Try these commands:"
echo "  .venv/Scripts/python.exe -m agcom.console screen       # View inbox"
echo "  .venv/Scripts/python.exe -m agcom.console view 2       # View thread #2"
echo "  .venv/Scripts/python.exe -m agcom.console reply 1 \"Hi!\" # Reply to message #1"
echo ""
echo "Or enter interactive mode:"
echo "  .venv/Scripts/python.exe -m agcom.console"
echo ""
echo "To clean up:"
echo "  rm demo.db"
echo "  .venv/Scripts/python.exe -m agcom.console config clear"
