"""
Audit logging for permission checks and script execution.
"""

import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path

from assistant.permissions.categories import PermissionCategory, PermissionLevel


class AuditEventType(Enum):
    """Types of auditable events."""

    PERMISSION_CHECK = "permission_check"
    PERMISSION_GRANTED = "permission_granted"
    PERMISSION_DENIED = "permission_denied"
    SCRIPT_GENERATED = "script_generated"
    SCRIPT_EXECUTED = "script_executed"
    SCRIPT_FAILED = "script_failed"
    USER_CONFIRMED = "user_confirmed"
    USER_REJECTED = "user_rejected"


@dataclass
class AuditEvent:
    """An auditable event."""

    event_type: AuditEventType
    timestamp: datetime
    user_id: str
    conversation_id: str
    description: str
    details: dict
    category: PermissionCategory | None = None
    level: PermissionLevel | None = None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "event_type": self.event_type.value,
            "timestamp": self.timestamp.isoformat(),
            "user_id": self.user_id,
            "conversation_id": self.conversation_id,
            "description": self.description,
            "details": self.details,
            "category": self.category.value if self.category else None,
            "level": self.level.value if self.level else None,
        }


class AuditLogger:
    """Logs security-relevant events."""

    def __init__(
        self,
        log_dir: Path | None = None,
        log_to_file: bool = True,
        log_to_console: bool = True,
    ):
        self.log_dir = log_dir
        self.log_to_file = log_to_file and log_dir is not None
        self.log_to_console = log_to_console

        # Set up Python logger
        self.logger = logging.getLogger("assistant.audit")
        self.logger.setLevel(logging.INFO)

        if log_to_console:
            handler = logging.StreamHandler()
            handler.setFormatter(
                logging.Formatter("%(asctime)s - AUDIT - %(message)s")
            )
            self.logger.addHandler(handler)

        if self.log_to_file and log_dir:
            log_dir.mkdir(parents=True, exist_ok=True)
            log_file = log_dir / f"audit_{datetime.now().strftime('%Y%m%d')}.log"
            file_handler = logging.FileHandler(log_file)
            file_handler.setFormatter(
                logging.Formatter("%(asctime)s - %(message)s")
            )
            self.logger.addHandler(file_handler)

    def log(self, event: AuditEvent) -> None:
        """Log an audit event."""
        # Log to Python logger
        log_line = json.dumps(event.to_dict())
        self.logger.info(log_line)

    def log_permission_check(
        self,
        user_id: str,
        conversation_id: str,
        category: PermissionCategory,
        description: str,
        allowed: bool,
        level: PermissionLevel,
        details: dict | None = None,
    ) -> None:
        """Log a permission check."""
        event_type = (
            AuditEventType.PERMISSION_GRANTED
            if allowed
            else AuditEventType.PERMISSION_DENIED
        )
        self.log(
            AuditEvent(
                event_type=event_type,
                timestamp=datetime.now(),
                user_id=user_id,
                conversation_id=conversation_id,
                description=description,
                details=details or {},
                category=category,
                level=level,
            )
        )

    def log_script_generated(
        self,
        user_id: str,
        conversation_id: str,
        script_path: str,
        description: str | None,
    ) -> None:
        """Log script generation."""
        self.log(
            AuditEvent(
                event_type=AuditEventType.SCRIPT_GENERATED,
                timestamp=datetime.now(),
                user_id=user_id,
                conversation_id=conversation_id,
                description=description or "Script generated",
                details={"script_path": script_path},
            )
        )

    def log_script_executed(
        self,
        user_id: str,
        conversation_id: str,
        script_path: str | None,
        success: bool,
        duration_ms: int,
        return_code: int,
    ) -> None:
        """Log script execution."""
        event_type = (
            AuditEventType.SCRIPT_EXECUTED
            if success
            else AuditEventType.SCRIPT_FAILED
        )
        self.log(
            AuditEvent(
                event_type=event_type,
                timestamp=datetime.now(),
                user_id=user_id,
                conversation_id=conversation_id,
                description=f"Script {'executed successfully' if success else 'failed'}",
                details={
                    "script_path": script_path,
                    "duration_ms": duration_ms,
                    "return_code": return_code,
                },
            )
        )

    def log_user_decision(
        self,
        user_id: str,
        conversation_id: str,
        confirmed: bool,
        category: PermissionCategory,
        description: str,
    ) -> None:
        """Log a user confirmation or rejection."""
        event_type = (
            AuditEventType.USER_CONFIRMED
            if confirmed
            else AuditEventType.USER_REJECTED
        )
        self.log(
            AuditEvent(
                event_type=event_type,
                timestamp=datetime.now(),
                user_id=user_id,
                conversation_id=conversation_id,
                description=description,
                details={},
                category=category,
            )
        )


# Global audit logger instance
_audit_logger: AuditLogger | None = None


def get_audit_logger(log_dir: Path | None = None) -> AuditLogger:
    """Get the global audit logger instance."""
    global _audit_logger
    if _audit_logger is None:
        _audit_logger = AuditLogger(log_dir=log_dir)
    return _audit_logger


def set_audit_logger(logger: AuditLogger) -> None:
    """Set the global audit logger instance."""
    global _audit_logger
    _audit_logger = logger
