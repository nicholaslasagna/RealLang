from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from realforge.workspace import assert_path_in_workspace


EVAL_SUITES = frozenset({"smoke", "planning", "safety", "generation", "all"})


@dataclass(frozen=True)
class EvalTaskResult:
    task_id: str
    task: str
    expected_behavior: str
    provider_output_summary: str
    valid_schema: bool
    safety_flags: tuple[str, ...]
    commands_suggested: tuple[str, ...]
    unsafe_commands_suggested: tuple[str, ...]
    files_referenced: tuple[str, ...]
    generated_source_check_result: str | None
    score: int
    notes: tuple[str, ...]


@dataclass(frozen=True)
class EvalReport:
    id: str
    provider: str
    suite: str
    started_at: str
    duration_ms: int
    tasks: tuple[EvalTaskResult, ...]
    scores: dict[str, int]
    total_score: int
    passed: bool
    failures: tuple[str, ...]
    safety_notes: tuple[str, ...]
    model_metadata: dict[str, str]


def evals_dir(workspace_root: Path) -> Path:
    return workspace_root / ".realforge" / "evals"


def eval_report_path(workspace_root: Path, eval_id: str) -> Path:
    return evals_dir(workspace_root) / f"{eval_id}.json"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _task_to_dict(task: EvalTaskResult) -> dict:
    return asdict(task)


def _task_from_dict(data: dict) -> EvalTaskResult:
    return EvalTaskResult(
        task_id=str(data["task_id"]),
        task=str(data["task"]),
        expected_behavior=str(data.get("expected_behavior", "")),
        provider_output_summary=str(data.get("provider_output_summary", "")),
        valid_schema=bool(data.get("valid_schema", False)),
        safety_flags=tuple(str(item) for item in data.get("safety_flags", [])),
        commands_suggested=tuple(str(item) for item in data.get("commands_suggested", [])),
        unsafe_commands_suggested=tuple(str(item) for item in data.get("unsafe_commands_suggested", [])),
        files_referenced=tuple(str(item) for item in data.get("files_referenced", [])),
        generated_source_check_result=data.get("generated_source_check_result"),
        score=int(data.get("score", 0)),
        notes=tuple(str(item) for item in data.get("notes", [])),
    )


def report_to_dict(report: EvalReport) -> dict:
    payload = asdict(report)
    payload["tasks"] = [_task_to_dict(item) for item in report.tasks]
    return payload


def write_eval_report(report: EvalReport, workspace_root: Path) -> Path:
    root = workspace_root.resolve()
    path = eval_report_path(root, report.id)
    assert_path_in_workspace(path, root)
    evals_root = evals_dir(root).resolve()
    try:
        path.resolve().relative_to(evals_root)
    except ValueError as err:
        raise ValueError(f"eval report write refused outside {evals_root}: {path}") from err
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report_to_dict(report), indent=2) + "\n", encoding="utf-8")
    return path


def load_eval_report(workspace_root: Path, eval_id: str) -> EvalReport:
    path = eval_report_path(workspace_root.resolve(), eval_id)
    if not path.is_file():
        raise FileNotFoundError(f"eval report not found: {eval_id}")
    data = json.loads(path.read_text(encoding="utf-8"))
    tasks = tuple(_task_from_dict(item) for item in data.get("tasks", []))
    return EvalReport(
        id=str(data["id"]),
        provider=str(data["provider"]),
        suite=str(data["suite"]),
        started_at=str(data.get("started_at", "")),
        duration_ms=int(data.get("duration_ms", 0)),
        tasks=tasks,
        scores={str(k): int(v) for k, v in data.get("scores", {}).items()},
        total_score=int(data.get("total_score", 0)),
        passed=bool(data.get("passed", False)),
        failures=tuple(str(item) for item in data.get("failures", [])),
        safety_notes=tuple(str(item) for item in data.get("safety_notes", [])),
        model_metadata={str(k): str(v) for k, v in data.get("model_metadata", {}).items()},
    )


def list_eval_reports(workspace_root: Path) -> tuple[EvalReport, ...]:
    root = evals_dir(workspace_root.resolve())
    if not root.is_dir():
        return ()
    reports: list[EvalReport] = []
    for path in sorted(root.glob("*.json")):
        reports.append(load_eval_report(workspace_root, path.stem))
    return tuple(reports)


def format_eval_report(report: EvalReport) -> str:
    lines = [
        "RealForge eval report (rule-based early quality harness; not a superiority benchmark)",
        f"ID: {report.id}",
        f"Provider: {report.provider}",
        f"Suite: {report.suite}",
        f"Started: {report.started_at}",
        f"Duration: {report.duration_ms} ms",
        f"Total score: {report.total_score}",
        f"Passed: {report.passed}",
    ]
    if report.model_metadata:
        lines.append(f"Model metadata: {report.model_metadata}")
    if report.tasks:
        lines.append("Tasks:")
        for task in report.tasks:
            status = "PASS" if task.score >= 60 else "FAIL"
            lines.append(f"  - [{status}] {task.task_id} score={task.score} task={task.task!r}")
            if task.unsafe_commands_suggested:
                lines.append(f"      unsafe commands: {', '.join(task.unsafe_commands_suggested)}")
            if task.generated_source_check_result:
                lines.append(f"      realc check: {task.generated_source_check_result}")
    if report.failures:
        lines.append("Failures:")
        for failure in report.failures:
            lines.append(f"  - {failure}")
    if report.safety_notes:
        lines.append("Safety notes:")
        for note in report.safety_notes:
            lines.append(f"  - {note}")
    lines.append("Note: provider output remains untrusted; eval tasks do not edit the main repo.")
    return "\n".join(lines)


def format_eval_list(reports: tuple[EvalReport, ...]) -> str:
    if not reports:
        return "No eval reports found in .realforge/evals/"
    lines = ["RealForge eval reports:"]
    for report in reports:
        lines.append(
            f"  - {report.id} provider={report.provider} suite={report.suite} "
            f"score={report.total_score} passed={report.passed}"
        )
    return "\n".join(lines)
