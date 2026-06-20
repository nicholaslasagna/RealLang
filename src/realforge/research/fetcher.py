from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from urllib.parse import urljoin, urlparse

from realforge.research.models import ResearchOutcome, ResearchRecord
from realforge.research.safety import ResearchSafetyError, resolve_and_validate_host, validate_research_url, validate_redirect_url
from realforge.research.store import load_research_record, list_research_records, save_research_snapshot, utc_now_iso
from realforge.research.summarize import choose_source_filename, content_hash, format_citation, summarize_content

DEFAULT_MAX_BYTES = 256_000
DEFAULT_TIMEOUT_SECONDS = 15.0
DEFAULT_MAX_REDIRECTS = 5
USER_AGENT = "RealForge/0.9 research-fetcher"


class HttpResponse(Protocol):
    status: int
    headers: dict[str, str]
    body: bytes
    url: str


HttpOpener = Callable[[str, float], HttpResponse]


@dataclass(frozen=True)
class FetchResult:
    final_url: str
    status: int
    content_type: str
    body: bytes


class ResearchError(Exception):
    pass


def fetch_https_url(
    url: str,
    *,
    allow_domain: str,
    max_bytes: int = DEFAULT_MAX_BYTES,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    max_redirects: int = DEFAULT_MAX_REDIRECTS,
    opener: HttpOpener | None = None,
    resolve_host: Callable[[str, str], None] | None = None,
) -> FetchResult:
    validate_research_url(url, allow_domain=allow_domain)
    hostname = urlparse(url).hostname
    if hostname is None:
        raise ResearchSafetyError("URL must include a hostname")
    resolver = resolve_host or resolve_and_validate_host
    resolver(hostname, allow_domain=allow_domain)

    if opener is None:
        raise ResearchError("network fetch requires an HTTP opener")

    current = url
    for _ in range(max_redirects + 1):
        validate_research_url(current, allow_domain=allow_domain)
        response = opener(current, timeout)
        if response.status in {301, 302, 303, 307, 308}:
            location = response.headers.get("Location") or response.headers.get("location")
            if not location:
                raise ResearchSafetyError("redirect response missing Location header")
            next_url = urljoin(current, location)
            validate_redirect_url(next_url, allow_domain=allow_domain)
            next_host = urlparse(next_url).hostname
            if next_host is None:
                raise ResearchSafetyError("redirect URL must include a hostname")
            resolver(next_host, allow_domain=allow_domain)
            current = next_url
            continue
        if response.status >= 400:
            raise ResearchError(f"HTTP {response.status} for {current}")
        body = response.body[:max_bytes]
        if len(response.body) > max_bytes:
            raise ResearchSafetyError(f"response exceeds size limit ({max_bytes} bytes)")
        content_type = response.headers.get("Content-Type") or response.headers.get("content-type") or "text/plain"
        return FetchResult(
            final_url=current,
            status=response.status,
            content_type=content_type.split(";")[0].strip(),
            body=body,
        )
    raise ResearchSafetyError(f"too many redirects (>{max_redirects})")


def run_research_fetch(
    *,
    url: str,
    allow_domain: str,
    workspace_root: Path,
    query: str | None = None,
    opener: HttpOpener | None = None,
    resolve_host: Callable[[str, str], None] | None = None,
) -> ResearchOutcome:
    try:
        fetched = fetch_https_url(
            url,
            allow_domain=allow_domain,
            opener=opener,
            resolve_host=resolve_host,
        )
    except ResearchSafetyError as err:
        raise ResearchError(str(err)) from err

    record_id = uuid.uuid4().hex[:12]
    digest = content_hash(fetched.body)
    summary = summarize_content(fetched.body, content_type=fetched.content_type)
    source_filename = choose_source_filename(fetched.content_type)
    fetched_at = utc_now_iso()
    record = ResearchRecord(
        id=record_id,
        url=fetched.final_url,
        fetched_at=fetched_at,
        content_hash=digest,
        status=fetched.status,
        content_type=fetched.content_type,
        allow_domain=allow_domain,
        query=query,
        summary=summary,
        source_filename=source_filename,
    )
    save_research_snapshot(workspace_root, record, fetched.body)
    citation = format_citation(record_id, fetched.final_url, fetched_at)
    message = "\n".join(
        [
            "RealForge research snapshot saved",
            f"Source ID: {record_id}",
            f"Citation: {citation}",
            f"URL: {fetched.final_url}",
            f"Summary: {summary}",
        ]
    )
    return ResearchOutcome(record=record, message=message)


def format_research_list(records: tuple[ResearchRecord, ...]) -> str:
    if not records:
        return "No research snapshots found in .realforge/research/"
    lines = ["RealForge research snapshots:"]
    for record in records:
        lines.append(
            f"  - {record.id} {record.url} [{record.content_type}] fetched={record.fetched_at}"
        )
    return "\n".join(lines)


def format_research_show(record: ResearchRecord) -> str:
    lines = [
        "RealForge research snapshot",
        f"ID: {record.id}",
        f"URL: {record.url}",
        f"Fetched: {record.fetched_at}",
        f"Status: {record.status}",
        f"Content-Type: {record.content_type}",
        f"Allow domain: {record.allow_domain}",
        f"Content hash: {record.content_hash}",
        f"Source file: {record.source_filename}",
    ]
    if record.query:
        lines.append(f"Query: {record.query}")
    lines.append(f"Citation: {format_citation(record.id, record.url, record.fetched_at)}")
    lines.append("Summary:")
    lines.append(record.summary)
    return "\n".join(lines)


def build_research_context(workspace_root: Path, record_id: str) -> str:
    record = load_research_record(workspace_root, record_id)
    citation = format_citation(record.id, record.url, record.fetched_at)
    lines = [
        "## Saved Research",
        f"Citation: {citation}",
        f"Allow domain: {record.allow_domain}",
    ]
    if record.query:
        lines.append(f"Query: {record.query}")
    lines.append("Summary:")
    lines.append(record.summary)
    lines.append("Note: raw HTML/source snapshot is stored locally and not included in planning context.")
    return "\n".join(lines)


def show_research(workspace_root: Path, record_id: str) -> str:
    return format_research_show(load_research_record(workspace_root, record_id))


def list_research(workspace_root: Path) -> str:
    return format_research_list(list_research_records(workspace_root))
