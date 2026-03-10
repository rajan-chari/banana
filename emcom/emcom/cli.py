"""emcom CLI entry point."""

from __future__ import annotations

import argparse
import sys

from emcom.client import EmcomClient, EmcomError
from emcom.formatting import (
    format_all_mail, format_email, format_inbox, format_sent,
    format_thread, format_threads, format_who,
)


def _make_client(args) -> EmcomClient:
    return EmcomClient(identity=args.identity, server=args.server)


def cmd_register(args):
    c = _make_client(args)
    identity = c.register(name=args.name, description=args.description or "", force=args.force)
    print(f"Registered as '{identity.name}'")


def cmd_unregister(args):
    c = _make_client(args)
    c.unregister()
    print("Unregistered. identity.json removed.")


def cmd_who(args):
    c = _make_client(args)
    identities = c.who()
    print(format_who(identities))


def cmd_update(args):
    c = _make_client(args)
    identity = c.update_description(args.description)
    print(f"Updated description for '{identity.name}'")


def cmd_inbox(args):
    c = _make_client(args)
    emails = c.inbox(unread_only=args.unread)
    print(format_inbox(emails))


def cmd_read(args):
    c = _make_client(args)
    email = c.read(args.id)
    print(format_email(email))


def cmd_send(args):
    c = _make_client(args)
    email = c.send(to=args.to, subject=args.subject, body=args.body, cc=args.cc)
    print(f"Sent [{email.id[:8]}] to {', '.join(email.to)}")


def cmd_reply(args):
    c = _make_client(args)
    email = c.reply(args.id, body=args.body)
    print(f"Replied [{email.id[:8]}] in thread {email.thread_id[:8]}")


def cmd_thread(args):
    c = _make_client(args)
    emails = c.thread(args.thread_id)
    print(format_thread(emails))


def cmd_threads(args):
    c = _make_client(args)
    thread_list = c.threads()
    print(format_threads(thread_list))


def cmd_sent(args):
    c = _make_client(args)
    emails = c.sent()
    print(format_sent(emails))


def cmd_all(args):
    c = _make_client(args)
    emails = c.all_mail()
    print(format_all_mail(emails, c.name or ""))


def cmd_tag(args):
    c = _make_client(args)
    c.tag(args.id, *args.tags)
    print(f"Tagged {args.id[:8]} with: {', '.join(args.tags)}")


def cmd_untag(args):
    c = _make_client(args)
    c.untag(args.id, args.tag)
    print(f"Removed tag '{args.tag}' from {args.id[:8]}")


def cmd_tagged(args):
    c = _make_client(args)
    emails = c.tagged(args.tag)
    print(format_inbox(emails))


def cmd_search(args):
    c = _make_client(args)
    emails = c.search(
        from_=getattr(args, "from", None),
        to=args.to,
        subject=args.subject,
        tag=args.tag,
        body=args.body,
    )
    print(format_inbox(emails))


def cmd_purge(args):
    c = _make_client(args)
    result = c.purge()
    counts = result["purged"]
    print(f"Purged: {counts['emails']} emails, {counts['tags']} tags, {counts['identities']} identities")


def cmd_names(args):
    c = _make_client(args)
    if args.add:
        added = c.add_names(args.add)
        print(f"Added {added} name(s) to pool")
    else:
        names = c.names()
        print(f"Available names ({len(names)}): {', '.join(names)}")


