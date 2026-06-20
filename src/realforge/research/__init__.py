from __future__ import annotations

import ssl
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, OpenerDirector, ProxyHandler, Request, build_opener

from realforge.research.fetcher import (
    DEFAULT_MAX_BYTES,
    DEFAULT_TIMEOUT_SECONDS,
    FetchResult,
    HttpOpener,
    ResearchError,
    USER_AGENT,
    build_research_context,
    fetch_https_url,
    list_research,
    run_research_fetch,
    show_research,
)
from realforge.research.models import ResearchOutcome, ResearchRecord
from realforge.research.safety import ResearchSafetyError
from realforge.research.store import list_research_records, load_research_record

__all__ = [
    "ResearchError",
    "ResearchOutcome",
    "ResearchRecord",
    "ResearchSafetyError",
    "build_research_context",
    "default_http_opener",
    "fetch_https_url",
    "list_research",
    "list_research_records",
    "load_research_record",
    "run_research_fetch",
    "show_research",
]


@dataclass
class _UrlopenResponse:
    status: int
    headers: dict[str, str]
    body: bytes
    url: str


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def default_http_opener(max_bytes: int = DEFAULT_MAX_BYTES) -> HttpOpener:
    _ = ssl.create_default_context()
    opener: OpenerDirector = build_opener(_NoRedirectHandler(), ProxyHandler())

    def open_url(url: str, timeout: float) -> _UrlopenResponse:
        request = Request(url, headers={"User-Agent": USER_AGENT})
        try:
            response = opener.open(request, timeout=timeout)
            raw = response.read(max_bytes + 1)
            headers = {k: v for k, v in response.headers.items()}
            return _UrlopenResponse(
                status=getattr(response, "status", response.getcode()),
                headers=headers,
                body=raw,
                url=response.geturl(),
            )
        except HTTPError as err:
            body = err.read(max_bytes + 1) if err.fp else b""
            headers = {k: v for k, v in err.headers.items()} if err.headers else {}
            return _UrlopenResponse(status=err.code, headers=headers, body=body, url=url)
        except URLError as err:
            raise ResearchError(f"network error: {err.reason}") from err

    return open_url
