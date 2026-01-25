"""Enhanced formatting utilities for console output."""

import os
import sys
import textwrap
from datetime import datetime, timezone
from typing import Optional


# Check if terminal supports Unicode
def _supports_unicode() -> bool:
    """Check if terminal supports Unicode characters."""
    try:
        # Try to encode a Unicode character
        "●".encode(sys.stdout.encoding or 'ascii')
        return True
    except (UnicodeEncodeError, AttributeError):
        return False


USE_UNICODE = _supports_unicode()


# ANSI color codes
class Colors:
    """ANSI color codes for terminal output."""
    RESET = '\033[0m'
    BOLD = '\033[1m'
    DIM = '\033[2m'

    # Foreground colors
    BLACK = '\033[30m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    MAGENTA = '\033[35m'
    CYAN = '\033[36m'
    WHITE = '\033[37m'

    # Bright foreground colors
    BRIGHT_BLACK = '\033[90m'
    BRIGHT_RED = '\033[91m'
    BRIGHT_GREEN = '\033[92m'
    BRIGHT_YELLOW = '\033[93m'
    BRIGHT_BLUE = '\033[94m'
    BRIGHT_MAGENTA = '\033[95m'
    BRIGHT_CYAN = '\033[96m'
    BRIGHT_WHITE = '\033[97m'


# Check if colors should be enabled
def _colors_enabled() -> bool:
    """Check if terminal supports colors."""
    # Disable colors if NO_COLOR env var is set
    if os.environ.get('NO_COLOR'):
        return False

    # Disable colors if not a TTY
    if not sys.stdout.isatty():
        return False

    # Enable colors by default on Unix-like systems
    return True


USE_COLORS = _colors_enabled()


def colorize(text: str, color: str) -> str:
    """Apply color to text if colors are enabled.

    Args:
        text: Text to colorize
        color: ANSI color code

    Returns:
        Colorized text or plain text if colors disabled
    """
    if not USE_COLORS:
        return text
    return f"{color}{text}{Colors.RESET}"


def bold(text: str) -> str:
    """Make text bold."""
    return colorize(text, Colors.BOLD)


def dim(text: str) -> str:
    """Make text dim."""
    return colorize(text, Colors.DIM)


def truncate_smart(text: str, width: int, placeholder: str = "...") -> str:
    """Truncate text intelligently, preserving readability.

    Args:
        text: Text to truncate
        width: Maximum width
        placeholder: Placeholder for truncated text

    Returns:
        Truncated text
    """
    if not text:
        return ""

    if len(text) <= width:
        return text

    if width <= len(placeholder):
        return placeholder[:width]

    # For very short widths, just truncate
    if width < 10:
        return text[:width - len(placeholder)] + placeholder

    # Try to break at word boundary
    truncated = text[:width - len(placeholder)]
    last_space = truncated.rfind(' ')

    if last_space > width // 2:  # Only break at word if it's not too early
        truncated = truncated[:last_space]

    return truncated + placeholder


def wrap_text(text: str, width: int, indent: str = "") -> list[str]:
    """Wrap text to specified width with optional indent.

    Args:
        text: Text to wrap
        width: Maximum width per line
        indent: Indent string for wrapped lines

    Returns:
        List of wrapped lines
    """
    if not text:
        return [""]

    # Handle existing newlines
    lines = []
    for line in text.split('\n'):
        if not line.strip():
            lines.append("")
        else:
            wrapped = textwrap.wrap(
                line,
                width=width,
                subsequent_indent=indent,
                break_long_words=False,
                break_on_hyphens=False
            )
            lines.extend(wrapped if wrapped else [""])

    return lines


def format_relative_time(dt: datetime) -> str:
    """Format datetime as relative time (e.g., '2 hours ago').

    Args:
        dt: Datetime to format

    Returns:
        Relative time string
    """
    now = datetime.now(timezone.utc)

    # Ensure dt is timezone-aware
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    diff = now - dt
    seconds = diff.total_seconds()

    if seconds < 60:
        return "just now"
    elif seconds < 3600:
        mins = int(seconds / 60)
        return f"{mins}m ago"
    elif seconds < 86400:
        hours = int(seconds / 3600)
        return f"{hours}h ago"
    elif seconds < 604800:
        days = int(seconds / 86400)
        return f"{days}d ago"
    elif seconds < 2592000:
        weeks = int(seconds / 604800)
        return f"{weeks}w ago"
    else:
        months = int(seconds / 2592000)
        return f"{months}mo ago"


def format_timestamp(dt: datetime, show_relative: bool = True) -> str:
    """Format timestamp with optional relative time.

    Args:
        dt: Datetime to format
        show_relative: If True, show relative time for recent dates

    Returns:
        Formatted timestamp
    """
    if show_relative:
        now = datetime.now(timezone.utc)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)

        diff = now - dt

        # Show relative time for last 7 days
        if diff.total_seconds() < 604800:
            return format_relative_time(dt)

    # Show absolute time for older dates
    return dt.strftime('%b %d %H:%M')


