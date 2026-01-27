"""
agcom integration for assistant.

Provides client and tools for agent-to-agent communication via agcom REST API.
"""

from .client import AgcomClient
from .config import AgcomSettings, load_agcom_config
from .models import Message, Thread, Contact, LoginInfo, AgentInfo, AuditEvent
from .tools import register_agcom_tools, register_user_identity_tool, try_register_agcom_tools_if_configured
from .identity import (
    AgcomIdentity,
    is_identity_configured,
    load_identity,
    configure_identity,
    derive_assistant_handle,
    name_to_handle,
)

__all__ = [
    "AgcomClient",
    "AgcomSettings",
    "load_agcom_config",
    "Message",
    "Thread",
    "Contact",
    "LoginInfo",
    "AgentInfo",
    "AuditEvent",
    "register_agcom_tools",
    "register_user_identity_tool",
    "try_register_agcom_tools_if_configured",
    "AgcomIdentity",
    "is_identity_configured",
    "load_identity",
    "configure_identity",
    "derive_assistant_handle",
    "name_to_handle",
]
