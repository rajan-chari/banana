"""Configuration management using pydantic-settings."""

from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    DB_PATH: str = "agcom.db"

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # CORS
    CORS_ORIGINS: str = '["http://localhost:3000"]'

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 1  # IMPORTANT: Must be 1 for SQLite

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"

    # Database Initialization
    AUTO_INIT_DB: bool = False

    class Config:
        env_file = ".env"
        case_sensitive = True

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS_ORIGINS from JSON string to list."""
        try:
            return json.loads(self.CORS_ORIGINS)
        except json.JSONDecodeError:
            return ["http://localhost:3000"]


settings = Settings()
