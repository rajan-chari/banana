from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    APP_NAME: str = "Chat Server"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///data/chat.db"

    # JWT
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    # WebSocket
    WS_HEARTBEAT_INTERVAL: int = 30

    # Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent

    model_config = {"env_prefix": "CHAT_"}


settings = Settings()
