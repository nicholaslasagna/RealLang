from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from realforge.workspace import assert_path_in_workspace


BENCH_SUITES = frozenset({"smoke", "planning", "generation", "safety", "self-improve", "all"})


@dataclass(frozen=True)
class BenchmarkTaskResult:
    task_id: str
    suite: str
    prompt: str
    expected_behavior: str
    provider_output_summary: str
    schema_valid: bool
    checks: dict[str, bool]
    score: int
    max_score: int
    safety_flags: tuple[str, ...]
    generated_source_check_result: str | None
    notes: tuple[str, ...]


@dataclass(frozen=True)
class BenchmarkReport:
    id: str
    realforge_version: str
    provider: str
    provider_model: str | None
    suite: str
    started_at: str
    duration_ms: int
    task_results: tuple[BenchmarkTaskResult, ...]
    total_score: int
    normalized_score: float
    passed: bool
    safety_failures: tuple[str, ...]
    generated_artifacts_count: int
    notes: tuple[str, ...]


def task_benchmarks_dir(workspace_root: Path) -> Path:
    return workspace_root / ".realforge" / "task_benchmarks"


def benchmark_report_path(workspace_root: Path, benchmark_id: str) -> Path:
    return task_benchmarks_dir(workspace_root) / f"{benchmark_id}.json"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _task_to_dict(task: BenchmarkTaskResult) -> dict:
    return asdict(task)


def _task_from_dict(data: dict) -> BenchmarkTaskResult:
    return BenchmarkTaskResult(
        task_id=str(data["task_id"]),
        suite=str(data.get("suite", "")),
        prompt=str(data.get("prompt", data.get("task", ""))),
        expected_behavior=str(data.get("expected_behavior", "")),
        provider_output_summary=str(data.get("provider_output_summary", "")),
        schema_valid=bool(data.get("schema_valid", False)),
        checks={str(k): bool(v) for k, v in data.get("checks", {}).items()},
        score=int(data.get("score", 0)),
        max_score=int(data.get("max_score", 100)),
        safety_flags=tuple(str(item) for item in data.get("safety_flags", [])),
        generated_source_check_result=data.get("generated_source_check_result"),
        notes=tuple(str(item) for item in data.get("notes", [])),
    )


def report_to_dict(report: BenchmarkReport) -> dict:
    payload = asdict(report)
    payload["task_results"] = [_task_to_dict(item) for item in report.task_results]
    return payload


def write_benchmark_report(report: BenchmarkReport, workspace_root: Path) -> Path:
    root = workspace_root.resolve()
    path = benchmark_report_path(root, report.id)
    assert_path_in_workspace(path, root)
    bench_root = task_benchmarks_dir(root).resolve()
    try:
        path.resolve().relative_to(bench_root)
    except ValueError as err:
        raise ValueError(f"benchmark report write refused outside {bench_root}: {path}") from err
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report_to_dict(report), indent=2) + "\n", encoding="utf-8")
    return path


def load_benchmark_report(workspace_root: Path, benchmark_id: str) -> BenchmarkReport:
    path = benchmark_report_path(workspace_root.resolve(), benchmark_id)
    if not path.is_file():
        raise FileNotFoundError(f"task benchmark report not found: {benchmark_id}")
    data = json.loads(path.read_text(encoding="utf-8"))
    tasks = tuple(_task_from_dict(item) for item in data.get("task_results", []))
    return BenchmarkReport(
        id=str(data["id"]),
        realforge_version=str(data.get("realforge_version", "")),
        provider=str(data["provider"]),
        provider_model=data.get("provider_model"),
        suite=str(data["suite"]),
        started_at=str(data.get("started_at", "")),
        duration_ms=int(data.get("duration_ms", 0)),
        task_results=tasks,
        total_score=int(data.get("total_score", 0)),
        normalized_score=float(data.get("normalized_score", 0.0)),
        passed=bool(data.get("passed", False)),
        safety_failures=tuple(str(item) for item in data.get("safety_failures", [])),
        generated_artifacts_count=int(data.get("generated_artifacts_count", 0)),
        notes=tuple(str(item) for item in data.get("notes", [])),
    )


def list_benchmark_reports(workspace_root: Path) -> tuple[BenchmarkReport, ...]:
    root = task_benchmarks_dir(workspace_root.resolve())
    if not root.is_dir():
        return ()
    reports: list[BenchmarkReport] = []
    for path in sorted(root.glob("*.json")):
        reports.append(load_benchmark_report(workspace_root, path.stem))
    return tuple(reports)


def format_benchmark_report(report: BenchmarkReport) -> str:
    lines = [
        "RealForge task benchmark report (internal rule-based measurement; not a superiority benchmark)",
        f"ID: {report.id}",
        f"RealForge version: {report.realforge_version}",
        f"Provider: {report.provider}",
    ]
    if report.provider_model:
        lines.append(f"Provider model: {report.provider_model}")
    lines.extend(
        [
            f"Suite: {report.suite}",
            f"Started: {report.started_at}",
            f"Duration: {report.duration_ms} ms",
            f"Total score: {report.total_score}",
            f"Normalized score: {report.normalized_score:.3f}",
            f"Passed: {report.passed}",
            f"Generated artifacts (temp checks): {report.generated_artifacts_count}",
        ]
    )
    if report.task_results:
        lines.append("Task results:")
        for task in report.task_results:
            ratio = task.score / task.max_score if task.max_score else 0.0
            status = "PASS" if ratio >= 0.6 and not task.safety_flags else "FAIL"
            lines.append(
                f"  - [{status}] {task.task_id} score={task.score}/{task.max_score} suite={task.suite}"
            )
            if task.generated_source_check_result:
                lines.append(f"      realc check: {task.generated_source_check_result}")
            failed_checks = [name for name, ok in task.checks.items() if not ok]
            if failed_checks:
                lines.append(f"      failed checks: {', '.join(failed_checks)}")
    if report.safety_failures:
        lines.append("Safety failures:")
        for failure in report.safety_failures:
            lines.append(f"  - {failure}")
    if report.notes:
        lines.append("Notes:")
        for note in report.notes:
            lines.append(f"  - {note}")
    lines.append("Note: provider output remains untrusted; benchmarks do not edit the main repo.")
    return "\n".join(lines)


def format_benchmark_list(reports: tuple[BenchmarkReport, ...]) -> str:
    if not reports:
        return "No task benchmark reports found in .realforge/task_benchmarks/"
    lines = ["RealForge task benchmark reports:"]
    for report in reports:
        lines.append(
            f"  - {report.id} v={report.realforge_version} provider={report.provider} "
            f"suite={report.suite} normalized={report.normalized_score:.3f} passed={report.passed}"
        )
    return "\n".join(lines)
