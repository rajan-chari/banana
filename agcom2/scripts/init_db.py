#!/usr/bin/env python
"""Initialize the AgCom database."""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from agcom.storage import init_database

def main():
    db_path = os.getenv("DB_PATH", "./data/agcom.db")

    # Create data directory if it doesn't exist
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    print(f"Initializing database at: {db_path}")
    conn = init_database(db_path)
    conn.close()
    print("Database initialized successfully!")

if __name__ == "__main__":
    main()
