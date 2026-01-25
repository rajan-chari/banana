"""Rendering utilities for console output."""

from agcom.models import ScreenOptions


def format_screen_output(session, options: ScreenOptions) -> str:
    """Format the inbox/screen view.

    Args:
        session: AgentCommsSession instance
        options: Screen rendering options

    Returns:
        Formatted screen output
    """
    return session.current_screen(options)


def format_thread_output(session, thread_id: str) -> str:
    """Format a thread view.

    Args:
        session: AgentCommsSession instance
        thread_id: ID of the thread to format

    Returns:
        Formatted thread output
    """
    return session.view_thread(thread_id)
