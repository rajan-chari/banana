"""
Tool Registry - Defines tool schemas and registry operations.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any
import hashlib
import uuid


class ParameterType(Enum):
    """Supported parameter types for tools."""
    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    LIST = "list"
    PATH = "path"


@dataclass
class ToolParameter:
    """Definition of a tool parameter."""
    
    name: str
    """Parameter name (used in code)."""
    
    description: str
    """Human-readable description."""
    
    param_type: ParameterType = ParameterType.STRING
    """Data type of the parameter."""
    
    required: bool = True
    """Whether the parameter is required."""
    
    default: Any = None
    """Default value if not provided."""
    
    def to_dict(self) -> dict:
        """Convert to dictionary for storage."""
        return {
            "name": self.name,
            "description": self.description,
            "param_type": self.param_type.value,
            "required": self.required,
            "default": self.default,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "ToolParameter":
        """Create from dictionary."""
        return cls(
            name=data["name"],
            description=data["description"],
            param_type=ParameterType(data["param_type"]),
            required=data.get("required", True),
            default=data.get("default"),
        )


@dataclass
class Tool:
    """A registered tool that can be invoked by the assistant."""
    
    id: str
    """Unique identifier for the tool."""
    
    name: str
    """Human-readable name (e.g., 'list_files')."""
    
    description: str
    """What the tool does (shown to LLM)."""
    
    source_code: str
    """The Python code that implements the tool."""
    
    parameters: list[ToolParameter] = field(default_factory=list)
    """Parameters the tool accepts."""
    
    created_at: datetime = field(default_factory=datetime.now)
    """When the tool was created."""
    
    updated_at: datetime = field(default_factory=datetime.now)
    """When the tool was last updated."""
    
    source_script_path: str | None = None
    """Path to the original script file (if promoted from script)."""
    
    version: int = 1
    """Version number for the tool."""
    
    enabled: bool = True
    """Whether the tool is currently enabled."""
    
    tags: list[str] = field(default_factory=list)
    """Tags for categorization."""
    
    usage_count: int = 0
    """Number of times the tool has been invoked."""
    
    last_used_at: datetime | None = None
    """When the tool was last used."""
    
    code_hash: str = ""
    """Hash of the source code for change detection."""
    
    def __post_init__(self):
        """Compute code hash if not set."""
        if not self.code_hash:
            self.code_hash = hashlib.sha256(self.source_code.encode()).hexdigest()[:16]
    
    def to_dict(self) -> dict:
        """Convert to dictionary for storage."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "source_code": self.source_code,
            "parameters": [p.to_dict() for p in self.parameters],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "source_script_path": self.source_script_path,
            "version": self.version,
            "enabled": self.enabled,
            "tags": self.tags,
            "usage_count": self.usage_count,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "code_hash": self.code_hash,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Tool":
        """Create from dictionary."""
        return cls(
            id=data["id"],
            name=data["name"],
            description=data["description"],
            source_code=data["source_code"],
            parameters=[ToolParameter.from_dict(p) for p in data.get("parameters", [])],
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            source_script_path=data.get("source_script_path"),
            version=data.get("version", 1),
            enabled=data.get("enabled", True),
            tags=data.get("tags", []),
            usage_count=data.get("usage_count", 0),
            last_used_at=datetime.fromisoformat(data["last_used_at"]) if data.get("last_used_at") else None,
            code_hash=data.get("code_hash", ""),
        )
    
    def to_llm_schema(self) -> dict:
        """Convert to schema format for LLM function calling."""
        properties = {}
        required = []
        
        for param in self.parameters:
            prop = {
                "type": param.param_type.value,
                "description": param.description,
            }
            if param.default is not None:
                prop["default"] = param.default
            properties[param.name] = prop
            if param.required:
                required.append(param.name)
        
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        }


class ToolRegistry:
    """
    In-memory registry of tools.
    
    Works with ToolStorage for persistence.
    """
    
    def __init__(self):
        self._tools: dict[str, Tool] = {}
        self._by_name: dict[str, str] = {}  # name -> id mapping
    
    def register(self, tool: Tool) -> None:
        """Register a tool."""
        if tool.name in self._by_name:
            raise ValueError(f"Tool with name '{tool.name}' already exists")
        
        self._tools[tool.id] = tool
        self._by_name[tool.name] = tool.id
    
    def unregister(self, tool_id: str) -> Tool | None:
        """Remove a tool from the registry."""
        tool = self._tools.pop(tool_id, None)
        if tool:
            self._by_name.pop(tool.name, None)
        return tool
    
    def get(self, tool_id: str) -> Tool | None:
        """Get a tool by ID."""
        return self._tools.get(tool_id)
    
    def get_by_name(self, name: str) -> Tool | None:
        """Get a tool by name."""
        tool_id = self._by_name.get(name)
        return self._tools.get(tool_id) if tool_id else None
    
    def list_all(self, enabled_only: bool = True) -> list[Tool]:
        """List all registered tools."""
        tools = list(self._tools.values())
        if enabled_only:
            tools = [t for t in tools if t.enabled]
        return sorted(tools, key=lambda t: t.name)
    
    def search(self, query: str) -> list[Tool]:
        """Search tools by name, description, or tags."""
        query_lower = query.lower()
        results = []
        for tool in self._tools.values():
            if (query_lower in tool.name.lower() or
                query_lower in tool.description.lower() or
                any(query_lower in tag.lower() for tag in tool.tags)):
                results.append(tool)
        return results
    
    def get_llm_tools(self) -> list[dict]:
        """Get all tools in LLM function calling format."""
        return [tool.to_llm_schema() for tool in self.list_all(enabled_only=True)]
    
    def update(self, tool: Tool) -> None:
        """Update an existing tool."""
        if tool.id not in self._tools:
            raise ValueError(f"Tool with ID '{tool.id}' not found")
        
        old_tool = self._tools[tool.id]
        if old_tool.name != tool.name:
            # Name changed, update mapping
            self._by_name.pop(old_tool.name, None)
            self._by_name[tool.name] = tool.id
        
        tool.updated_at = datetime.now()
        self._tools[tool.id] = tool
    
    def increment_usage(self, tool_id: str) -> None:
        """Increment usage count for a tool."""
        tool = self._tools.get(tool_id)
        if tool:
            tool.usage_count += 1
            tool.last_used_at = datetime.now()
    
    @staticmethod
    def create_tool(
        name: str,
        description: str,
        source_code: str,
        parameters: list[ToolParameter] | None = None,
        source_script_path: str | None = None,
        tags: list[str] | None = None,
    ) -> Tool:
        """Factory method to create a new tool."""
        return Tool(
            id=str(uuid.uuid4()),
            name=name,
            description=description,
            source_code=source_code,
            parameters=parameters or [],
            source_script_path=source_script_path,
            tags=tags or [],
        )
