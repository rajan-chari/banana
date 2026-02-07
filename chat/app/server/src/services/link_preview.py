import asyncio
import logging
import re
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

from ..db.engine import async_session
from ..db.models import LinkPreview

logger = logging.getLogger(__name__)

MAX_PREVIEWS_PER_MESSAGE = 3
FETCH_TIMEOUT = 5.0

# Matches http/https URLs in text
_URL_PATTERN = re.compile(
    r"https?://[^\s<>\"\')]+",
    re.IGNORECASE,
)


def extract_urls(content: str) -> list[str]:
    """Extract up to MAX_PREVIEWS_PER_MESSAGE unique URLs from message content."""
    seen: set[str] = set()
    urls: list[str] = []
    for match in _URL_PATTERN.finditer(content):
        url = match.group(0).rstrip(".,;:!?")
        if url not in seen:
            seen.add(url)
            urls.append(url)
            if len(urls) >= MAX_PREVIEWS_PER_MESSAGE:
                break
    return urls


class _MetaParser(HTMLParser):
    """Minimal HTML parser to extract OG and meta tags."""

    def __init__(self):
        super().__init__()
        self.og_title: str | None = None
        self.og_description: str | None = None
        self.og_image: str | None = None
        self.title: str | None = None
        self.meta_description: str | None = None
        self._in_title = False
        self._title_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        attr_dict = {k.lower(): v for k, v in attrs if v is not None}

        if tag == "title":
            self._in_title = True
            self._title_parts = []

        if tag == "meta":
            prop = attr_dict.get("property", "").lower()
            name = attr_dict.get("name", "").lower()
            content = attr_dict.get("content", "")

            if prop == "og:title":
                self.og_title = content
            elif prop == "og:description":
                self.og_description = content
            elif prop == "og:image":
                self.og_image = content
            elif name == "description" and self.meta_description is None:
                self.meta_description = content

    def handle_data(self, data: str):
        if self._in_title:
            self._title_parts.append(data)

    def handle_endtag(self, tag: str):
        if tag == "title" and self._in_title:
            self._in_title = False
            self.title = "".join(self._title_parts).strip()


async def fetch_metadata(url: str) -> dict | None:
    """Fetch a URL and extract Open Graph / meta tag metadata.

    Returns a dict with title, description, image_url, domain,
    or None if the fetch fails.
    """
    parsed = urlparse(url)
    domain = parsed.netloc or parsed.hostname or ""

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=FETCH_TIMEOUT,
        ) as client:
            resp = await client.get(
                url,
                headers={"User-Agent": "ChatBot/1.0 LinkPreview"},
            )
            if resp.status_code >= 400:
                return None

            content_type = resp.headers.get("content-type", "")
            if "text/html" not in content_type:
                return None

            html = resp.text[:100_000]  # limit parsing to first 100KB

    except Exception:
        logger.debug("Failed to fetch URL for link preview: %s", url, exc_info=True)
        return None

    parser = _MetaParser()
    try:
        parser.feed(html)
    except Exception:
        logger.debug("Failed to parse HTML for link preview: %s", url, exc_info=True)
        return None

    title = parser.og_title or parser.title
    description = parser.og_description or parser.meta_description

    return {
        "url": url,
        "title": title,
        "description": description[:500] if description else None,
        "image_url": parser.og_image,
        "domain": domain,
    }


async def process_link_previews(message_id: str, chat_id: str, content: str):
    """Extract URLs from content, fetch metadata, and save LinkPreview records.

    Designed to run as a background task after message send.
    """
    urls = extract_urls(content)
    if not urls:
        return

    # Fetch metadata for all URLs concurrently
    tasks = [fetch_metadata(url) for url in urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    previews_data = []
    for result in results:
        if isinstance(result, dict) and result is not None:
            previews_data.append(result)

    if not previews_data:
        return

    # Save to database
    async with async_session() as db:
        for data in previews_data:
            preview = LinkPreview(
                message_id=message_id,
                url=data["url"],
                title=data["title"],
                description=data["description"],
                image_url=data["image_url"],
                domain=data["domain"],
            )
            db.add(preview)
        await db.commit()

    # Broadcast preview update via WebSocket
    from ..ws.manager import manager

    preview_payloads = [
        {
            "url": d["url"],
            "title": d["title"],
            "description": d["description"],
            "imageUrl": d["image_url"],
            "domain": d["domain"],
        }
        for d in previews_data
    ]

    await manager.broadcast_to_chat(chat_id, {
        "type": "message.link_previews",
        "payload": {
            "chatId": chat_id,
            "messageId": message_id,
            "linkPreviews": preview_payloads,
        },
    })
