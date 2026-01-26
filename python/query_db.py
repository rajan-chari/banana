#!/usr/bin/env python3
"""Quick database query script for agcom."""

import sqlite3
import sys
from pathlib import Path

def query(db_path: str, sql: str):
    """Execute a SQL query and print results."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row  # Enable column access by name

    try:
        cursor = conn.cursor()
        cursor.execute(sql)

        # Get column names
        if cursor.description:
            columns = [desc[0] for desc in cursor.description]

            # Print header
            print(" | ".join(columns))
            print("-" * (len(" | ".join(columns))))

            # Print rows
            for row in cursor.fetchall():
                print(" | ".join(str(row[col]) for col in columns))
        else:
            print(f"Query executed. Rows affected: {cursor.rowcount}")

        conn.commit()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    finally:
        conn.close()

    return 0

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python query_db.py 'SQL QUERY' [--db PATH]")
        print("\nExamples:")
        print("  python query_db.py 'SELECT * FROM messages LIMIT 5'")
        print("  python query_db.py 'SELECT COUNT(*) FROM threads'")
        print("  python query_db.py '.tables'  # List all tables")
        sys.exit(1)

    sql = sys.argv[1]

    # Find database path
    db_path = "./data/agcom.db"
    if "--db" in sys.argv:
        idx = sys.argv.index("--db")
        db_path = sys.argv[idx + 1]

    # Handle special commands
    if sql == ".tables":
        sql = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    elif sql == ".schema":
        sql = "SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name"

    if not Path(db_path).exists():
        print(f"Error: Database not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    sys.exit(query(db_path, sql))
