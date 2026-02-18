"""agcom-api routers."""

from .admin import router as admin_router
from .audit import router as audit_router
from .auth import router as auth_router
from .contacts import router as contacts_router
from .health import router as health_router
from .messages import router as messages_router
from .threads import router as threads_router

__all__ = [
    "admin_router",
    "audit_router",
    "auth_router",
    "contacts_router",
    "health_router",
    "messages_router",
    "threads_router",
]
