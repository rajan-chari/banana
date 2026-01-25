"""
Permission checker - validates operations against policy.

Analyzes code and operations to determine what permissions are needed,
and checks them against the current policy.
"""

import ast
import fnmatch
import re
from dataclasses import dataclass, field
from pathlib import Path

from assistant.permissions.categories import (
    PermissionCategory,
    PermissionLevel,
    PermissionPolicy,
    create_default_policy,
)


@dataclass
class PermissionRequest:
    """A request for permission to perform an operation."""

    category: PermissionCategory
    description: str
    """Human-readable description of what's being requested."""

    details: dict = field(default_factory=dict)
    """Additional details (path, command, host, etc.)."""


@dataclass
class PermissionCheckResult:
    """Result of checking permissions for an operation."""

    allowed: bool
    """Whether the operation is allowed."""

    level: PermissionLevel
    """The permission level that was applied."""

    requests: list[PermissionRequest]
    """List of permission requests that need user confirmation."""

    denied_reasons: list[str] = field(default_factory=list)
    """Reasons why permission was denied."""

    warnings: list[str] = field(default_factory=list)
    """Warnings about the operation."""


class PermissionChecker:
    """Checks operations against a permission policy."""

    def __init__(self, policy: PermissionPolicy | None = None):
        self.policy = policy or create_default_policy()
        self._session_approvals: set[str] = set()

    def check_code(self, code: str) -> PermissionCheckResult:
        """
        Analyze Python code and check what permissions it needs.

        Args:
            code: Python source code to analyze

        Returns:
            PermissionCheckResult with needed permissions
        """
        requests = []
        denied_reasons = []
        warnings = []

        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            return PermissionCheckResult(
                allowed=False,
                level=PermissionLevel.DENY,
                requests=[],
                denied_reasons=[f"Invalid Python syntax: {e}"],
            )

        # Analyze imports
        imports = self._extract_imports(tree)
        for imp in imports:
            req = self._check_import(imp)
            if req:
                requests.append(req)

        # Analyze function calls
        calls = self._extract_calls(tree)
        for call in calls:
            req = self._check_call(call)
            if req:
                requests.append(req)

        # Check for dangerous patterns
        dangerous = self._check_dangerous_patterns(code)
        denied_reasons.extend(dangerous)

        # Determine overall result
        needs_confirmation = []
        for req in requests:
            level = self.policy.get_level(req.category)

            if level == PermissionLevel.DENY:
                denied_reasons.append(f"Denied: {req.description}")
            elif level == PermissionLevel.ASK:
                needs_confirmation.append(req)
            elif level == PermissionLevel.ASK_ONCE:
                key = f"{req.category.value}:{req.description}"
                if key not in self._session_approvals:
                    needs_confirmation.append(req)
            # ALLOW: no action needed

        if denied_reasons:
            return PermissionCheckResult(
                allowed=False,
                level=PermissionLevel.DENY,
                requests=needs_confirmation,
                denied_reasons=denied_reasons,
                warnings=warnings,
            )

        if needs_confirmation:
            return PermissionCheckResult(
                allowed=False,
                level=PermissionLevel.ASK,
                requests=needs_confirmation,
                warnings=warnings,
            )

        return PermissionCheckResult(
            allowed=True,
            level=PermissionLevel.ALLOW,
            requests=[],
            warnings=warnings,
        )

    def approve_request(self, request: PermissionRequest) -> None:
        """Mark a permission request as approved for the session."""
        key = f"{request.category.value}:{request.description}"
        self._session_approvals.add(key)

    def approve_all(self, requests: list[PermissionRequest]) -> None:
        """Approve all requests in a list."""
        for req in requests:
            self.approve_request(req)

    def clear_approvals(self) -> None:
        """Clear all session approvals."""
        self._session_approvals.clear()

    def _extract_imports(self, tree: ast.AST) -> list[str]:
        """Extract all import names from AST."""
        imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(alias.name)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.append(node.module)
        return imports

    def _extract_calls(self, tree: ast.AST) -> list[str]:
        """Extract function call names from AST."""
        calls = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name):
                    calls.append(node.func.id)
                elif isinstance(node.func, ast.Attribute):
                    # Get the full dotted name if possible
                    parts = []
                    current = node.func
                    while isinstance(current, ast.Attribute):
                        parts.append(current.attr)
                        current = current.value
                    if isinstance(current, ast.Name):
                        parts.append(current.id)
                    parts.reverse()
                    calls.append(".".join(parts))
        return calls

    def _check_import(self, module: str) -> PermissionRequest | None:
        """Check if an import requires permission."""
        # Network-related imports
        network_modules = ["requests", "urllib", "http", "socket", "aiohttp", "httpx"]
        if any(module.startswith(m) for m in network_modules):
            return PermissionRequest(
                category=PermissionCategory.NETWORK_REQUEST,
                description=f"Import network module: {module}",
                details={"module": module},
            )

        # Process/shell imports
        process_modules = ["subprocess", "os.system", "shlex"]
        if any(module.startswith(m) for m in process_modules):
            return PermissionRequest(
                category=PermissionCategory.SHELL_COMMAND,
                description=f"Import process module: {module}",
                details={"module": module},
            )

        return None

    def _check_call(self, call: str) -> PermissionRequest | None:
        """Check if a function call requires permission."""
        # File operations
        file_write_calls = ["open", "write", "writelines"]
        if call in file_write_calls:
            return PermissionRequest(
                category=PermissionCategory.FILE_WRITE,
                description=f"File operation: {call}",
                details={"function": call},
            )

        # Shell commands
        shell_calls = ["os.system", "subprocess.run", "subprocess.call", "subprocess.Popen"]
        if call in shell_calls:
            return PermissionRequest(
                category=PermissionCategory.SHELL_COMMAND,
                description=f"Shell command: {call}",
                details={"function": call},
            )

        # File deletion
        delete_calls = ["os.remove", "os.unlink", "shutil.rmtree", "pathlib.Path.unlink"]
        if call in delete_calls:
            return PermissionRequest(
                category=PermissionCategory.FILE_DELETE,
                description=f"File deletion: {call}",
                details={"function": call},
            )

        return None

    def _check_dangerous_patterns(self, code: str) -> list[str]:
        """Check for dangerous code patterns."""
        issues = []

        # Check blocked commands in the policy
        for blocked in self.policy.blocked_commands:
            if blocked in code:
                issues.append(f"Blocked command pattern detected: {blocked}")

        # Eval/exec
        if re.search(r"\beval\s*\(", code):
            issues.append("Use of eval() detected - potential code injection risk")

        if re.search(r"\bexec\s*\(", code):
            issues.append("Use of exec() detected - potential code injection risk")

        # Pickle (deserialization attacks)
        if "pickle.load" in code or "pickle.loads" in code:
            issues.append("Pickle deserialization detected - potential security risk")

        return issues

    def check_path(self, path: Path, operation: PermissionCategory) -> PermissionCheckResult:
        """Check if a file path operation is allowed."""
        path = path.resolve()

        # Check blocked paths
        for blocked in self.policy.blocked_paths:
            try:
                path.relative_to(blocked)
                return PermissionCheckResult(
                    allowed=False,
                    level=PermissionLevel.DENY,
                    requests=[],
                    denied_reasons=[f"Path is in blocked directory: {blocked}"],
                )
            except ValueError:
                pass  # Not under this blocked path

        # Check allowed paths (if specified)
        if self.policy.allowed_paths:
            in_allowed = False
            for allowed in self.policy.allowed_paths:
                try:
                    path.relative_to(allowed)
                    in_allowed = True
                    break
                except ValueError:
                    pass

            if not in_allowed:
                return PermissionCheckResult(
                    allowed=False,
                    level=PermissionLevel.ASK,
                    requests=[
                        PermissionRequest(
                            category=operation,
                            description=f"Access path outside allowed directories: {path}",
                            details={"path": str(path)},
                        )
                    ],
                )

        level = self.policy.get_level(operation)
        if level == PermissionLevel.ALLOW:
            return PermissionCheckResult(allowed=True, level=level, requests=[])

        return PermissionCheckResult(
            allowed=False,
            level=level,
            requests=[
                PermissionRequest(
                    category=operation,
                    description=f"File {operation.value}: {path}",
                    details={"path": str(path)},
                )
            ],
        )
