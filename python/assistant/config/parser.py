"""
Config Parser - Parse markdown configuration files.

Extracts structured settings from natural-language markdown config files.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class LLMSettings:
    """LLM settings extracted from config."""

    provider: str | None = None
    model: str | None = None
    temperature: float | None = None


@dataclass
class DirectorySettings:
    """Directory access settings."""

    allowed: list[str] = field(default_factory=list)
    forbidden: list[str] = field(default_factory=list)


@dataclass
class PermissionSettings:
    """Permission settings for various operations."""

    # File access
    file_read_allowed: list[str] = field(default_factory=list)
    file_read_confirm: list[str] = field(default_factory=list)
    file_write_confirm: bool = True
    file_delete_confirm: bool = True

    # Script execution
    script_show_code: bool = True
    script_approved_tools_auto: bool = True

    # Other operations requiring confirmation
    shell_commands_confirm: bool = True
    package_install_confirm: bool = True
    network_requests_confirm: bool = True

    # Secrets
    secrets_allow_env_read: bool = True
    secrets_never_log: bool = True
    secrets_never_send: bool = True


@dataclass
class ToolSettings:
    """Tool library settings."""

    storage_path: str = "~/.my-assist/tools/"
    require_approval: bool = True
    save_original_script: bool = True
    auto_generate_description: bool = True


@dataclass
class AgcomSettings:
    """Multi-agent communication settings."""

    enabled: bool = True
    api_url: str = "http://localhost:8000"
    handle: str = ""
    display_name: str | None = None
    auto_login: bool = True
    poll_interval_seconds: int = 30


@dataclass
class AssistantConfig:
    """Complete assistant configuration from markdown file."""

    llm: LLMSettings = field(default_factory=LLMSettings)
    directories: DirectorySettings = field(default_factory=DirectorySettings)
    permissions: PermissionSettings = field(default_factory=PermissionSettings)
    tools: ToolSettings = field(default_factory=ToolSettings)
    agcom: AgcomSettings = field(default_factory=AgcomSettings)

    # Raw sections for custom parsing
    raw_sections: dict[str, str] = field(default_factory=dict)


def parse_config_file(file_path: str | Path) -> AssistantConfig:
    """
    Parse a markdown configuration file into structured settings.

    Args:
        file_path: Path to the markdown config file

    Returns:
        AssistantConfig with extracted settings
    """
    file_path = Path(file_path)
    if not file_path.exists():
        return AssistantConfig()

    content = file_path.read_text(encoding="utf-8")
    return parse_config_content(content)


def parse_config_content(content: str) -> AssistantConfig:
    """
    Parse markdown configuration content into structured settings.

    Args:
        content: Markdown content string

    Returns:
        AssistantConfig with extracted settings
    """
    config = AssistantConfig()

    # Split into sections by ## headers
    sections = _split_sections(content)
    config.raw_sections = sections

    # Parse LLM Settings
    if "LLM Settings" in sections:
        config.llm = _parse_llm_settings(sections["LLM Settings"])

    # Parse Directories
    if "Directories" in sections:
        config.directories = _parse_directory_settings(sections["Directories"])

    # Parse Environment (permissions)
    if "Environment" in sections:
        config.permissions = _parse_permission_settings(sections["Environment"])

    # Parse Tool Library
    if "Tool Library" in sections:
        config.tools = _parse_tool_settings(sections["Tool Library"])

    # Parse Multi-Agent Communication
    if "Multi-Agent Communication (agcom)" in sections:
        config.agcom = _parse_agcom_settings(sections["Multi-Agent Communication (agcom)"])
    elif "Multi-Agent Communication" in sections:
        config.agcom = _parse_agcom_settings(sections["Multi-Agent Communication"])

    return config


def _split_sections(content: str) -> dict[str, str]:
    """Split markdown content into sections by ## headers."""
    sections = {}
    current_section = None
    current_content = []

    for line in content.split("\n"):
        if line.startswith("## "):
            if current_section:
                sections[current_section] = "\n".join(current_content)
            current_section = line[3:].strip()
            current_content = []
        elif current_section:
            current_content.append(line)

    if current_section:
        sections[current_section] = "\n".join(current_content)

    return sections


def _parse_llm_settings(content: str) -> LLMSettings:
    """Parse LLM settings from section content."""
    settings = LLMSettings()

    # Look for "- Provider: value" pattern
    provider_match = re.search(r"-\s*Provider:\s*(\w+)", content, re.IGNORECASE)
    if provider_match:
        settings.provider = provider_match.group(1).lower()

    # Look for "- Model: value" pattern
    model_match = re.search(r"-\s*Model:\s*([\w\-\.]+)", content, re.IGNORECASE)
    if model_match:
        settings.model = model_match.group(1)

    # Look for "- Temperature: value" pattern (first number found)
    temp_match = re.search(r"-\s*Temperature:\s*([\d.]+)", content, re.IGNORECASE)
    if temp_match:
        try:
            settings.temperature = float(temp_match.group(1))
        except ValueError:
            pass

    return settings