def sanitize_text(text: str, max_length: Optional[int] = None) -> str:
    """Sanitize text for display, handling control characters.

    Args:
        text: Text to sanitize
        max_length: Optional maximum length

    Returns:
        Sanitized text
    """
    if not text:
        return ""

    # Replace control characters (except newlines and tabs)
    sanitized = ""
    for char in text:
        if char == '\n' or char == '\t':
            sanitized += char
        elif ord(char) < 32 or ord(char) == 127:
            sanitized += '�'
        else:
            sanitized += char

    if max_length and len(sanitized) > max_length:
        sanitized = truncate_smart(sanitized, max_length)

    return sanitized


def format_header(title: str, width: int = 80) -> str:
    """Format a section header.

    Args:
        title: Header title
        width: Total width

    Returns:
        Formatted header
    """
    lines = []
    lines.append(bold(title))
    lines.append(colorize("=" * width, Colors.DIM))
    return "\n".join(lines)


def format_separator(width: int = 80) -> str:
    """Format a separator line.

    Args:
        width: Line width

    Returns:
        Formatted separator
    """
    return colorize("-" * width, Colors.DIM)


def format_label(label: str, value: str, label_width: int = 15) -> str:
    """Format a label-value pair.

    Args:
        label: Label text
        value: Value text
        label_width: Width of label column

    Returns:
        Formatted label-value line
    """
    label_formatted = colorize(f"{label}:", Colors.CYAN)
    return f"{label_formatted:<{label_width + len(Colors.CYAN) + len(Colors.RESET)}} {value}"


def format_table_row(columns: list[str], widths: list[int], colors: Optional[list[str]] = None) -> str:
    """Format a table row with proper column widths.

    Args:
        columns: Column values
        widths: Column widths
        colors: Optional color for each column

    Returns:
        Formatted table row
    """
    if colors is None:
        colors = [None] * len(columns)

    parts = []
    for col, width, color in zip(columns, widths, colors):
        # Truncate if needed
        col_text = truncate_smart(col, width)

        # Apply color if specified
        if color and USE_COLORS:
            # Calculate padding before applying color
            padding = width - len(col_text)
            col_text = f"{color}{col_text}{Colors.RESET}{' ' * padding}"
        else:
            col_text = f"{col_text:<{width}}"

        parts.append(col_text)

    return "  ".join(parts)


def format_box(lines: list[str], title: Optional[str] = None, width: int = 78) -> str:
    """Format text in a box.

    Args:
        lines: Lines of text to box
        title: Optional title for box
        width: Box width

    Returns:
        Boxed text
    """
    top = "┌" + "─" * (width - 2) + "┐"
    bottom = "└" + "─" * (width - 2) + "┘"

    if title:
        title_len = len(title) + 2
        if title_len < width - 4:
            top = f"┌─ {title} " + "─" * (width - title_len - 2) + "┐"

    boxed = [colorize(top, Colors.DIM)]

    for line in lines:
        # Wrap if needed
        if len(line) > width - 4:
            wrapped = wrap_text(line, width - 4)
            for wrapped_line in wrapped:
                padded = wrapped_line.ljust(width - 4)
                boxed.append(colorize("│ ", Colors.DIM) + padded + colorize(" │", Colors.DIM))
        else:
            padded = line.ljust(width - 4)
            boxed.append(colorize("│ ", Colors.DIM) + padded + colorize(" │", Colors.DIM))

    boxed.append(colorize(bottom, Colors.DIM))

    return "\n".join(boxed)


def get_bullet() -> str:
    """Get bullet character (Unicode or ASCII fallback)."""
    return "•" if USE_UNICODE else "*"


def get_indicator() -> str:
    """Get indicator character (Unicode or ASCII fallback)."""
    return "●" if USE_UNICODE else "*"


def get_arrow() -> str:
    """Get arrow character (Unicode or ASCII fallback)."""
    return "→" if USE_UNICODE else "->"


def get_reply_arrow() -> str:
    """Get reply arrow character (Unicode or ASCII fallback)."""
    return "↳" if USE_UNICODE else "'->"


def get_separator() -> str:
    """Get separator character (Unicode or ASCII fallback)."""
    return "│" if USE_UNICODE else "|"


def format_bullet_list(items: list[str], bullet: Optional[str] = None, indent: int = 2) -> str:
    """Format a bullet list.

    Args:
        items: List items
        bullet: Bullet character (defaults to • or * based on Unicode support)
        indent: Indent level

    Returns:
        Formatted bullet list
    """
    if bullet is None:
        bullet = get_bullet()

    lines = []
    bullet_str = colorize(bullet, Colors.CYAN)
    indent_str = " " * indent

    for item in items:
        lines.append(f"{indent_str}{bullet_str} {item}")

    return "\n".join(lines)
