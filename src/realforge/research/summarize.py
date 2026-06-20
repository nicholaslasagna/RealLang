from __future__ import annotations

import hashlib
import re
from html import unescape


_TAG_RE = re.compile(r"<[^>]+>")
_SCRIPT_STYLE_RE = re.compile(r"(?is)<(script|style)\b.*?>.*?</\1>")


def content_hash(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def choose_source_filename(content_type: str) -> str:
    lowered = content_type.lower()
    if "html" in lowered:
        return "source.html"
    return "source.txt"


def summarize_content(body: bytes, *, content_type: str, max_chars: int = 2000) -> str:
    text = body.decode("utf-8", errors="replace")
    if "html" in content_type.lower():
        text = _strip_html(text)
    collapsed = " ".join(text.split())
    if len(collapsed) <= max_chars:
        return collapsed
    return collapsed[: max_chars - 3].rstrip() + "..."


def _strip_html(text: str) -> str:
    without_blocks = _SCRIPT_STYLE_RE.sub(" ", text)
    without_tags = _TAG_RE.sub(" ", without_blocks)
    return unescape(without_tags)


def format_citation(record_id: str, url: str, fetched_at: str) -> str:
    return f"[research:{record_id}] {url} (fetched {fetched_at})"
