"""
LLM Configuration - Load and manage LLM settings.

Supports configuration via:
1. Environment variables (highest priority)
2. Markdown config file (assistant.md)
3. Default values (lowest priority)
"""

import os
from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class LLMProvider(str, Enum):
    """Supported LLM providers."""

    OPENAI = "openai"
    AZURE_OPENAI = "azure"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
    GROQ = "groq"


@dataclass
class LLMConfig:
    """Configuration for the LLM client."""

    provider: LLMProvider = LLMProvider.OPENAI
    """The LLM provider to use."""

    model: str = "gpt-5.1"
    """The model name/identifier."""

    temperature: float = 0.7
    """Temperature for generation (0.0-1.0)."""

    max_tokens: int | None = None
    """Maximum tokens in response (None = provider default)."""

    # Azure-specific settings
    azure_endpoint: str | None = None
    azure_deployment: str | None = None
    azure_api_version: str = "2024-02-01"

    # Ollama-specific settings
    ollama_host: str = "http://localhost:11434"

    # Source tracking
    config_file_path: str | None = None
    """Path to the config file that was loaded (if any)."""

    @property
    def model_string(self) -> str:
        """Get the PydanticAI model string (e.g., 'openai:gpt-4o')."""
        if self.provider == LLMProvider.AZURE_OPENAI:
            return f"azure:{self.model}"
        elif self.provider == LLMProvider.OLLAMA:
            return f"ollama:{self.model}"
        elif self.provider == LLMProvider.ANTHROPIC:
            return f"anthropic:{self.model}"
        elif self.provider == LLMProvider.GROQ:
            return f"groq:{self.model}"
        else:
            return f"openai:{self.model}"

    @classmethod
    def from_env(cls) -> "LLMConfig":
        """Load configuration from environment variables only."""
        provider_str = os.getenv("LLM_PROVIDER", "openai").lower()
        try:
            provider = LLMProvider(provider_str)
        except ValueError:
            provider = LLMProvider.OPENAI

        return cls(
            provider=provider,
            model=os.getenv("LLM_MODEL", "gpt-5.1"),
            temperature=float(os.getenv("LLM_TEMPERATURE", "0.7")),
            max_tokens=int(os.getenv("LLM_MAX_TOKENS")) if os.getenv("LLM_MAX_TOKENS") else None,
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
            azure_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT"),
            azure_api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"),
            ollama_host=os.getenv("OLLAMA_HOST", "http://localhost:11434"),
        )

    @classmethod
    def load(cls, config_dir: str | Path | None = None) -> "LLMConfig":
        """
        Load configuration from config file and environment variables.

        Priority (highest to lowest):
        1. Environment variables
        2. Markdown config file
        3. Default values

        Args:
            config_dir: Directory to search for config files.
                       Defaults to ./config/ or current directory.

        Returns:
            LLMConfig with merged settings
        """
        # Start with defaults
        config = cls()

        # Try to load from markdown config file
        config_file = _find_config_file(config_dir)
        if config_file:
            config = _load_from_markdown(config_file, config)
            config.config_file_path = str(config_file)

        # Override with environment variables (highest priority)
        config = _override_from_env(config)

        return config


def _find_config_file(config_dir: str | Path | None = None) -> Path | None:
    """Find the assistant config file."""
    search_paths = []

    if config_dir:
        config_dir = Path(config_dir)
        search_paths.append(config_dir / "assistant.md")
        search_paths.append(config_dir / "assistant.sample.md")

    # Standard locations
    search_paths.extend([
        Path("config/assistant.md"),
        Path("config/assistant.sample.md"),
        Path("assistant.md"),
        Path.home() / ".my-assist" / "config.md",
    ])

    for path in search_paths:
        if path.exists():
            return path

    return None


def _load_from_markdown(file_path: Path, config: LLMConfig) -> LLMConfig:
    """Load LLM settings from markdown config file."""
    try:
        from assistant.config.parser import parse_config_file

        parsed = parse_config_file(file_path)

        if parsed.llm.provider:
            try:
                config.provider = LLMProvider(parsed.llm.provider.lower())
            except ValueError:
                pass

        if parsed.llm.model:
            config.model = parsed.llm.model

        if parsed.llm.temperature is not None:
            config.temperature = parsed.llm.temperature

    except Exception:
        # If parsing fails, continue with existing config
        pass

    return config


def _override_from_env(config: LLMConfig) -> LLMConfig:
    """Override config values with environment variables if set."""
    # Provider
    if os.getenv("LLM_PROVIDER"):
        try:
            config.provider = LLMProvider(os.getenv("LLM_PROVIDER", "").lower())
        except ValueError:
            pass

    # Model
    if os.getenv("LLM_MODEL"):
        config.model = os.getenv("LLM_MODEL", config.model)

    # Temperature
    if os.getenv("LLM_TEMPERATURE"):
        try:
            config.temperature = float(os.getenv("LLM_TEMPERATURE", ""))
        except ValueError:
            pass

    # Max tokens
    if os.getenv("LLM_MAX_TOKENS"):
        try:
            config.max_tokens = int(os.getenv("LLM_MAX_TOKENS", ""))
        except ValueError:
            pass

    # Azure settings
    if os.getenv("AZURE_OPENAI_ENDPOINT"):
        config.azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    if os.getenv("AZURE_OPENAI_DEPLOYMENT"):
        config.azure_deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
    if os.getenv("AZURE_OPENAI_API_VERSION"):
        config.azure_api_version = os.getenv("AZURE_OPENAI_API_VERSION", config.azure_api_version)

    # Ollama settings
    if os.getenv("OLLAMA_HOST"):
        config.ollama_host = os.getenv("OLLAMA_HOST", config.ollama_host)

    return config


# Global config instance
_config: LLMConfig | None = None


def get_config(config_dir: str | Path | None = None) -> LLMConfig:
    """
    Get the current LLM configuration.

    Loads from config file + environment on first call, then caches.
    """
    global _config
    if _config is None:
        _config = LLMConfig.load(config_dir)
    return _config


def set_config(config: LLMConfig) -> None:
    """Set the LLM configuration."""
    global _config
    _config = config


def reload_config(config_dir: str | Path | None = None) -> LLMConfig:
    """Force reload configuration from files and environment."""
    global _config
    _config = LLMConfig.load(config_dir)
    return _config
