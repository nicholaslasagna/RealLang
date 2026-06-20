from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from realforge.workspace import assert_path_in_workspace


@dataclass(frozen=True)
class SchedulerAreaResult:
    area: str
    improvement_plan_id: str | None
    patch_proposal_id: str | None
    experiment_report_id: str | None
    proposal_id: str | None
    update_bundle_id: str | None
    passed: bool
    skipped_reason: str | None
    failures: tuple[str, ...]
    next_steps: tuple[str, ...]


@dataclass(frozen=True)
class SchedulerRunReport:
    id: str
    created_at: str
    provider: str
    areas: tuple[str, ...]
    dry_run: bool
    max_runs: int
    benchmark_gate_checked: bool
    benchmark_gate_passed: bool
    minimum_benchmark_score: float
    area_results: tuple[SchedulerAreaResult, ...]
    proposals_created: tuple[str, ...]
    update_bundles_created: tuple[str, ...]
    experiments_created: tuple[str, ...]
    passed: bool
    stopped_reason: str
    next_steps: tuple[str, ...]
    safety_notes: tuple[str, ...]
    duration_ms: int
    main_workspace_modified: bool


def scheduler_runs_dir(workspace_root: Path) -> Path:
    return workspace_root / ".realforge" / "scheduler_runs"


def scheduler_run_path(workspace_root: Path, run_id: str) -> Path:
    return scheduler_runs_dir(workspace_root) / f"{run_id}.json"


def scheduler_run_workspace_dir(workspace_root: Path, run_id: str) -> Path:
    return scheduler_runs_dir(workspace_root) / run_id


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _area_to_dict(area: SchedulerAreaResult) -> dict:
    return asdict(area)


def _area_from_dict(data: dict) -> SchedulerAreaResult:
    return SchedulerAreaResult(
        area=str(data["area"]),
        improvement_plan_id=data.get("improvement_plan_id"),
        patch_proposal_id=data.get("patch_proposal_id"),
        experiment_report_id=data.get("experiment_report_id"),
        proposal_id=data.get("proposal_id"),
        update_bundle_id=data.get("update_bundle_id"),
        passed=bool(data.get("passed", False)),
        skipped_reason=data.get("skipped_reason"),
        failures=tuple(str(item) for item in data.get("failures", [])),
        next_steps=tuple(str(item) for item in data.get("next_steps", [])),
    )


def report_to_dict(report: SchedulerRunReport) -> dict:
    payload = asdict(report)
    payload["area_results"] = [_area_to_dict(item) for item in report.area_results]
    return payload


def write_scheduler_run(report: SchedulerRunReport, workspace_root: Path) -> Path:
    root = workspace_root.resolve()
    path = scheduler_run_path(root, report.id).resolve()
    assert_path_in_workspace(path, root)
    runs_root = scheduler_runs_dir(root).resolve()
    try:
        path.relative_to(runs_root)
    except ValueError as err:
        raise ValueError(f"scheduler run write refused outside {runs_root}: {path}") from err
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report_to_dict(report), indent=2) + "\n", encoding="utf-8")
    return path


def load_scheduler_run(workspace_root: Path, run_id: str) -> SchedulerRunReport:
    path = scheduler_run_path(workspace_root.resolve(), run_id)
    if not path.is_file():
        raise FileNotFoundError(f"scheduler run report not found: {run_id}")
    data = json.loads(path.read_text(encoding="utf-8"))
    areas = tuple(_area_from_dict(item) for item in data.get("area_results", []))
    return SchedulerRunReport(
        id=str(data["id"]),
        created_at=str(data.get("created_at", "")),
        provider=str(data["provider"]),
        areas=tuple(str(item) for item in data.get("areas", [])),
        dry_run=bool(data.get("dry_run", False)),
        max_runs=int(data.get("max_runs", 0)),
        benchmark_gate_checked=bool(data.get("benchmark_gate_checked", False)),
        benchmark_gate_passed=bool(data.get("benchmark_gate_passed", False)),
        minimum_benchmark_score=float(data.get("minimum_benchmark_score", 0.0)),
        area_results=areas,
        proposals_created=tuple(str(item) for item in data.get("proposals_created", [])),
        update_bundles_created=tuple(str(item) for item in data.get("update_bundles_created", [])),
        experiments_created=tuple(str(item) for item in data.get("experiments_created", [])),
        passed=bool(data.get("passed", False)),
        stopped_reason=str(data.get("stopped_reason", "")),
        next_steps=tuple(str(item) for item in data.get("next_steps", [])),
        safety_notes=tuple(str(item) for item in data.get("safety_notes", [])),
        duration_ms=int(data.get("duration_ms", 0)),
        main_workspace_modified=bool(data.get("main_workspace_modified", False)),
    )


