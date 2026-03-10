"""Display helpers for emcom CLI output."""

from __future__ import annotations

from emcom.models import Email, Identity, Thread


def short_id(uuid_str: str) -> str:
    return uuid_str[:8]


def short_date(iso_str: str) -> str:
    """Format ISO timestamp as MM/DD HH:MM:SS."""
    # iso_str is like '2026-03-10T07:09:10...'
    d = iso_str[:19].replace("T", " ")
    # d = '2026-03-10 07:09:10'
    return f"{d[5:7]}/{d[8:10]} {d[11:]}"


def _trunc(s: str, width: int) -> str:
    return s if len(s) <= width else s[: width - 1] + "…"


def format_inbox(emails: list[Email], numbered: bool = False) -> str:
    if not emails:
        return "Inbox is empty."
    id_hdr = "#" if numbered else "ID"
    id_w = 4 if numbered else 8
    lines = [f"{id_hdr:{id_w}}  {'From':12}  {'Subject':30}  {'Date':14}  Tags"]
    lines.append("-" * (id_w + 2 + 12 + 2 + 30 + 2 + 14 + 2 + 4))
    for idx, e in enumerate(emails, 1):
        tags = ", ".join(e.tags) if e.tags else ""
        date = short_date(e.created_at)
        id_col = f"[{idx}]" if numbered else short_id(e.id)
        lines.append(f"{id_col:{id_w}}  {e.sender:12}  {e.subject[:30]:30}  {date:14}  {tags}")
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
        f"Date:    {short_date(email.created_at)}",
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
    desc_width = min(60, max(len("Description"), max(len(i.description) for i in identities)))
    loc_width = min(30, max(len("Location"), max((len(i.location) for i in identities), default=0)))
    lines = [f"{'Name':12}  {'Description':{desc_width}}  {'Location':{loc_width}}  {'Last Seen':14}"]
    lines.append("-" * (12 + 2 + desc_width + 2 + loc_width + 2 + 14))
    for i in identities:
        seen = short_date(i.last_seen)
        desc = _trunc(i.description, desc_width)
        loc = _trunc(i.location, loc_width)
        lines.append(f"{i.name:12}  {desc:{desc_width}}  {loc:{loc_width}}  {seen:14}")
    return "\n".join(lines)


def format_all_mail(emails: list[Email], viewer: str, numbered: bool = False) -> str:
    if not emails:
        return "No emails."
    id_hdr = "#" if numbered else "ID"
    id_w = 4 if numbered else 8
    lines = [f"{id_hdr:{id_w}}  {'':2}  {'From':12}  {'To':12}  {'Subject':25}  {'Date':14}  Tags"]
    lines.append("-" * (id_w + 2 + 2 + 2 + 12 + 2 + 12 + 2 + 25 + 2 + 14 + 2 + 4))
    for idx, e in enumerate(emails, 1):
        direction = ">>" if e.sender == viewer else "<<"
        to = ", ".join(e.to)
        tags = ", ".join(e.tags) if e.tags else ""
        date = short_date(e.created_at)
        id_col = f"[{idx}]" if numbered else short_id(e.id)
        lines.append(f"{id_col:{id_w}}  {direction}  {e.sender:12}  {to[:12]:12}  {e.subject[:25]:25}  {date:14}  {tags}")
    return "\n".join(lines)


def format_sent(emails: list[Email], numbered: bool = False) -> str:
    if not emails:
        return "No sent emails."
    id_hdr = "#" if numbered else "ID"
    id_w = 4 if numbered else 8
    lines = [f"{id_hdr:{id_w}}  {'To':20}  {'Subject':30}  {'Date':14}"]
    lines.append("-" * (id_w + 2 + 20 + 2 + 30 + 2 + 14))
    for idx, e in enumerate(emails, 1):
        to = ", ".join(e.to)
        date = short_date(e.created_at)
        id_col = f"[{idx}]" if numbered else short_id(e.id)
        lines.append(f"{id_col:{id_w}}  {to[:20]:20}  {e.subject[:30]:30}  {date:14}")
    return "\n".join(lines)


def format_threads(threads: list[Thread], numbered: bool = False) -> str:
    if not threads:
        return "No threads."
    id_hdr = "#" if numbered else "Thread ID"
    id_w = 4 if numbered else 8
    lines = [f"{id_hdr:{id_w}}  {'Subject':25}  {'Participants':25}  {'Emails':6}  {'Last Activity':14}"]
    lines.append("-" * (id_w + 2 + 25 + 2 + 25 + 2 + 6 + 2 + 14))
    for idx, t in enumerate(threads, 1):
        parts = ", ".join(t.participants)
        date = short_date(t.last_activity)
        id_col = f"[{idx}]" if numbered else short_id(t.thread_id)
        lines.append(f"{id_col:{id_w}}  {t.subject[:25]:25}  {parts[:25]:25}  {t.email_count:<6}  {date:14}")
    return "\n".join(lines)
