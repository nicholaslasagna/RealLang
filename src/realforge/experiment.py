from __future__ import annotations

import sys
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from realforge.config import RealForgeConfig
from realforge.experiment_report import (
    CommandResultRecord,
    ExperimentReport,
    format_experiment_report,
    write_report_json,
)
from realforge.git_utils import (
    apply_unified_patch,
    create_experiment_workspace,
    is_git_repo,
    remove_experiment_workspace,
    snapshot_working_tree,
    working_tree_changed,
)
from realforge.permissions import PermissionMode, Permissions
from realforge.providers.base import ModelProvider
from realforge.runner import CommandResult, run_command
from realforge.self_improve import run_improve
from realforge.self_improvement_plan import SelfImprovementPlan, format_improvement_plan

ValidationMode = str
CommandRunner = Callable[..., CommandResult]

VALIDATION_MODES = frozenset({"quick", "examples", "benchmarks"})


@dataclass(frozen=True)
class ExperimentDryRunOutcome:
    plan: SelfImprovementPlan
    validation_commands: tuple[str, ...]
    message: str


def _command_to_str(cmd: tuple[str, ...]) -> str:
    return " ".join(cmd)


def _pytest_command(workspace: Path) -> tuple[str, ...]:
    venv_pytest = workspace / ".venv" / "bin" / "pytest"
    if venv_pytest.is_file():
        return (str(venv_pytest), "-q")
    return (sys.executable, "-m", "pytest", "-q")


def build_validation_commands(
    mode: ValidationMode,
    workspace: Path,
    *,
    config: RealForgeConfig | None = None,
) -> tuple[tuple[str, ...], ...]:
    cfg = config or RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"))
    commands: list[tuple[str, ...]] = [_pytest_command(workspace)]

    if is_git_repo(workspace):
        commands.append(("git", "diff", "--check"))

    if mode == "examples":
        examples = sorted((workspace / "examples").glob("*.real"))
        for example in examples:
            commands.append((*cfg.realc_command, str(example.relative_to(workspace)), "--check"))

    if mode == "benchmarks":
        bench_real = workspace / "benchmarks" / "real"
        if bench_real.is_dir():
            for real_file in sorted(bench_real.glob("*.real")):
                commands.append((*cfg.realc_command, str(real_file.relative_to(workspace)), "--check"))
        runner = workspace / "benchmarks" / "run_benchmarks.py"
        if runner.is_file():
            commands.append((sys.executable, str(runner.relative_to(workspace)), "--runs", "1", "--warmup", "0", "--skip-slow"))

    return tuple(commands)


def format_dry_run_message(
    plan: SelfImprovementPlan,
    validation_commands: tuple[tuple[str, ...], ...],
) -> str:
    lines = [
        "RealForge experiment dry-run (no workspace created)",
        "",
        format_improvement_plan(plan),
        "",
        "Would run validation in an isolated experiment workspace:",
    ]
    for cmd in validation_commands:
        lines.append(f"  - {_command_to_str(cmd)}")
    lines.append("")
    lines.append("No files were modified. No experiment workspace was created.")
    return "\n".join(lines)


def run_experiment_dry_run(
    *,
    area: str,
    provider: ModelProvider,
    workspace_root: Path,
    validation_mode: ValidationMode = "quick",
    max_context_chars: int = 12000,
) -> ExperimentDryRunOutcome:
    improve = run_improve(
        area=area,
        provider=provider,
        workspace_root=workspace_root,
        propose_patch=False,
        max_context_chars=max_context_chars,
    )
    validation_commands = build_validation_commands(
        validation_mode,
        workspace_root,
    )
    message = format_dry_run_message(improve.plan, validation_commands)
    return ExperimentDryRunOutcome(
        plan=improve.plan,
        validation_commands=tuple(_command_to_str(cmd) for cmd in validation_commands),
        message=message,
    )


def _run_validation_commands(
    commands: tuple[tuple[str, ...], ...],
    *,
    workspace: Path,
    config: RealForgeConfig,
    command_runner: CommandRunner,
) -> tuple[tuple[CommandResultRecord, ...], tuple[str, ...]]:
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=workspace)
    records: list[CommandResultRecord] = []
    failures: list[str] = []
    for cmd in commands:
        try:
            result = command_runner(cmd, config=config, permissions=perms, cwd=workspace)
        except Exception as err:  # noqa: BLE001 - report experiment failures safely
            cmd_text = _command_to_str(cmd)
            failures.append(f"{cmd_text}: {err}")
            records.append(
                CommandResultRecord(
                    command=cmd_text,
                    returncode=1,
                    stdout="",
                    stderr=str(err),
                    passed=False,
                )
            )
            continue
        cmd_text = _command_to_str(result.cmd)
        passed = result.returncode == 0
        if not passed:
            detail = result.stderr.strip() or result.stdout.strip() or f"exit {result.returncode}"
            failures.append(f"{cmd_text}: {detail}")
        records.append(
            CommandResultRecord(
                command=cmd_text,
                returncode=result.returncode,
                stdout=result.stdout,
                stderr=result.stderr,
                passed=passed,
            )
        )
    return tuple(records), tuple(failures)


