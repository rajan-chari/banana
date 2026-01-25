"""
Tool Promotion - Workflow for promoting scripts to tools.
"""

import ast
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from assistant.tools.registry import Tool, ToolParameter, ToolRegistry, ParameterType
from assistant.tools.storage import ToolStorage

logger = logging.getLogger(__name__)


@dataclass
class PromotionResult:
    """Result of a tool promotion attempt."""
    
    success: bool
    """Whether the promotion succeeded."""
    
    tool: Tool | None
    """The created tool, if successful."""
    
    message: str
    """Status message."""
    
    warnings: list[str]
    """Non-fatal warnings."""


class ToolPromoter:
    """
    Handles promotion of scripts to reusable tools.
    
    The promoter:
    1. Validates the script is suitable for promotion
    2. Extracts metadata (parameters, description)
    3. Creates a Tool object
    4. Registers it in the registry and storage
    """
    
    def __init__(self, registry: ToolRegistry, storage: ToolStorage):
        self.registry = registry
        self.storage = storage
    
    def promote_script(
        self,
        name: str,
        description: str,
        source_code: str,
        source_script_path: str | None = None,
        tags: list[str] | None = None,
        parameters: list[ToolParameter] | None = None,
    ) -> PromotionResult:
        """
        Promote a script to a reusable tool.
        
        Args:
            name: Tool name (should be snake_case, like a function name)
            description: What the tool does
            source_code: The Python code
            source_script_path: Path to original script file (optional)
            tags: Tags for categorization
            parameters: Explicit parameters (if not auto-detected)
        
        Returns:
            PromotionResult with success status and tool
        """
        warnings = []
        
        # Validate name
        if not self._is_valid_name(name):
            return PromotionResult(
                success=False,
                tool=None,
                message=f"Invalid tool name '{name}'. Use snake_case with only letters, numbers, and underscores.",
                warnings=[],
            )
        
        # Check if name already exists
        if self.registry.get_by_name(name):
            return PromotionResult(
                success=False,
                tool=None,
                message=f"Tool with name '{name}' already exists.",
                warnings=[],
            )
        
        # Validate syntax
        try:
            ast.parse(source_code)
        except SyntaxError as e:
            return PromotionResult(
                success=False,
                tool=None,
                message=f"Invalid Python syntax: {e}",
                warnings=[],
            )
        
        # Auto-detect parameters if not provided
        if parameters is None:
            parameters, param_warnings = self._detect_parameters(source_code)
            warnings.extend(param_warnings)
        
        # Create the tool
        tool = ToolRegistry.create_tool(
            name=name,
            description=description,
            source_code=source_code,
            parameters=parameters,
            source_script_path=source_script_path,
            tags=tags,
        )
        
        # Register and save
        try:
            self.registry.register(tool)
            self.storage.save(tool)
            logger.info(f"Promoted script to tool: {name} ({tool.id})")
            
            return PromotionResult(
                success=True,
                tool=tool,
                message=f"Successfully promoted to tool '{name}'",
                warnings=warnings,
            )
        except Exception as e:
            logger.error(f"Failed to promote tool: {e}")
            return PromotionResult(
                success=False,
                tool=None,
                message=f"Failed to save tool: {e}",
                warnings=warnings,
            )
    
    def promote_from_file(
        self,
        script_path: Path,
        name: str | None = None,
        description: str | None = None,
        tags: list[str] | None = None,
    ) -> PromotionResult:
        """
        Promote a script file to a tool.
        
        If name/description not provided, attempts to extract from file header.
        """
        if not script_path.exists():
            return PromotionResult(
                success=False,
                tool=None,
                message=f"Script file not found: {script_path}",
                warnings=[],
            )
        
        source_code = script_path.read_text(encoding="utf-8")
        
        # Extract metadata from file header if present
        metadata = self._extract_file_metadata(source_code)
        
        # Use provided values or fall back to extracted
        tool_name = name or metadata.get("name") or script_path.stem
        tool_description = description or metadata.get("description") or f"Tool from {script_path.name}"
        
        # Clean the name
        tool_name = self._sanitize_name(tool_name)
        
        return self.promote_script(
            name=tool_name,
            description=tool_description,
            source_code=source_code,
            source_script_path=str(script_path),
            tags=tags,
        )
    
    def _is_valid_name(self, name: str) -> bool:
        """Check if name is a valid tool name."""
        # Must be valid Python identifier, snake_case preferred
        return bool(re.match(r'^[a-z][a-z0-9_]*$', name))
    
    def _sanitize_name(self, name: str) -> str:
        """Convert a string to a valid tool name."""
        # Remove timestamp prefix if present (from generated scripts)
        name = re.sub(r'^\d{8}_\d{6}_', '', name)
        
        # Convert to lowercase and replace spaces/hyphens with underscores
        name = name.lower().replace(' ', '_').replace('-', '_')
        
        # Remove any invalid characters
        name = re.sub(r'[^a-z0-9_]', '', name)
        
        # Ensure starts with letter
        if name and not name[0].isalpha():
            name = 'tool_' + name
        
        # Truncate if too long
        return name[:50] if name else 'unnamed_tool'
    
    def _extract_file_metadata(self, source_code: str) -> dict:
        """Extract metadata from script file header comments."""
        metadata = {}
        
        # Look for header comments
        lines = source_code.split('\n')
        for line in lines[:20]:  # Check first 20 lines
            line = line.strip()
            
            # Skip empty lines
            if not line:
                continue
            
            # Stop at first non-comment line (after initial comments)
            if not line.startswith('#') and metadata:
                break
            
            # Extract metadata from comments
            if line.startswith('# Name:'):
                metadata['name'] = line[7:].strip()
            elif line.startswith('# Description:'):
                metadata['description'] = line[14:].strip()
            elif line.startswith('# Tags:'):
                metadata['tags'] = [t.strip() for t in line[7:].split(',')]
        
        return metadata
    
    def _detect_parameters(self, source_code: str) -> tuple[list[ToolParameter], list[str]]:
        """
        Auto-detect parameters from the script.
        
        Looks for:
        - Variables that look like configuration
        - Input() calls
        - argparse usage
        - Common patterns
        
        Returns (parameters, warnings)
        """
        parameters = []
        warnings = []
        
        try:
            tree = ast.parse(source_code)
        except SyntaxError:
            return [], ["Could not parse script for parameter detection"]
        
        # Look for simple variable assignments at module level that might be parameters
        for node in ast.walk(tree):
            # Look for NAME = VALUE patterns that might be configurable
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        name = target.id
                        # Skip private/dunder variables
                        if name.startswith('_'):
                            continue
                        # Common parameter-like names
                        if any(keyword in name.lower() for keyword in 
                               ['path', 'file', 'dir', 'url', 'host', 'port', 'name', 'query', 'input', 'output']):
                            param_type = self._infer_type(node.value)
                            parameters.append(ToolParameter(
                                name=name,
                                description=f"Parameter: {name}",
                                param_type=param_type,
                                required=False,
                            ))
        
        if not parameters:
            warnings.append("No parameters auto-detected. Tool will run without arguments.")
        
        return parameters, warnings
    
    def _infer_type(self, node: ast.AST) -> ParameterType:
        """Infer parameter type from AST node."""
        if isinstance(node, ast.Constant):
            if isinstance(node.value, str):
                return ParameterType.STRING
            elif isinstance(node.value, bool):
                return ParameterType.BOOLEAN
            elif isinstance(node.value, int):
                return ParameterType.INTEGER
            elif isinstance(node.value, float):
                return ParameterType.FLOAT
        elif isinstance(node, ast.List):
            return ParameterType.LIST
        
        return ParameterType.STRING  # Default
