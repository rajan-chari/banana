"""Command-line interface parsing and dispatch."""

import sys
import argparse
import shlex
from typing import Optional

from agcom.console import commands


def create_parser() -> argparse.ArgumentParser:
    """Create the argument parser for the console application.

    Returns:
        ArgumentParser instance
    """
    parser = argparse.ArgumentParser(
        description="Agent Communication Console",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument('--store', required=True, help='Path to SQLite database')
    parser.add_argument('--me', required=True, help='Your agent handle')

    subparsers = parser.add_subparsers(dest='command', help='Command to execute')

    # init command
    parser_init = subparsers.add_parser('init', help='Initialize a new database')
    parser_init.add_argument('--as-admin', action='store_true', help='Add yourself as admin user during initialization')

    # open command (for interactive mode)
    parser_open = subparsers.add_parser('open', help='Open a session')

    # whoami command
    parser_whoami = subparsers.add_parser('whoami', help='Display current user identity')

    # screen command
    parser_screen = subparsers.add_parser('screen', help='Display inbox')
    parser_screen.add_argument('--watch', action='store_true', help='Watch mode (continuous updates)')
    parser_screen.add_argument('--max-threads', type=int, help='Maximum number of threads to display')

    # send command
    parser_send = subparsers.add_parser('send', help='Send a new message')
    parser_send.add_argument('to', nargs='+', help='Recipient handle(s)')
    parser_send.add_argument('--subject', required=True, help='Message subject')
    parser_send.add_argument('--body', required=True, help='Message body (use @- for stdin)')
    parser_send.add_argument('--body-file', help='Read body from file')
    parser_send.add_argument('--tags', nargs='+', help='Message tags')

    # threads command
    parser_threads = subparsers.add_parser('threads', help='List threads')
    parser_threads.add_argument('--limit', type=int, help='Maximum number of threads to list')

    # view command
    parser_view = subparsers.add_parser('view', help='View a thread')
    parser_view.add_argument('thread_id', help='Thread ID to view')

    # reply command
    parser_reply = subparsers.add_parser('reply', help='Reply to a message')
    parser_reply.add_argument('message_id', help='Message ID to reply to')
    parser_reply.add_argument('--body', required=True, help='Reply body (use @- for stdin)')
    parser_reply.add_argument('--body-file', help='Read body from file')
    parser_reply.add_argument('--tags', nargs='+', help='Message tags')

    # reply-thread command
    parser_reply_thread = subparsers.add_parser('reply-thread', help='Reply to latest message in thread')
    parser_reply_thread.add_argument('thread_id', help='Thread ID to reply to')
    parser_reply_thread.add_argument('--body', required=True, help='Reply body (use @- for stdin)')
    parser_reply_thread.add_argument('--body-file', help='Read body from file')
    parser_reply_thread.add_argument('--tags', nargs='+', help='Message tags')

    # thread-meta-set command
    parser_thread_meta_set = subparsers.add_parser('thread-meta-set', help='Set thread metadata')
    parser_thread_meta_set.add_argument('thread_id', help='Thread ID')
    parser_thread_meta_set.add_argument('key', help='Metadata key')
    parser_thread_meta_set.add_argument('value', help='Metadata value (use "null" to remove key)')

    # thread-meta-get command
    parser_thread_meta_get = subparsers.add_parser('thread-meta-get', help='Get thread metadata')
    parser_thread_meta_get.add_argument('thread_id', help='Thread ID')
    parser_thread_meta_get.add_argument('key', help='Metadata key')

    # thread-archive command
    parser_thread_archive = subparsers.add_parser('thread-archive', help='Archive a thread')
    parser_thread_archive.add_argument('thread_id', help='Thread ID to archive')

    # thread-unarchive command
    parser_thread_unarchive = subparsers.add_parser('thread-unarchive', help='Unarchive a thread')
    parser_thread_unarchive.add_argument('thread_id', help='Thread ID to unarchive')

    # search command
    parser_search = subparsers.add_parser('search', help='Search messages')
    parser_search.add_argument('query', help='Search query')
    parser_search.add_argument('--limit', type=int, help='Maximum number of messages to return')

    # ab (address book) subcommands
    parser_ab = subparsers.add_parser('ab', help='Address book commands')
    ab_subparsers = parser_ab.add_subparsers(dest='ab_command', help='Address book command')

    # ab add
    parser_ab_add = ab_subparsers.add_parser('add', help='Add an address book entry')
    parser_ab_add.add_argument('handle', help='Agent handle')
    parser_ab_add.add_argument('--display-name', help='Display name')
    parser_ab_add.add_argument('--desc', help='Description')
    parser_ab_add.add_argument('--tags', nargs='*', help='Tags (space-separated)')

    # ab edit
    parser_ab_edit = ab_subparsers.add_parser('edit', help='Edit an address book entry')
    parser_ab_edit.add_argument('handle', help='Agent handle')
    parser_ab_edit.add_argument('--display-name', help='Display name')
    parser_ab_edit.add_argument('--desc', help='Description')
    parser_ab_edit.add_argument('--tags', nargs='*', help='Tags (space-separated)')
    parser_ab_edit.add_argument('--deactivate', action='store_true', help='Deactivate entry')

    # ab list
    parser_ab_list = ab_subparsers.add_parser('list', help='List address book entries')
    parser_ab_list.add_argument('--all', action='store_true', help='Include inactive entries')

    # ab show
    parser_ab_show = ab_subparsers.add_parser('show', help='Show an address book entry')
    parser_ab_show.add_argument('handle', help='Agent handle')

    # ab search
    parser_ab_search = ab_subparsers.add_parser('search', help='Search address book')
    parser_ab_search.add_argument('query', help='Search query')
    parser_ab_search.add_argument('--all', action='store_true', help='Include inactive entries')

    # ab deactivate
    parser_ab_deactivate = ab_subparsers.add_parser('deactivate', help='Deactivate an address book entry')
    parser_ab_deactivate.add_argument('handle', help='Agent handle')

    # ab history
    parser_ab_history = ab_subparsers.add_parser('history', help='Show audit history')
    parser_ab_history.add_argument('handle', help='Agent handle')
    parser_ab_history.add_argument('--limit', type=int, help='Maximum number of events to show')

    # help command
    parser_help = subparsers.add_parser('help', help='Display help message')

    # exit command (for interactive mode)
    parser_exit = subparsers.add_parser('exit', help='Exit interactive mode')

    return parser


def dispatch_command(args) -> int:
    """Dispatch a command to its handler.

    Args:
        args: Parsed command arguments

    Returns:
        Exit code (0 for success)
    """
    if not args.command:
        print("No command specified. Use 'help' for available commands.", file=sys.stderr)
        return 1

    # Map commands to handlers
    command_map = {
        'init': commands.cmd_init,
        'open': commands.cmd_open,
        'whoami': commands.cmd_whoami,
        'screen': commands.cmd_screen,
        'send': commands.cmd_send,
        'threads': commands.cmd_threads,
        'view': commands.cmd_view,
        'reply': commands.cmd_reply,
        'reply-thread': commands.cmd_reply_thread,
        'thread-meta-set': commands.cmd_thread_meta_set,
        'thread-meta-get': commands.cmd_thread_meta_get,
        'thread-archive': commands.cmd_thread_archive,
        'thread-unarchive': commands.cmd_thread_unarchive,
        'search': commands.cmd_search,
        'help': commands.cmd_help,
        'exit': commands.cmd_exit,
    }

    # Handle address book commands
    if args.command == 'ab':
        if not hasattr(args, 'ab_command') or not args.ab_command:
            print("No address book command specified", file=sys.stderr)
            return 1

        ab_command_map = {
            'add': commands.cmd_ab_add,
            'edit': commands.cmd_ab_edit,
            'list': commands.cmd_ab_list,
            'show': commands.cmd_ab_show,
            'search': commands.cmd_ab_search,
            'deactivate': commands.cmd_ab_deactivate,
            'history': commands.cmd_ab_history,
        }

        handler = ab_command_map.get(args.ab_command)
        if not handler:
            print(f"Unknown address book command: {args.ab_command}", file=sys.stderr)
            return 1

        return handler(args)

    handler = command_map.get(args.command)
    if not handler:
        print(f"Unknown command: {args.command}", file=sys.stderr)
        return 1

    return handler(args)


def run_interactive(store_path: str, me_handle: str) -> int:
    """Run in interactive mode.

    Args:
        store_path: Path to database
        me_handle: Agent handle

    Returns:
        Exit code (0 for success)
    """
    # Open session
    class Args:
        def __init__(self):
            self.store = store_path
            self.me = me_handle

    open_args = Args()
    result = commands.cmd_open(open_args)
    if result != 0:
        return result

    print("Interactive mode. Type 'help' for commands, 'exit' to quit.")

    while True:
        try:
            line = input("> ").strip()
            if not line:
                continue

            # Parse the line
            try:
                tokens = shlex.split(line)
            except ValueError as e:
                print(f"Error parsing command: {e}", file=sys.stderr)
                continue

            # Special handling for exit command
            if tokens[0] == 'exit':
                commands.cmd_exit(None)
                break

            # Special handling for help command
            if tokens[0] == 'help':
                commands.cmd_help(None)
                continue

            # Build argument list for parser
            argv = ['--store', store_path, '--me', me_handle] + tokens

            # Parse and dispatch
            parser = create_parser()
            try:
                args = parser.parse_args(argv)
                dispatch_command(args)
            except SystemExit:
                # argparse calls sys.exit on error, catch it
                continue

        except EOFError:
            # Ctrl+D pressed
            print("\nExiting...")
            commands.cmd_exit(None)
            break
        except KeyboardInterrupt:
            # Ctrl+C pressed
            print("\nUse 'exit' to quit or Ctrl+D")
            continue

    return 0


def main(argv: Optional[list[str]] = None) -> int:
    """Main entry point for the console application.

    Args:
        argv: Optional command-line arguments (defaults to sys.argv[1:])

    Returns:
        Exit code (0 for success)
    """
    if argv is None:
        argv = sys.argv[1:]

    # Check if we should run in interactive mode
    # Interactive mode if only --store and --me are provided with no command
    parser = create_parser()

    # Try to parse args
    try:
        args = parser.parse_args(argv)
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 1

    # If no command specified, enter interactive mode
    if not args.command:
        return run_interactive(args.store, args.me)

    # Single command mode
    # Open session if command needs it (all commands except 'init')
    if args.command != 'init':
        class OpenArgs:
            def __init__(self, store, me):
                self.store = store
                self.me = me

        open_args = OpenArgs(args.store, args.me)
        result = commands.cmd_open(open_args)
        if result != 0:
            return result

    try:
        return dispatch_command(args)
    finally:
        # Clean up session in single command mode
        if args.command != 'init':
            commands.cmd_exit(None)
