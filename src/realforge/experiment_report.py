from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class CommandResultRecord:
    command: str
    returncode: int
    stdout: str
    stderr: str
    passed: bool


@dataclass(frozen=True)
class ExperimentReport:
    id: str
    area: str
    patch_file: str | None
    workspace_mode: str
    experiment_path: str | None
    validation_commands: tuple[str, ...]
    command_results: tuple[CommandResultRecord, ...]
    passed: bool
    failures: tuple[str, ...]
    duration_ms: int
    kept: bool
    cleanup_status: str
    main_workspace_modified: bool
    notes: tuple[str, ...]


def format_experiment_report(report: ExperimentReport) -> str:
    lines = [
        "RealForge experiment report",
        f"ID: {report.id}",
        f"Area: {report.area}",
        f"Passed: {report.passed}",
        f"Workspace mode: {report.workspace_mode}",
        f"Duration: {report.duration_ms} ms",
        f"Main workspace modified: {report.main_workspace_modified}",
        f"Kept experiment workspace: {report.kept}",
        f"Cleanup: {report.cleanup_status}",
    ]
    if report.patch_file:
        lines.append(f"Patch file: {report.patch_file}")
    if report.experiment_path:
        lines.append(f"Experiment path: {report.experiment_path}")
    if report.validation_commands:
        lines.append("Validation commands:")
        for cmd in report.validation_commands:
            lines.append(f"  - {cmd}")
    if report.command_results:
        lines.append("Command results:")
        for result in report.command_results:
            status = "PASS" if result.passed else "FAIL"
            lines.append(f"  - [{status}] {result.command} (exit {result.returncode})")
    if report.failures:
        lines.append("Failures:")
        for failure in report.failures:
            lines.append(f"  - {failure}")
    if report.notes:
        lines.append("Notes:")
        for note in report.notes:
            lines.append(f"  - {note}")
    return "\n".join(lines)


def report_to_dict(report: ExperimentReport) -> dict:
    return asdict(report)


def write_report_json(report: ExperimentReport, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report_to_dict(report), indent=2) + "\n", encoding="utf-8")
    return path


def load_report_json(path: Path) -> ExperimentReport:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("experiment report JSON must be an object")
    command_results = tuple(
        CommandResultRecord(
            command=str(item.get("command", "")),
            returncode=int(item.get("returncode", 1)),
            stdout=str(item.get("stdout", "")),
            stderr=str(item.get("stderr", "")),
            passed=bool(item.get("passed", False)),
        )
        for item in data.get("command_results", [])
        if isinstance(item, dict)
    )
    return ExperimentReport(
        id=str(data.get("id", "")).strip(),
        area=str(data.get("area", "")).strip(),
        patch_file=data.get("patch_file"),
        workspace_mode=str(data.get("workspace_mode", "")).strip(),
        experiment_path=data.get("experiment_path"),
        validation_commands=tuple(str(item) for item in data.get("validation_commands", [])),
        command_results=command_results,
        passed=bool(data.get("passed", False)),
        failures=tuple(str(item) for item in data.get("failures", [])),
        duration_ms=int(data.get("duration_ms", 0)),
        kept=bool(data.get("kept", False)),
        cleanup_status=str(data.get("cleanup_status", "")).strip(),
        main_workspace_modified=bool(data.get("main_workspace_modified", False)),
        notes=tuple(str(item) for item in data.get("notes", [])),
    )
