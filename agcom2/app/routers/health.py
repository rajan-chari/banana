# app/routers/health.py
import logging
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from datetime import datetime
import os
import sqlite3

from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/health")
async def health_check():
    """Basic health check (liveness probe)."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "1.0.0"
    }

@router.get("/health/ready")
async def readiness_check():
    """Readiness check (includes DB connectivity and initialization)."""
    try:
        logger.debug(f"Checking readiness for DB: {settings.DB_PATH}")

        # Check if database file exists
        db_exists = os.path.exists(settings.DB_PATH)
        logger.debug(f"Database file exists: {db_exists}")

        if not db_exists:
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={
                    "status": "not_ready",
                    "database": {
                        "connected": False,
                        "initialized": False,
                        "path": settings.DB_PATH,
                        "message": "Database file does not exist. Run: python scripts/init_db.py"
                    },
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }
            )

        # Try to connect to database
        conn = sqlite3.connect(settings.DB_PATH)
        cursor = conn.cursor()

        # Check if database is initialized by checking for core tables
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name IN ('messages', 'threads', 'address_book', 'audit_log')
        """)
        tables = [row[0] for row in cursor.fetchall()]
        logger.debug(f"Found tables: {tables}")

        # Also check for schema_metadata table which is created during initialization
        cursor.execute("""
            SELECT COUNT(*) FROM sqlite_master
            WHERE type='table' AND (
                name IN ('messages', 'threads', 'address_book', 'audit_log')
                OR name = 'schema_metadata'
            )
        """)
        table_count = cursor.fetchone()[0]
        logger.debug(f"Total core tables found: {table_count}")

        # Database is initialized if we have at least the 4 core tables
        initialized = len(tables) >= 4

        conn.close()

        if not initialized:
            logger.warning(f"Database not fully initialized. Found {len(tables)} of 4 required tables: {tables}")
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={
                    "status": "not_ready",
                    "database": {
                        "connected": True,
                        "initialized": False,
                        "path": settings.DB_PATH,
                        "tables_found": tables,
                        "message": "Database not initialized. Run: python scripts/init_db.py"
                    },
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }
            )

        logger.info("Database ready and initialized")
        return {
            "status": "ready",
            "database": {
                "connected": True,
                "initialized": True,
                "path": settings.DB_PATH,
                "tables": tables
            },
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    except Exception as e:
        logger.error(f"Readiness check failed: {e}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "database": {
                    "connected": False,
                    "initialized": False,
                    "path": settings.DB_PATH,
                    "error": str(e)
                },
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )
