from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from realforge.research.models import ResearchRecord
from realforge.workspace import assert_path_in_workspace


def research_root(workspace_root: Path) -> Path:
    return workspace_root / ".realforge" / "research"


def record_dir(workspace_root: Path, record_id: str) -> Path:
    return research_root(workspace_root) / record_id


def save_research_snapshot(
    workspace_root: Path,
    record: ResearchRecord,
    body: bytes,
) -> Path:
    root = workspace_root.resolve()
    directory = record_dir(root, record.id)
    metadata_path = directory / "metadata.json"
    source_path = directory / record.source_filename
    summary_path = directory / "summary.txt"
    for path in (directory, metadata_path, source_path, summary_path):
        assert_path_in_workspace(path, root)
    directory.mkdir(parents=True, exist_ok=True)
    source_path.write_bytes(body)
    summary_path.write_text(record.summary + "\n", encoding="utf-8")
    metadata_path.write_text(
        json.dumps(
            {
                "id": record.id,
                "url": record.url,
                "fetched_at": record.fetched_at,
                "content_hash": record.content_hash,
                "status": record.status,
                "content_type": record.content_type,
                "allow_domain": record.allow_domain,
                "query": record.query,
                "summary": record.summary,
                "source_filename": record.source_filename,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return directory


def load_research_record(workspace_root: Path, record_id: str) -> ResearchRecord:
    metadata_path = record_dir(workspace_root.resolve(), record_id) / "metadata.json"
    if not metadata_path.is_file():
        raise FileNotFoundError(f"research snapshot not found: {record_id}")
    data = json.loads(metadata_path.read_text(encoding="utf-8"))
    return ResearchRecord(
        id=str(data["id"]),
        url=str(data["url"]),
        fetched_at=str(data["fetched_at"]),
        content_hash=str(data["content_hash"]),
        status=int(data["status"]),
        content_type=str(data["content_type"]),
        allow_domain=str(data["allow_domain"]),
        query=data.get("query"),
        summary=str(data.get("summary", "")),
        source_filename=str(data.get("source_filename", "source.txt")),
    )


def list_research_records(workspace_root: Path) -> tuple[ResearchRecord, ...]:
    root = research_root(workspace_root.resolve())
    if not root.is_dir():
        return ()
    records: list[ResearchRecord] = []
    for metadata_path in sorted(root.glob("*/metadata.json")):
        record_id = metadata_path.parent.name
        records.append(load_research_record(workspace_root, record_id))
    return tuple(records)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
