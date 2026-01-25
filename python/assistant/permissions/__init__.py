"""
Permission system and policy enforcement.

This module provides:
- Permission categories (file, network, shell, etc.)
- Permission policies (default, development, restricted)
- Permission checker for analyzing code
- Audit logging for security events
"""

from assistant.permissions.audit import (
    AuditEvent,
    AuditEventType,
    AuditLogger,
    get_audit_logger,
    set_audit_logger,
)
from assistant.permissions.categories import (
    PermissionCategory,
    PermissionLevel,
    PermissionPolicy,
    PermissionRule,
    create_default_policy,
    create_development_policy,
    create_restricted_policy,
)
from assistant.permissions.checker import (
    PermissionCheckResult,
    PermissionChecker,
    PermissionRequest,
)

__all__ = [
    # Categories
    "PermissionCategory",
    "PermissionLevel",
    "PermissionPolicy",
    "PermissionRule",
    "create_default_policy",
    "create_development_policy",
    "create_restricted_policy",
    # Checker
    "PermissionChecker",
    "PermissionCheckResult",
    "PermissionRequest",
    # Audit
    "AuditEvent",
    "AuditEventType",
    "AuditLogger",
    "get_audit_logger",
    "set_audit_logger",
]
