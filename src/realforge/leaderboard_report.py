from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from realforge import __version__
from realforge.workspace import assert_path_in_workspace


@dataclass(frozen=True)
class LeaderboardRow:
    rank: int
    provider: str
    provider_model: str | None
    suite: str
    normalized_score: float
    passed: bool
    safety_failures: int
    realforge_version: str
    report_id: str
    started_at: str


@dataclass(frozen=True)
class LeaderboardTrendRow:
    provider: str
    provider_model: str | None
    suite: str
    report_count: int
    latest_score: float
    best_score: float
    first_score: float
    score_delta: float
    latest_report_id: str
    latest_started_at: str


@dataclass(frozen=True)
class LeaderboardSummary:
    realforge_version: str
    exported_at: str
    mode: str
    filters: dict[str, str | bool]
    rows: tuple[LeaderboardRow | LeaderboardTrendRow, ...]
    warnings: tuple[str, ...]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def row_to_dict(row: LeaderboardRow | LeaderboardTrendRow) -> dict:
    return asdict(row)


def summary_to_dict(summary: LeaderboardSummary) -> dict:
    payload = asdict(summary)
    payload["rows"] = [row_to_dict(item) for item in summary.rows]
    return payload


def write_leaderboard_export(summary: LeaderboardSummary, workspace_root: Path, output_path: Path) -> Path:
    root = workspace_root.resolve()
    target = output_path if output_path.is_absolute() else (root / output_path)
    target = target.resolve()
    assert_path_in_workspace(target, root)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(summary_to_dict(summary), indent=2) + "\n", encoding="utf-8")
    return target


def build_export_summary(
    *,
    mode: str,
    filters: dict[str, str | bool],
    rows: tuple[LeaderboardRow | LeaderboardTrendRow, ...],
    warnings: tuple[str, ...],
) -> LeaderboardSummary:
    return LeaderboardSummary(
        realforge_version=__version__,
        exported_at=utc_now_iso(),
        mode=mode,
        filters=filters,
        rows=rows,
        warnings=warnings,
    )