def _parse_directory_settings(content: str) -> DirectorySettings:
    """Parse directory settings from section content."""
    settings = DirectorySettings()

    # Split by ### subsections
    in_allowed = False
    in_forbidden = False

    for line in content.split("\n"):
        line_lower = line.lower().strip()

        if "allowed" in line_lower and line.startswith("###"):
            in_allowed = True
            in_forbidden = False
        elif "forbidden" in line_lower and line.startswith("###"):
            in_allowed = False
            in_forbidden = True
        elif line.strip().startswith("- "):
            # Extract path from "- ~/projects — description" or "- ~/projects"
            path_part = line.strip()[2:].split("—")[0].split("-")[0].strip()
            if path_part:
                if in_allowed:
                    settings.allowed.append(path_part)
                elif in_forbidden:
                    settings.forbidden.append(path_part)

    return settings


def _parse_permission_settings(content: str) -> PermissionSettings:
    """Parse permission settings from section content."""
    settings = PermissionSettings()
    content_lower = content.lower()

    # File access patterns
    if "read any file" in content_lower and "projects" in content_lower:
        settings.file_read_allowed.append("~/projects")

    if "must ask before" in content_lower:
        if "writing" in content_lower or "modifying" in content_lower:
            settings.file_write_confirm = True
        if "deleting" in content_lower:
            settings.file_delete_confirm = True

    # Script execution
    if "show me the code" in content_lower or "show the code" in content_lower:
        settings.script_show_code = True

    if "approved tools" in content_lower and "without confirmation" in content_lower:
        settings.script_approved_tools_auto = True

    # Commands and packages
    if "shell commands" in content_lower and "ask before" in content_lower:
        settings.shell_commands_confirm = True

    if "installing" in content_lower and "packages" in content_lower:
        settings.package_install_confirm = True

    if "network requests" in content_lower and "ask before" in content_lower:
        settings.network_requests_confirm = True

    # Secrets
    if "environment variables" in content_lower and "api keys" in content_lower:
        settings.secrets_allow_env_read = True

    if "never log" in content_lower or "never display" in content_lower:
        settings.secrets_never_log = True

    if "never send" in content_lower:
        settings.secrets_never_send = True

    return settings


def _parse_tool_settings(content: str) -> ToolSettings:
    """Parse tool library settings from section content."""
    settings = ToolSettings()

    # Look for storage path
    path_match = re.search(r"stored in:\s*`?([^`\n]+)`?", content, re.IGNORECASE)
    if path_match:
        settings.storage_path = path_match.group(1).strip()

    content_lower = content.lower()

    if "explicit approval" in content_lower or "require" in content_lower:
        settings.require_approval = True

    if "save a copy" in content_lower or "original script" in content_lower:
        settings.save_original_script = True

    if "generate a description" in content_lower or "auto" in content_lower:
        settings.auto_generate_description = True

    return settings


def _parse_agcom_settings(content: str) -> AgcomSettings:
    """Parse agcom settings from section content."""
    settings = AgcomSettings()
    content_lower = content.lower()

    # Check if enabled/disabled
    if "disabled" in content_lower or "not enabled" in content_lower:
        settings.enabled = False
    elif "enabled" in content_lower:
        settings.enabled = True

    # Look for API URL
    url_match = re.search(r"(?:api\s+url|url):\s*([^\s\n]+)", content, re.IGNORECASE)
    if url_match:
        settings.api_url = url_match.group(1).strip()

    # Look for handle
    handle_match = re.search(r"handle:\s*(\w+)", content, re.IGNORECASE)
    if handle_match:
        settings.handle = handle_match.group(1)

    # Look for display name
    display_match = re.search(
        r"(?:display\s+name|name):\s*([^\n]+)", content, re.IGNORECASE
    )
    if display_match:
        name = display_match.group(1).strip()
        # Remove quotes if present
        if name.startswith('"') and name.endswith('"'):
            name = name[1:-1]
        if name.startswith("'") and name.endswith("'"):
            name = name[1:-1]
        settings.display_name = name if name else None

    # Look for auto-login setting
    if "auto" in content_lower and "login" in content_lower:
        if "disabled" in content_lower or "false" in content_lower:
            settings.auto_login = False
        else:
            settings.auto_login = True

    # Look for poll interval
    poll_match = re.search(
        r"(?:poll|polling)\s+(?:interval|period):\s*(\d+)", content, re.IGNORECASE
    )
    if poll_match:
        try:
            settings.poll_interval_seconds = int(poll_match.group(1))
        except ValueError:
            pass

    return settings


def find_config_file() -> Path | None:
    """
    Find the assistant config file in standard locations.

    Searches in order:
    1. ./config/assistant.md
    2. ./assistant.md
    3. ~/.my-assist/config.md

    Returns:
        Path to config file if found, None otherwise
    """
    search_paths = [
        Path("config/assistant.md"),
        Path("assistant.md"),
        Path.home() / ".my-assist" / "config.md",
    ]

    for path in search_paths:
        if path.exists():
            return path

    # Check for sample file as fallback
    sample_path = Path("config/assistant.sample.md")
    if sample_path.exists():
        return sample_path

    return None
