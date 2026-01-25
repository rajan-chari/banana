"""
Script generator - saves generated scripts to files.
"""

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass
class GeneratedScript:
    """A generated script ready for execution."""

    code: str
    """The Python code."""

    description: str | None
    """Description of what the script does."""

    filename: str
    """The generated filename."""

    filepath: Path
    """Full path where the script is saved."""

    created_at: datetime
    """When the script was generated."""


def sanitize_filename(name: str) -> str:
    """Convert a description to a safe filename."""
    # Take first 50 chars, lowercase, replace spaces with underscores
    name = name[:50].lower().strip()
    # Remove non-alphanumeric chars except underscores
    name = re.sub(r"[^a-z0-9_]", "_", name)
    # Collapse multiple underscores
    name = re.sub(r"_+", "_", name)
    # Remove leading/trailing underscores
    name = name.strip("_")
    return name or "script"


def generate_script_hash(code: str) -> str:
    """Generate a short hash for the script content."""
    return hashlib.sha256(code.encode()).hexdigest()[:8]


def save_script(
    code: str,
    scripts_dir: Path,
    description: str | None = None,
) -> GeneratedScript:
    """
    Save a generated script to the scripts directory.

    Args:
        code: The Python code to save
        scripts_dir: Directory where scripts are stored
        description: Optional description for naming

    Returns:
        GeneratedScript with the saved file info
    """
    # Ensure scripts directory exists
    scripts_dir.mkdir(parents=True, exist_ok=True)

    # Generate filename
    timestamp = datetime.now()
    date_prefix = timestamp.strftime("%Y%m%d_%H%M%S")

    if description:
        name_part = sanitize_filename(description)
        filename = f"{date_prefix}_{name_part}.py"
    else:
        script_hash = generate_script_hash(code)
        filename = f"{date_prefix}_{script_hash}.py"

    filepath = scripts_dir / filename

    # Add metadata header to script
    header_lines = [
        '"""',
        f"Generated: {timestamp.isoformat()}",
    ]
    if description:
        header_lines.append(f"Description: {description}")
    header_lines.append('"""')
    header_lines.append("")

    full_code = "\n".join(header_lines) + code

    # Save the script
    filepath.write_text(full_code, encoding="utf-8")

    return GeneratedScript(
        code=code,
        description=description,
        filename=filename,
        filepath=filepath,
        created_at=timestamp,
    )
