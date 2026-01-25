"""
Tool Storage - SQLite-based persistence for tools.
"""

import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path

from assistant.tools.registry import Tool, ToolParameter, ToolRegistry

logger = logging.getLogger(__name__)


class ToolStorage:
    """
    SQLite-based storage for tools.
    
    Provides persistence for the tool registry.
    """
    
    def __init__(self, db_path: Path | str):
        """
        Initialize tool storage.
        
        Args:
            db_path: Path to the SQLite database file
        """
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
    
    def _init_db(self) -> None:
        """Initialize the database schema."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tools (
                    id TEXT PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    description TEXT NOT NULL,
                    source_code TEXT NOT NULL,
                    parameters TEXT NOT NULL,  -- JSON
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    source_script_path TEXT,
                    version INTEGER DEFAULT 1,
                    enabled INTEGER DEFAULT 1,
                    tags TEXT DEFAULT '[]',  -- JSON array
                    usage_count INTEGER DEFAULT 0,
                    last_used_at TEXT,
                    code_hash TEXT
                )
            """)
            
            # Index for faster name lookups
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(name)
            """)
            
            # Index for enabled tools
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_tools_enabled ON tools(enabled)
            """)
            
            conn.commit()
            logger.info(f"Tool database initialized at {self.db_path}")
    
    def save(self, tool: Tool) -> None:
        """
        Save a tool to storage.
        
        If the tool already exists (by ID), it will be updated.
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO tools (
                    id, name, description, source_code, parameters,
                    created_at, updated_at, source_script_path, version,
                    enabled, tags, usage_count, last_used_at, code_hash
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                tool.id,
                tool.name,
                tool.description,
                tool.source_code,
                json.dumps([p.to_dict() for p in tool.parameters]),
                tool.created_at.isoformat(),
                tool.updated_at.isoformat(),
                tool.source_script_path,
                tool.version,
                1 if tool.enabled else 0,
                json.dumps(tool.tags),
                tool.usage_count,
                tool.last_used_at.isoformat() if tool.last_used_at else None,
                tool.code_hash,
            ))
            conn.commit()
            logger.debug(f"Saved tool: {tool.name} ({tool.id})")
    
    def load(self, tool_id: str) -> Tool | None:
        """Load a tool by ID."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT * FROM tools WHERE id = ?",
                (tool_id,)
            )
            row = cursor.fetchone()
            return self._row_to_tool(row) if row else None
    
    def load_by_name(self, name: str) -> Tool | None:
        """Load a tool by name."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT * FROM tools WHERE name = ?",
                (name,)
            )
            row = cursor.fetchone()
            return self._row_to_tool(row) if row else None
    
    def load_all(self, enabled_only: bool = False) -> list[Tool]:
        """Load all tools."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            if enabled_only:
                cursor = conn.execute(
                    "SELECT * FROM tools WHERE enabled = 1 ORDER BY name"
                )
            else:
                cursor = conn.execute("SELECT * FROM tools ORDER BY name")
            return [self._row_to_tool(row) for row in cursor.fetchall()]
    
    def delete(self, tool_id: str) -> bool:
        """Delete a tool by ID. Returns True if deleted."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "DELETE FROM tools WHERE id = ?",
                (tool_id,)
            )
            conn.commit()
            deleted = cursor.rowcount > 0
            if deleted:
                logger.info(f"Deleted tool: {tool_id}")
            return deleted
    
    def update_usage(self, tool_id: str) -> None:
        """Increment usage count and update last_used_at."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                UPDATE tools
                SET usage_count = usage_count + 1,
                    last_used_at = ?
                WHERE id = ?
            """, (datetime.now().isoformat(), tool_id))
            conn.commit()
    
    def search(self, query: str) -> list[Tool]:
        """Search tools by name, description, or tags."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            # SQLite LIKE is case-insensitive by default for ASCII
            pattern = f"%{query}%"
            cursor = conn.execute("""
                SELECT * FROM tools
                WHERE name LIKE ? OR description LIKE ? OR tags LIKE ?
                ORDER BY name
            """, (pattern, pattern, pattern))
            return [self._row_to_tool(row) for row in cursor.fetchall()]
    
    def load_into_registry(self, registry: ToolRegistry) -> int:
        """
        Load all enabled tools into a registry.
        
        Returns the number of tools loaded.
        """
        tools = self.load_all(enabled_only=True)
        for tool in tools:
            try:
                registry.register(tool)
            except ValueError as e:
                logger.warning(f"Could not register tool {tool.name}: {e}")
        logger.info(f"Loaded {len(tools)} tools into registry")
        return len(tools)
    
    def save_from_registry(self, registry: ToolRegistry) -> int:
        """
        Save all tools from a registry to storage.
        
        Returns the number of tools saved.
        """
        tools = registry.list_all(enabled_only=False)
        for tool in tools:
            self.save(tool)
        logger.info(f"Saved {len(tools)} tools to storage")
        return len(tools)
    
    def _row_to_tool(self, row: sqlite3.Row) -> Tool:
        """Convert a database row to a Tool object."""
        return Tool(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            source_code=row["source_code"],
            parameters=[
                ToolParameter.from_dict(p)
                for p in json.loads(row["parameters"])
            ],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            source_script_path=row["source_script_path"],
            version=row["version"],
            enabled=bool(row["enabled"]),
            tags=json.loads(row["tags"]),
            usage_count=row["usage_count"],
            last_used_at=datetime.fromisoformat(row["last_used_at"]) if row["last_used_at"] else None,
            code_hash=row["code_hash"] or "",
        )
    
    def get_stats(self) -> dict:
        """Get storage statistics."""
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM tools").fetchone()[0]
            enabled = conn.execute("SELECT COUNT(*) FROM tools WHERE enabled = 1").fetchone()[0]
            total_usage = conn.execute("SELECT SUM(usage_count) FROM tools").fetchone()[0] or 0
            
            return {
                "total_tools": total,
                "enabled_tools": enabled,
                "disabled_tools": total - enabled,
                "total_invocations": total_usage,
                "db_path": str(self.db_path),
            }
