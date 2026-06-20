from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from realforge.workspace import assert_path_in_workspace


# Cross-domain skill benchmark suites. "smoke" is a small curated cross-domain
# sample; "all" runs every domain. Each remaining suite maps to one domain.
SKILL_DOMAINS = (
    "code",
    "docs",
    "research",
    "creative",
    "image",
    "vision",
    "engine",
    "asset",
    "safety",
    "self-improve",
)

SKILL_SUITES = frozenset({"smoke", "all", *SKILL_DOMAINS})

# Tasks scoring below this normalized ratio (or carrying safety flags) fail.
PASS_SCORE_RATIO = 0.6


@dataclass(frozen=True)
class SkillTaskResult:
    task_id: str
    suite: str
    domain: str
    prompt: str
    expected_behavior: str
    output_summary: str
    schema_valid: bool
    checks: dict[str, bool]
    score: int
    max_score: int
    safety_flags: tuple[str, ...]
    artifacts_created: int
    notes: tuple[str, ...]


@dataclass(frozen=True)
class SkillBenchmarkReport:
    id: str
    created_at: str
    realforge_version: str
    provider: str
    provider_model: str | None
    suite: str
    task_results: tuple[SkillTaskResult, ...]
    total_score: int
    normalized_score: float
    passed: bool
    safety_failures: tuple[str, ...]
    domain_scores: dict[str, float]
    duration_ms: int
    notes: tuple[str, ...]


def skill_benchmarks_dir(workspace_root: Path) -> Path:
    return workspace_root / ".realforge" / "skill_benchmarks"


def skill_benchmark_report_path(workspace_root: Path, benchmark_id: str) -> Path:
    return skill_benchmarks_dir(workspace_root) / f"{benchmark_id}.json"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _task_to_dict(task: SkillTaskResult) -> dict:
    return asdict(task)


def _task_from_dict(data: dict) -> SkillTaskResult:
    return SkillTaskResult(
        task_id=str(data["task_id"]),
        suite=str(data.get("suite", "")),
        domain=str(data.get("domain", "")),
        prompt=str(data.get("prompt", "")),
        expected_behavior=str(data.get("expected_behavior", "")),
        output_summary=str(data.get("output_summary", "")),
        schema_valid=bool(data.get("schema_valid", False)),
        checks={str(k): bool(v) for k, v in data.get("checks", {}).items()},
        score=int(data.get("score", 0)),
        max_score=int(data.get("max_score", 100)),
        safety_flags=tuple(str(item) for item in data.get("safety_flags", [])),
        artifacts_created=int(data.get("artifacts_created", 0)),
        notes=tuple(str(item) for item in data.get("notes", [])),
    )


def report_to_dict(report: SkillBenchmarkReport) -> dict:
    payload = asdict(report)
    payload["task_results"] = [_task_to_dict(item) for item in report.task_results]
    return payload


def write_skill_benchmark_report(report: SkillBenchmarkReport, workspace_root: Path) -> Path:
    root = workspace_root.resolve()
    path = skill_benchmark_report_path(root, report.id)
    assert_path_in_workspace(path, root)
    bench_root = skill_benchmarks_dir(root).resolve()
    try:
        path.resolve().relative_to(bench_root)
    except ValueError as err:
        raise ValueError(
            f"skill benchmark report write refused outside {bench_root}: {path}"
        ) from err
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report_to_dict(report), indent=2) + "\n", encoding="utf-8")
    return path


def load_skill_benchmark_report(workspace_root: Path, benchmark_id: str) -> SkillBenchmarkReport:
    path = skill_benchmark_report_path(workspace_root.resolve(), benchmark_id)
    if not path.is_file():
        raise FileNotFoundError(f"skill benchmark report not found: {benchmark_id}")
    data = json.loads(path.read_text(encoding="utf-8"))
    tasks = tuple(_task_from_dict(item) for item in data.get("task_results", []))
    return SkillBenchmarkReport(
        id=str(data["id"]),
        created_at=str(data.get("created_at", "")),
        realforge_version=str(data.get("realforge_version", "")),
        provider=str(data["provider"]),
        provider_model=data.get("provider_model"),
        suite=str(data["suite"]),
        task_results=tasks,
        total_score=int(data.get("total_score", 0)),
        normalized_score=float(data.get("normalized_score", 0.0)),
        passed=bool(data.get("passed", False)),
        safety_failures=tuple(str(item) for item in data.get("safety_failures", [])),
        domain_scores={str(k): float(v) for k, v in data.get("domain_scores", {}).items()},
        duration_ms=int(data.get("duration_ms", 0)),
        notes=tuple(str(item) for item in data.get("notes", [])),
    )


def list_skill_benchmark_reports(workspace_root: Path) -> tuple[SkillBenchmarkReport, ...]:
    root = skill_benchmarks_dir(workspace_root.resolve())
    if not root.is_dir():
        return ()
    reports: list[SkillBenchmarkReport] = []
    for path in sorted(root.glob("*.json")):
        reports.append(load_skill_benchmark_report(workspace_root, path.stem))
    return tuple(reports)


def format_skill_benchmark_report(report: SkillBenchmarkReport) -> str:
    lines = [
        "RealForge skill benchmark report "
        "(internal rule-based cross-domain measurement; not a superiority benchmark)",
        f"ID: {report.id}",
        f"Created: {report.created_at}",
        f"RealForge version: {report.realforge_version}",
        f"Provider: {report.provider}",
    ]
    if report.provider_model:
        lines.append(f"Provider model: {report.provider_model}")
    lines.extend(
        [
            f"Suite: {report.suite}",
            f"Duration: {report.duration_ms} ms",
            f"Total score: {report.total_score}",
            f"Normalized score: {report.normalized_score:.3f}",
            f"Passed: {report.passed}",
        ]
    )
    if report.domain_scores:
        lines.append("Domain scores:")
        for domain in sorted(report.domain_scores):
            lines.append(f"  - {domain}: {report.domain_scores[domain]:.3f}")
    if report.task_results:
        lines.append("Task results:")
        for task in report.task_results:
            ratio = task.score / task.max_score if task.max_score else 0.0
            status = "PASS" if ratio >= PASS_SCORE_RATIO and not task.safety_flags else "FAIL"
            lines.append(
                f"  - [{status}] {task.task_id} score={task.score}/{task.max_score} "
                f"domain={task.domain}"
            )
            failed_checks = [name for name, ok in task.checks.items() if not ok]
            if failed_checks:
                lines.append(f"      failed checks: {', '.join(failed_checks)}")
            if task.safety_flags:
                lines.append(f"      safety flags: {', '.join(task.safety_flags)}")
    if report.safety_failures:
        lines.append("Safety failures:")
        for failure in report.safety_failures:
            lines.append(f"  - {failure}")
    if report.notes:
        lines.append("Notes:")
        for note in report.notes:
            lines.append(f"  - {note}")
    lines.append(
        "Note: provider output remains untrusted; skill benchmarks do not edit the main repo."
    )
    return "\n".join(lines)


def format_skill_benchmark_list(reports: tuple[SkillBenchmarkReport, ...]) -> str:
    if not reports:
        return "No skill benchmark reports found in .realforge/skill_benchmarks/"
    lines = ["RealForge skill benchmark reports:"]
    for report in reports:
        lines.append(
            f"  - {report.id} v={report.realforge_version} provider={report.provider} "
            f"suite={report.suite} normalized={report.normalized_score:.3f} passed={report.passed}"
        )
    return "\n".join(lines)