def run_experiment_patch(
    *,
    area: str,
    patch_file: Path,
    workspace_root: Path,
    config: RealForgeConfig | None = None,
    validation_mode: ValidationMode = "quick",
    keep: bool = False,
    output_json: Path | None = None,
    command_runner: CommandRunner = run_command,
    temp_root: Path | None = None,
) -> ExperimentReport:
    cfg = config or RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=workspace_root)
    main_root = (cfg.workspace_root or workspace_root).resolve()
    patch_file = patch_file.resolve()
    experiment_id = uuid.uuid4().hex[:12]
    started = time.monotonic()
    failures: list[str] = []
    notes: list[str] = [
        "Patch applied only inside isolated experiment workspace.",
        "Human approval is required before merging any changes to the main workspace.",
    ]

    before_snapshot = snapshot_working_tree(main_root)
    workspace = None
    command_results: tuple[CommandResultRecord, ...] = ()
    validation_commands: tuple[tuple[str, ...], ...] = ()
    cleanup_status = "not started"
    experiment_path: str | None = None
    workspace_mode = "none"
    passed = False

    try:
        workspace = create_experiment_workspace(main_root, config=cfg, temp_root=temp_root)
        experiment_id = workspace.experiment_id
        experiment_path = str(workspace.workspace_path)
        workspace_mode = workspace.mode
        validation_commands = build_validation_commands(validation_mode, workspace.workspace_path, config=cfg)

        apply_result = apply_unified_patch(patch_file, workspace, config=cfg)
        if apply_result.returncode != 0:
            detail = apply_result.stderr.strip() or apply_result.stdout.strip() or "patch apply failed"
            failures.append(f"patch apply failed: {detail}")
            command_results = (
                CommandResultRecord(
                    command=_command_to_str(apply_result.cmd),
                    returncode=apply_result.returncode,
                    stdout=apply_result.stdout,
                    stderr=apply_result.stderr,
                    passed=False,
                ),
            )
        else:
            command_results, validation_failures = _run_validation_commands(
                validation_commands,
                workspace=workspace.workspace_path,
                config=cfg,
                command_runner=command_runner,
            )
            failures.extend(validation_failures)
            passed = not failures
    except Exception as err:  # noqa: BLE001 - surface experiment setup failures safely
        failures.append(str(err))

    after_snapshot = snapshot_working_tree(main_root)
    main_modified = working_tree_changed(before_snapshot, after_snapshot)
    if main_modified:
        failures = list(failures)
        failures.append("main workspace working tree changed during experiment")
        passed = False

    kept = keep
    if workspace is not None:
        if keep:
            cleanup_status = "kept (--keep)"
        else:
            cleanup_status = remove_experiment_workspace(workspace, config=cfg)
            if cleanup_status != "removed":
                failures = list(failures)
                failures.append(f"cleanup issue: {cleanup_status}")
                passed = False

    duration_ms = int((time.monotonic() - started) * 1000)
    report = ExperimentReport(
        id=experiment_id,
        area=area,
        patch_file=str(patch_file),
        workspace_mode=workspace_mode,
        experiment_path=experiment_path,
        validation_commands=tuple(_command_to_str(cmd) for cmd in validation_commands),
        command_results=command_results,
        passed=passed and not main_modified,
        failures=tuple(failures),
        duration_ms=duration_ms,
        kept=kept,
        cleanup_status=cleanup_status,
        main_workspace_modified=main_modified,
        notes=tuple(notes),
    )
    if output_json is not None:
        write_report_json(report, output_json)
    return report


def format_patch_outcome(report: ExperimentReport) -> str:
    return format_experiment_report(report)


def run_validation_commands(
    commands: tuple[tuple[str, ...], ...],
    *,
    workspace: Path,
    config: RealForgeConfig,
    command_runner: CommandRunner = run_command,
) -> tuple[tuple[CommandResultRecord, ...], tuple[str, ...]]:
    return _run_validation_commands(
        commands,
        workspace=workspace,
        config=config,
        command_runner=command_runner,
    )
