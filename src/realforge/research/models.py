from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ResearchRecord:
    id: str
    url: str
    fetched_at: str
    content_hash: str
    status: int
    content_type: str
    allow_domain: str
    query: str | None
    summary: str
    source_filename: str


@dataclass(frozen=True)
class ResearchOutcome:
    record: ResearchRecord
    message: str
