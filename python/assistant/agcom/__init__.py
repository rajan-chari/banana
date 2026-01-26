"""
agcom integration for assistant.

Provides client and tools for agent-to-agent communication via agcom REST API.
"""

from .client import AgcomClient
from .config import AgcomSettings, load_agcom_config
from .models import Message, Thread, Contact, LoginInfo, AgentInfo, AuditEvent
from .tools import register_agcom_tools

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
]
