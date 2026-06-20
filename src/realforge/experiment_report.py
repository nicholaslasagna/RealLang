from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

VALIDATION_MODES = frozenset({"quick", "examples", "benchmarks"})


@dataclass(frozen=True)
class CommandResultRecord:
    command: str
    returncode: int
    stdout: str
    stderr: str
    passed: bool
    ran: bool = True
    allowed_by_policy: bool = True
    disposition: str = "ran"


@dataclass(frozen=True)
class ExperimentReport:
    id: str
    area: str
    patch_file: str | None
    patch_sha256: str | None
    patch_targets: tuple[str, ...]
    validation_mode: str
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
    workspace_content_digest: str | None
    notes: tuple[str, ...]


class LegacyExperimentReportError(ValueError):
    pass


def format_experiment_report(report: ExperimentReport) -> str:
    lines = [
        "RealForge experiment report",
        f"ID: {report.id}",
        f"Area: {report.area}",
        f"Passed: {report.passed}",
        f"Validation mode: {report.validation_mode}",
        f"Workspace mode: {report.workspace_mode}",
        f"Duration: {report.duration_ms} ms",
        f"Main workspace modified: {report.main_workspace_modified}",
        f"Kept experiment workspace: {report.kept}",
        f"Cleanup: {report.cleanup_status}",
    ]
    if report.patch_file:
        lines.append(f"Patch file: {report.patch_file}")
    if report.patch_sha256:
        lines.append(f"Patch SHA-256: {report.patch_sha256}")
    if report.patch_targets:
        lines.append("Patch targets:")
        for target in report.patch_targets:
            lines.append(f"  - {target}")
    if report.workspace_content_digest:
        lines.append(f"Workspace content digest: {report.workspace_content_digest}")
    if report.experiment_path:
        lines.append(f"Experiment path: {report.experiment_path}")
    if report.validation_commands:
        lines.append("Validation commands:")
        for cmd in report.validation_commands:
            lines.append(f"  - {cmd}")
    if report.command_results:
        lines.append("Command results:")
        for result in report.command_results:
            if not result.allowed_by_policy or result.disposition == "blocked":
                lines.append(f"  - [BLOCKED] {result.command}")
                continue
            if not result.ran or result.disposition == "skipped":
                lines.append(f"  - [SKIPPED] {result.command}")
                continue
            status = "PASS" if result.passed else "FAIL"
            lines.append(
                f"  - [RAN/{status}] {result.command} (exit {result.returncode}; allowlisted validation)"
            )
    if report.failures:
        lines.append("Failures:")
        for failure in report.failures:
            lines.append(f"  - {failure}")
    if report.notes:
        lines.append("Notes:")
        for note in report.notes:
            lines.append(f"  - {note}")
    lines.append("Note: experiment pass does not merge or apply changes to the main workspace.")
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

    validation_mode = str(data.get("validation_mode", "")).strip()
    if not validation_mode:
        raise LegacyExperimentReportError(
            "experiment report missing validation_mode (RealForge 1.1+ required)"
        )
    if validation_mode not in VALIDATION_MODES:
        raise ValueError(f"unknown validation mode in experiment report: {validation_mode}")

    patch_sha256 = data.get("patch_sha256")
    if patch_sha256 is not None:
        patch_sha256 = str(patch_sha256).strip() or None
    if data.get("patch_file") and not patch_sha256:
        raise LegacyExperimentReportError(
            "experiment report missing patch_sha256 (RealForge 1.1+ required)"
        )

    command_results = tuple(
        CommandResultRecord(
            command=str(item.get("command", "")),
            returncode=int(item.get("returncode", 1)),
            stdout=str(item.get("stdout", "")),
            stderr=str(item.get("stderr", "")),
            passed=bool(item.get("passed", False)),
            ran=bool(item.get("ran", True)),
            allowed_by_policy=bool(item.get("allowed_by_policy", True)),
            disposition=str(item.get("disposition", "ran")),
        )
        for item in data.get("command_results", [])
        if isinstance(item, dict)
    )
    return ExperimentReport(
        id=str(data.get("id", "")).strip(),
        area=str(data.get("area", "")).strip(),
        patch_file=data.get("patch_file"),
        patch_sha256=patch_sha256,
        patch_targets=tuple(str(item) for item in data.get("patch_targets", [])),
        validation_mode=validation_mode,
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
        workspace_content_digest=data.get("workspace_content_digest"),
        notes=tuple(str(item) for item in data.get("notes", [])),
    )