def list_scheduler_runs(workspace_root: Path) -> tuple[SchedulerRunReport, ...]:
    root = scheduler_runs_dir(workspace_root.resolve())
    if not root.is_dir():
        return ()
    reports: list[SchedulerRunReport] = []
    for path in sorted(root.glob("*.json")):
        reports.append(load_scheduler_run(workspace_root, path.stem))
    return tuple(reports)


def format_scheduler_run(report: SchedulerRunReport) -> str:
    lines = [
        "RealForge scheduler run report (staff-only; bounded; not autonomous self-editing)",
        f"ID: {report.id}",
        f"Created: {report.created_at}",
        f"Provider: {report.provider}",
        f"Areas: {', '.join(report.areas)}",
        f"Dry run: {report.dry_run}",
        f"Max runs: {report.max_runs}",
        f"Benchmark gate checked: {report.benchmark_gate_checked}",
        f"Benchmark gate passed: {report.benchmark_gate_passed}",
        f"Minimum benchmark score: {report.minimum_benchmark_score:.3f}",
        f"Passed: {report.passed}",
        f"Stopped reason: {report.stopped_reason}",
        f"Main workspace modified: {report.main_workspace_modified}",
        f"Duration: {report.duration_ms} ms",
    ]
    if report.proposals_created:
        lines.append(f"Proposals created: {', '.join(report.proposals_created)}")
    if report.update_bundles_created:
        lines.append(f"Update bundles created: {', '.join(report.update_bundles_created)}")
    if report.experiments_created:
        lines.append(f"Experiments created: {', '.join(report.experiments_created)}")
    if report.area_results:
        lines.append("Area results:")
        for area in report.area_results:
            status = "PASS" if area.passed else "FAIL/SKIP"
            lines.append(f"  - [{status}] {area.area}")
            if area.skipped_reason:
                lines.append(f"      skipped: {area.skipped_reason}")
            if area.patch_proposal_id:
                lines.append(f"      patch_proposal_id: {area.patch_proposal_id}")
            if area.experiment_report_id:
                lines.append(f"      experiment_report_id: {area.experiment_report_id}")
            if area.proposal_id:
                lines.append(f"      proposal_id: {area.proposal_id}")
            if area.update_bundle_id:
                lines.append(f"      update_bundle_id: {area.update_bundle_id}")
            for failure in area.failures:
                lines.append(f"      failure: {failure}")
    if report.next_steps:
        lines.append("Next steps:")
        for step in report.next_steps:
            lines.append(f"  - {step}")
    if report.safety_notes:
        lines.append("Safety notes:")
        for note in report.safety_notes:
            lines.append(f"  - {note}")
    lines.append("Note: scheduler never auto-applies or auto-commits; human approval remains required.")
    return "\n".join(lines)


def format_scheduler_run_list(reports: tuple[SchedulerRunReport, ...]) -> str:
    if not reports:
        return "No scheduler run reports found in .realforge/scheduler_runs/"
    lines = ["RealForge scheduler runs:"]
    for report in reports:
        lines.append(
            f"  - {report.id} dry_run={report.dry_run} passed={report.passed} "
            f"areas={','.join(report.areas)} stopped={report.stopped_reason}"
        )
    return "\n".join(lines)
