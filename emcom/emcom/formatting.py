"""Display helpers for emcom CLI output."""

from __future__ import annotations

from emcom.models import Email, Identity, Thread


def short_id(uuid_str: str) -> str:
    return uuid_str[:8]


def format_inbox(emails: list[Email]) -> str:
    if not emails:
        return "Inbox is empty."
    lines = [f"{'ID':8}  {'From':12}  {'Subject':30}  {'Date':20}  Tags"]
    lines.append("-" * 80)
    for e in emails:
        tags = ", ".join(e.tags) if e.tags else ""
        date = e.created_at[:19].replace("T", " ")
        lines.append(f"{short_id(e.id)}  {e.sender:12}  {e.subject[:30]:30}  {date:20}  {tags}")
    return "\n".join(lines)


def format_email(email: Email) -> str:
    lines = [
        f"From:    {email.sender}",
        f"To:      {', '.join(email.to)}",
    ]
    if email.cc:
        lines.append(f"CC:      {', '.join(email.cc)}")
    lines.extend([
        f"Subject: {email.subject}",
        f"Date:    {email.created_at[:19].replace('T', ' ')}",
        f"ID:      {email.id}",
    ])
    if email.tags:
        lines.append(f"Tags:    {', '.join(email.tags)}")
    lines.append("")
    lines.append(email.body)
    return "\n".join(lines)


def format_thread(emails: list[Email]) -> str:
    if not emails:
        return "Thread is empty."
    parts = []
    for i, e in enumerate(emails):
        if i > 0:
            parts.append("---")
        parts.append(format_email(e))
    return "\n".join(parts)


def format_who(identities: list[Identity]) -> str:
    if not identities:
        return "No registered agents."
    lines = [f"{'Name':12}  {'Description':30}  {'Last Seen':20}"]
    lines.append("-" * 66)
    for i in identities:
        seen = i.last_seen[:19].replace("T", " ")
        lines.append(f"{i.name:12}  {i.description[:30]:30}  {seen:20}")
    return "\n".join(lines)


def format_all_mail(emails: list[Email], viewer: str) -> str:
    if not emails:
        return "No emails."
    lines = [f"{'ID':8}  {'':2}  {'From':12}  {'To':12}  {'Subject':25}  {'Date':20}  Tags"]
    lines.append("-" * 90)
    for e in emails:
        direction = ">>" if e.sender == viewer else "<<"
        to = ", ".join(e.to)
        tags = ", ".join(e.tags) if e.tags else ""
        date = e.created_at[:19].replace("T", " ")
        lines.append(f"{short_id(e.id)}  {direction}  {e.sender:12}  {to[:12]:12}  {e.subject[:25]:25}  {date:20}  {tags}")
    return "\n".join(lines)


def format_sent(emails: list[Email]) -> str:
    if not emails:
        return "No sent emails."
    lines = [f"{'ID':8}  {'To':20}  {'Subject':30}  {'Date':20}"]
    lines.append("-" * 82)
    for e in emails:
        to = ", ".join(e.to)
        date = e.created_at[:19].replace("T", " ")
        lines.append(f"{short_id(e.id)}  {to[:20]:20}  {e.subject[:30]:30}  {date:20}")
    return "\n".join(lines)


def format_threads(threads: list[Thread]) -> str:
    if not threads:
        return "No threads."
    lines = [f"{'Thread ID':8}  {'Subject':25}  {'Participants':25}  {'Emails':6}  {'Last Activity':20}"]
    lines.append("-" * 90)
    for t in threads:
        parts = ", ".join(t.participants)
        date = t.last_activity[:19].replace("T", " ")
        lines.append(f"{short_id(t.thread_id)}  {t.subject[:25]:25}  {parts[:25]:25}  {t.email_count:<6}  {date:20}")
    return "\n".join(lines)
