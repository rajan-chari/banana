"""Main entry point for the assistant."""

# Re-export from bot module for convenience
from assistant.bot.app import main

if __name__ == "__main__":
    import sys
    sys.exit(main())