def main():
    # Force UTF-8 stdout/stderr on Windows (PyInstaller freezes cp1252)
    if sys.stdout.encoding != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")
    if sys.stderr.encoding != "utf-8":
        sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(prog="emcom", description="Email-metaphor messaging for AI agents")
    parser.add_argument("--server", default="http://127.0.0.1:8800", help="Server URL")
    parser.add_argument("--identity", "-i", default="identity.json", help="Path to identity file")

    sub = parser.add_subparsers(dest="command")

    # register
    p = sub.add_parser("register", help="Register an identity")
    p.add_argument("--name", "-n", default=None, help="Name (auto-assigned if omitted)")
    p.add_argument("--description", "-d", default="", help="Description")
    p.add_argument("--force", "-f", action="store_true", help="Force reclaim")
    p.set_defaults(func=cmd_register)

    # unregister
    p = sub.add_parser("unregister", help="Unregister and remove identity.json")
    p.set_defaults(func=cmd_unregister)

    # who
    p = sub.add_parser("who", help="List registered agents")
    p.set_defaults(func=cmd_who)

    # update
    p = sub.add_parser("update", help="Update your description")
    p.add_argument("--description", "-d", required=True, help="New description")
    p.set_defaults(func=cmd_update)

    # inbox
    p = sub.add_parser("inbox", help="Show inbox")
    p.add_argument("--unread", "-u", action="store_true", help="Unread only")
    p.set_defaults(func=cmd_inbox)

    # read
    p = sub.add_parser("read", help="Read a single email")
    p.add_argument("id", help="Email ID (full or short)")
    p.set_defaults(func=cmd_read)

    # send
    p = sub.add_parser("send", help="Send an email")
    p.add_argument("--to", "-t", nargs="+", required=True, help="Recipients")
    p.add_argument("--cc", nargs="+", default=[], help="CC recipients")
    p.add_argument("--subject", "-s", required=True, help="Subject")
    p.add_argument("--body", "-b", required=True, help="Body")
    p.set_defaults(func=cmd_send)

    # reply
    p = sub.add_parser("reply", help="Reply to an email")
    p.add_argument("id", help="Email ID to reply to")
    p.add_argument("--body", "-b", required=True, help="Reply body")
    p.set_defaults(func=cmd_reply)

    # thread
    p = sub.add_parser("thread", help="Show a thread")
    p.add_argument("thread_id", help="Thread ID")
    p.set_defaults(func=cmd_thread)

    # threads
    p = sub.add_parser("threads", help="List your threads")
    p.set_defaults(func=cmd_threads)

    # sent
    p = sub.add_parser("sent", help="List sent emails")
    p.set_defaults(func=cmd_sent)

    # all
    p = sub.add_parser("all", help="List all sent and received emails")
    p.set_defaults(func=cmd_all)

    # tag
    p = sub.add_parser("tag", help="Add tags to an email")
    p.add_argument("id", help="Email ID")
    p.add_argument("tags", nargs="+", help="Tags to add")
    p.set_defaults(func=cmd_tag)

    # untag
    p = sub.add_parser("untag", help="Remove a tag")
    p.add_argument("id", help="Email ID")
    p.add_argument("tag", help="Tag to remove")
    p.set_defaults(func=cmd_untag)

    # tagged
    p = sub.add_parser("tagged", help="List emails with a tag")
    p.add_argument("tag", help="Tag to filter by")
    p.set_defaults(func=cmd_tagged)

    # search
    p = sub.add_parser("search", help="Search emails")
    p.add_argument("--from", dest="from", default=None, help="From sender")
    p.add_argument("--to", default=None, help="To recipient")
    p.add_argument("--subject", default=None, help="Subject contains")
    p.add_argument("--tag", default=None, help="Has tag")
    p.add_argument("--body", default=None, help="Body contains")
    p.set_defaults(func=cmd_search)

    # purge
    p = sub.add_parser("purge", help="Delete all emails, tags, and identities")
    p.set_defaults(func=cmd_purge)

    # names
    p = sub.add_parser("names", help="List or add pool names")
    p.add_argument("--add", nargs="+", default=None, help="Names to add")
    p.set_defaults(func=cmd_names)

    args = parser.parse_args()
    if not args.command:
        _repl(parser, sub)
        return

    try:
        args.func(args)
    except EmcomError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def _repl(parser, sub):
    """Interactive REPL. Reuses the same process so no startup cost per command."""
    import re
    import shlex

    # Get global defaults for identity/server
    global_args = parser.parse_args([])

    name = None
    try:
        c = EmcomClient(identity=global_args.identity, server=global_args.server)
        name = c.name
    except Exception:
        pass

    prompt = f"emcom ({name})> " if name else "emcom> "
    print("emcom interactive mode. Type 'help' for commands, 'quit' to exit.")

    # Numbered-list state: list of (type, id) from last list command
    _last_items: list[tuple[str, str]] = []

    def _resolve_num(n: int) -> tuple[str, str] | None:
        if 1 <= n <= len(_last_items):
            return _last_items[n - 1]
        print(f"No item #{n} (last list had {len(_last_items)} items)", file=sys.stderr)
        return None

    def _client() -> EmcomClient:
        return EmcomClient(identity=global_args.identity, server=global_args.server)

    while True:
        try:
            line = input(prompt).strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not line:
            continue
        if line in ("quit", "exit", "q"):
            break
        if line == "help":
            cmds = sorted(sub.choices.keys())
            print(f"Commands: {', '.join(cmds)}")
            print("Shortcuts: <N> read item N, r <N> reply to item N")
            print("Also: help, quit")
            continue

        # --- Numbered shortcuts ---
        # bare number → read/open that item
        if re.fullmatch(r"\d+", line):
            item = _resolve_num(int(line))
            if item:
                try:
                    cl = _client()
                    if item[0] == "thread":
                        print(format_thread(cl.thread(item[1])))
                    else:
                        print(format_email(cl.read(item[1])))
                except (EmcomError, Exception) as e:
                    print(f"Error: {e}", file=sys.stderr)
            continue

        # r/reply <N> → reply to item N
        m = re.fullmatch(r"(?:r|reply)\s+(\d+)", line)
        if m:
            item = _resolve_num(int(m.group(1)))
            if item:
                try:
                    cl = _client()
                    # For threads, read the last email to reply to
                    email_id = item[1]
                    if item[0] == "thread":
                        emails = cl.thread(item[1])
                        if emails:
                            email_id = emails[-1].id
                        else:
                            print("Thread is empty.", file=sys.stderr)
                            continue
                    body = input("Reply (empty to cancel): ")
                    if body.strip():
                        reply = cl.reply(email_id, body=body)
                        print(f"Replied [{reply.id[:8]}] in thread {reply.thread_id[:8]}")
                    else:
                        print("Cancelled.")
                except (EmcomError, Exception) as e:
                    print(f"Error: {e}", file=sys.stderr)
            continue

        # --- Standard command parsing ---
        try:
            tokens = shlex.split(line)
        except ValueError as e:
            print(f"Parse error: {e}", file=sys.stderr)
            continue

        # Prepend global flags so the parser sees them
        full_tokens = ["--identity", global_args.identity, "--server", global_args.server] + tokens
        try:
            args = parser.parse_args(full_tokens)
        except SystemExit:
            # argparse calls sys.exit on error/help — catch it
            continue

        if not args.command:
            continue

        # Intercept list commands to populate numbered items
        try:
            cl = _client()
            if args.command == "inbox":
                emails = cl.inbox(unread_only=args.unread)
                _last_items = [("email", e.id) for e in emails]
                print(format_inbox(emails, numbered=True))
            elif args.command == "sent":
                emails = cl.sent()
                _last_items = [("email", e.id) for e in emails]
                print(format_sent(emails, numbered=True))
            elif args.command == "all":
                emails = cl.all_mail()
                _last_items = [("email", e.id) for e in emails]
                print(format_all_mail(emails, cl.name or "", numbered=True))
            elif args.command == "threads":
                thread_list = cl.threads()
                _last_items = [("thread", t.thread_id) for t in thread_list]
                print(format_threads(thread_list, numbered=True))
            elif args.command == "tagged":
                emails = cl.tagged(args.tag)
                _last_items = [("email", e.id) for e in emails]
                print(format_inbox(emails, numbered=True))
            elif args.command == "search":
                emails = cl.search(
                    from_=getattr(args, "from", None),
                    to=args.to, subject=args.subject,
                    tag=args.tag, body=args.body,
                )
                _last_items = [("email", e.id) for e in emails]
                print(format_inbox(emails, numbered=True))
            else:
                args.func(args)
        except EmcomError as e:
            print(f"Error: {e}", file=sys.stderr)
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)

        # Update prompt if identity changed
        try:
            c = _client()
            name = c.name
            prompt = f"emcom ({name})> " if name else "emcom> "
        except Exception:
            pass


if __name__ == "__main__":
    main()
