from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from realforge.workspace import assert_path_in_workspace


MAX_CYCLE_BUDGET = 3


@dataclass(frozen=True)
class CycleAttempt:
    number: int
    experiment_id: str
    experiment_report_path: str
    passed: bool
    proposal_id: str | None
    failures: tuple[str, ...]


@dataclass(frozen=True)
class CycleReport:
    id: str
    area: str
    budget: int
    attempts: tuple[CycleAttempt, ...]
    research_ids: tuple[str, ...]
    patch_file: str | None
    experiment_reports: tuple[str, ...]
    proposal_ids: tuple[str, ...]
    passed: bool
    stopped_reason: str
    next_steps: tuple[str, ...]
    duration_ms: int
    main_workspace_modified: bool
    safety_notes: tuple[str, ...]


def cycles_dir(workspace_root: Path) -> Path:
    return workspace_root / ".realforge" / "cycles"


def cycle_report_path(workspace_root: Path, cycle_id: str) -> Path:
    return cycles_dir(workspace_root) / f"{cycle_id}.json"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _attempt_to_dict(attempt: CycleAttempt) -> dict:
    return asdict(attempt)


def _attempt_from_dict(data: dict) -> CycleAttempt:
    return CycleAttempt(
        number=int(data["number"]),
        experiment_id=str(data["experiment_id"]),
        experiment_report_path=str(data["experiment_report_path"]),
        passed=bool(data["passed"]),
        proposal_id=data.get("proposal_id"),
        failures=tuple(str(item) for item in data.get("failures", [])),
    )


def report_to_dict(report: CycleReport) -> dict:
    payload = asdict(report)
    payload["attempts"] = [_attempt_to_dict(item) for item in report.attempts]
    return payload


def write_cycle_report(report: CycleReport, workspace_root: Path) -> Path:
    root = workspace_root.resolve()
    path = cycle_report_path(root, report.id)
    assert_path_in_workspace(path, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report_to_dict(report), indent=2) + "\n", encoding="utf-8")
    return path


def load_cycle_report(workspace_root: Path, cycle_id: str) -> CycleReport:
    path = cycle_report_path(workspace_root.resolve(), cycle_id)
    if not path.is_file():
        raise FileNotFoundError(f"cycle report not found: {cycle_id}")
    data = json.loads(path.read_text(encoding="utf-8"))
    attempts = tuple(_attempt_from_dict(item) for item in data.get("attempts", []))
    return CycleReport(
        id=str(data["id"]),
        area=str(data["area"]),
        budget=int(data["budget"]),
        attempts=attempts,
        research_ids=tuple(str(item) for item in data.get("research_ids", [])),
        patch_file=data.get("patch_file"),
        experiment_reports=tuple(str(item) for item in data.get("experiment_reports", [])),
        proposal_ids=tuple(str(item) for item in data.get("proposal_ids", [])),
        passed=bool(data.get("passed", False)),
        stopped_reason=str(data.get("stopped_reason", "")),
        next_steps=tuple(str(item) for item in data.get("next_steps", [])),
        duration_ms=int(data.get("duration_ms", 0)),
        main_workspace_modified=bool(data.get("main_workspace_modified", False)),
        safety_notes=tuple(str(item) for item in data.get("safety_notes", [])),
    )


def list_cycle_reports(workspace_root: Path) -> tuple[CycleReport, ...]:
    root = cycles_dir(workspace_root.resolve())
    if not root.is_dir():
        return ()
    reports: list[CycleReport] = []
    for path in sorted(root.glob("*.json")):
        reports.append(load_cycle_report(workspace_root, path.stem))
    return tuple(reports)


def format_cycle_report(report: CycleReport) -> str:
    lines = [
        "RealForge cycle report",
        f"ID: {report.id}",
        f"Area: {report.area}",
        f"Budget: {report.budget}",
        f"Passed: {report.passed}",
        f"Stopped: {report.stopped_reason}",
        f"Duration: {report.duration_ms} ms",
        f"Main workspace modified: {report.main_workspace_modified}",
    ]
    if report.patch_file:
        lines.append(f"Patch file: {report.patch_file}")
    if report.research_ids:
        lines.append(f"Research IDs: {', '.join(report.research_ids)}")
    if report.attempts:
        lines.append("Attempts:")
        for attempt in report.attempts:
            status = "PASS" if attempt.passed else "FAIL"
            lines.append(
                f"  - #{attempt.number} [{status}] experiment={attempt.experiment_id} proposal={attempt.proposal_id or '-'}"
            )
    if report.experiment_reports:
        lines.append("Experiment reports:")
        for path in report.experiment_reports:
            lines.append(f"  - {path}")
    if report.proposal_ids:
        lines.append("Proposal IDs:")
        for proposal_id in report.proposal_ids:
            lines.append(f"  - {proposal_id}")
    if report.next_steps:
        lines.append("Next steps:")
        for step in report.next_steps:
            lines.append(f"  - {step}")
    if report.safety_notes:
        lines.append("Safety notes:")
        for note in report.safety_notes:
            lines.append(f"  - {note}")
    return "\n".join(lines)
