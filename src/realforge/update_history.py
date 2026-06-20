from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from realforge.cycle_report import cycle_report_path, list_cycle_reports
from realforge.eval_report import eval_report_path, list_eval_reports
from realforge.proposal_report import proposal_path
from realforge.proposals import list_proposals


@dataclass(frozen=True)
class HistoryEntry:
    kind: str
    record_id: str
    timestamp: str
    summary: str


def _file_timestamp(path: Path) -> str:
    if not path.is_file():
        return ""
    mtime = path.stat().st_mtime
    return datetime.fromtimestamp(mtime, tz=timezone.utc).replace(microsecond=0).isoformat()


def build_update_history(workspace_root: Path) -> tuple[HistoryEntry, ...]:
    root = workspace_root.resolve()
    entries: list[HistoryEntry] = []

    for report in list_cycle_reports(root):
        path = cycle_report_path(root, report.id)
        entries.append(
            HistoryEntry(
                kind="cycle",
                record_id=report.id,
                timestamp=_file_timestamp(path) or report.id,
                summary=(
                    f"area={report.area} proposal_created={report.proposal_created} "
                    f"stopped={report.stopped_reason}"
                ),
            )
        )

    for proposal in list_proposals(root):
        path = proposal_path(root, proposal.id)
        entries.append(
            HistoryEntry(
                kind="proposal",
                record_id=proposal.id,
                timestamp=proposal.created_at or _file_timestamp(path),
                summary=f"status={proposal.status} title={proposal.title}",
            )
        )

    for report in list_eval_reports(root):
        path = eval_report_path(root, report.id)
        entries.append(
            HistoryEntry(
                kind="eval",
                record_id=report.id,
                timestamp=report.started_at or _file_timestamp(path),
                summary=(
                    f"provider={report.provider} suite={report.suite} "
                    f"score={report.total_score} passed={report.passed}"
                ),
            )
        )

    return tuple(sorted(entries, key=lambda item: item.timestamp, reverse=True))


def format_update_history(entries: tuple[HistoryEntry, ...]) -> str:
    if not entries:
        return "No cycle, proposal, or eval records found under .realforge/"
    lines = ["RealForge update history (read-only timeline):"]
    for entry in entries:
        lines.append(f"  - [{entry.kind}] {entry.timestamp} {entry.record_id} {entry.summary}")
    return "\n".join(lines)


def list_update_history(workspace_root: Path) -> str:
    return format_update_history(build_update_history(workspace_root))
