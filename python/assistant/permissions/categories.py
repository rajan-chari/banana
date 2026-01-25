"""
Permission categories and definitions.

Defines the categories of operations that require permissions,
and the rules for checking them.
"""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


class PermissionCategory(Enum):
    """Categories of operations that require permissions."""

    # File system operations
    FILE_READ = "file_read"
    FILE_WRITE = "file_write"
    FILE_DELETE = "file_delete"
    FILE_EXECUTE = "file_execute"

    # Shell/process operations
    SHELL_COMMAND = "shell_command"
    PROCESS_SPAWN = "process_spawn"

    # Network operations
    NETWORK_REQUEST = "network_request"
    NETWORK_LISTEN = "network_listen"

    # Package/installation operations
    PACKAGE_INSTALL = "package_install"
    PACKAGE_UNINSTALL = "package_uninstall"

    # Environment operations
    ENV_READ = "env_read"
    ENV_WRITE = "env_write"

    # Secrets/credentials
    SECRETS_ACCESS = "secrets_access"


class PermissionLevel(Enum):
    """How a permission request should be handled."""

    ALLOW = "allow"  # Always allow without asking
    DENY = "deny"  # Always deny without asking
    ASK = "ask"  # Ask user for confirmation each time
    ASK_ONCE = "ask_once"  # Ask once, remember for session


@dataclass
class PermissionRule:
    """A rule for handling a specific permission."""

    category: PermissionCategory
    level: PermissionLevel
    patterns: list[str] = field(default_factory=list)
    """Optional patterns to match (e.g., file paths, command patterns)."""

    reason: str | None = None
    """Optional reason for this rule."""


@dataclass
class PermissionPolicy:
    """A complete permission policy with rules for each category."""

    name: str
    """Name of this policy (e.g., 'default', 'restricted', 'development')."""

    rules: dict[PermissionCategory, PermissionRule] = field(default_factory=dict)
    """Rules for each category."""

    allowed_paths: list[Path] = field(default_factory=list)
    """Paths that are allowed for file operations."""

    blocked_paths: list[Path] = field(default_factory=list)
    """Paths that are always blocked."""

    allowed_commands: list[str] = field(default_factory=list)
    """Shell commands/patterns that are allowed."""

    blocked_commands: list[str] = field(default_factory=list)
    """Shell commands that are always blocked."""

    allowed_hosts: list[str] = field(default_factory=list)
    """Network hosts that are allowed."""

    blocked_hosts: list[str] = field(default_factory=list)
    """Network hosts that are always blocked."""

    def get_level(self, category: PermissionCategory) -> PermissionLevel:
        """Get the permission level for a category."""
        if category in self.rules:
            return self.rules[category].level
        # Default: ask for confirmation
        return PermissionLevel.ASK


def create_default_policy() -> PermissionPolicy:
    """Create the default permission policy."""
    return PermissionPolicy(
        name="default",
        rules={
            # File operations - ask by default
            PermissionCategory.FILE_READ: PermissionRule(
                category=PermissionCategory.FILE_READ,
                level=PermissionLevel.ASK,
            ),
            PermissionCategory.FILE_WRITE: PermissionRule(
                category=PermissionCategory.FILE_WRITE,
                level=PermissionLevel.ASK,
            ),
            PermissionCategory.FILE_DELETE: PermissionRule(
                category=PermissionCategory.FILE_DELETE,
                level=PermissionLevel.ASK,
            ),
            PermissionCategory.FILE_EXECUTE: PermissionRule(
                category=PermissionCategory.FILE_EXECUTE,
                level=PermissionLevel.ALLOW,  # We execute scripts, so allow
            ),
            # Shell - ask
            PermissionCategory.SHELL_COMMAND: PermissionRule(
                category=PermissionCategory.SHELL_COMMAND,
                level=PermissionLevel.ASK,
            ),
            PermissionCategory.PROCESS_SPAWN: PermissionRule(
                category=PermissionCategory.PROCESS_SPAWN,
                level=PermissionLevel.ASK,
            ),
            # Network - ask
            PermissionCategory.NETWORK_REQUEST: PermissionRule(
                category=PermissionCategory.NETWORK_REQUEST,
                level=PermissionLevel.ASK,
            ),
            PermissionCategory.NETWORK_LISTEN: PermissionRule(
                category=PermissionCategory.NETWORK_LISTEN,
                level=PermissionLevel.ASK,
            ),
            # Packages - ask
            PermissionCategory.PACKAGE_INSTALL: PermissionRule(
                category=PermissionCategory.PACKAGE_INSTALL,
                level=PermissionLevel.ASK,
            ),
            PermissionCategory.PACKAGE_UNINSTALL: PermissionRule(
                category=PermissionCategory.PACKAGE_UNINSTALL,
                level=PermissionLevel.DENY,
            ),
            # Environment - read allowed, write ask
            PermissionCategory.ENV_READ: PermissionRule(
                category=PermissionCategory.ENV_READ,
                level=PermissionLevel.ALLOW,
            ),
            PermissionCategory.ENV_WRITE: PermissionRule(
                category=PermissionCategory.ENV_WRITE,
                level=PermissionLevel.ASK,
            ),
            # Secrets - deny by default
            PermissionCategory.SECRETS_ACCESS: PermissionRule(
                category=PermissionCategory.SECRETS_ACCESS,
                level=PermissionLevel.DENY,
            ),
        },
        # Default blocked paths (system directories)
        blocked_paths=[
            Path("C:/Windows"),
            Path("C:/Program Files"),
            Path("C:/Program Files (x86)"),
            Path("/etc"),
            Path("/usr"),
            Path("/bin"),
            Path("/sbin"),
        ],
        # Default blocked commands
        blocked_commands=[
            "rm -rf /",
            "del /s /q C:\\",
            "format",
            "fdisk",
            "mkfs",
            ":(){:|:&};:",  # Fork bomb
        ],
    )


def create_development_policy() -> PermissionPolicy:
    """Create a more permissive policy for development."""
    policy = create_default_policy()
    policy.name = "development"

    # Allow more operations in development
    policy.rules[PermissionCategory.FILE_READ].level = PermissionLevel.ALLOW
    policy.rules[PermissionCategory.FILE_WRITE].level = PermissionLevel.ASK_ONCE
    policy.rules[PermissionCategory.SHELL_COMMAND].level = PermissionLevel.ASK_ONCE
    policy.rules[PermissionCategory.NETWORK_REQUEST].level = PermissionLevel.ALLOW

    return policy


def create_restricted_policy() -> PermissionPolicy:
    """Create a restrictive policy for untrusted operations."""
    policy = create_default_policy()
    policy.name = "restricted"

    # Deny most operations
    policy.rules[PermissionCategory.FILE_WRITE].level = PermissionLevel.DENY
    policy.rules[PermissionCategory.FILE_DELETE].level = PermissionLevel.DENY
    policy.rules[PermissionCategory.SHELL_COMMAND].level = PermissionLevel.DENY
    policy.rules[PermissionCategory.PROCESS_SPAWN].level = PermissionLevel.DENY
    policy.rules[PermissionCategory.NETWORK_LISTEN].level = PermissionLevel.DENY
    policy.rules[PermissionCategory.PACKAGE_INSTALL].level = PermissionLevel.DENY
    policy.rules[PermissionCategory.ENV_WRITE].level = PermissionLevel.DENY

    return policy
