from __future__ import annotations

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from realforge.config import RealForgeConfig
from realforge.cycle_report import (
    MAX_CYCLE_BUDGET,
    CycleAttempt,
    CycleReport,
    cycles_dir,
    format_cycle_report,
    list_cycle_reports,
    load_cycle_report,
    write_cycle_report,
)
from realforge.experiment import VALIDATION_MODES, build_validation_commands, run_experiment_patch
from realforge.experiment_report import write_report_json
from realforge.git_utils import snapshot_working_tree
from realforge.proposals import ProposalError, propose_merge_from_report
from realforge.providers.base import ModelProvider
from realforge.research import build_research_context
from realforge.research.store import load_research_record
from realforge.runner import CommandResult, run_command
from realforge.self_improve import run_improve
from realforge.self_improvement_plan import format_improvement_plan

CommandRunner = Callable[..., CommandResult]


class CycleError(Exception):
    pass


@dataclass(frozen=True)
class CycleOutcome:
    report: CycleReport | None
    message: str
    ok: bool


def validate_budget(budget: int) -> int:
    if budget < 1 or budget > MAX_CYCLE_BUDGET:
        raise CycleError(f"budget must be between 1 and {MAX_CYCLE_BUDGET}")
    return budget


def _filter_realforge_metadata(snapshot: dict[str, int]) -> dict[str, int]:
    return {key: value for key, value in snapshot.items() if not key.startswith(".realforge/")}


def _workspace_source_changed(before: dict[str, int], after: dict[str, int]) -> bool:
    return _filter_realforge_metadata(before) != _filter_realforge_metadata(after)


def _default_safety_notes() -> tuple[str, ...]:
    return (
        "Cycle does not auto-merge or auto-apply patches.",
        "Model output remains untrusted; human approval is required.",
        "Cycle does not fetch internet resources directly.",
    )


def _load_research_ids(workspace_root: Path, research_ids: tuple[str, ...]) -> tuple[str, ...]:
    loaded: list[str] = []
    for record_id in research_ids:
        load_research_record(workspace_root, record_id)
        loaded.append(record_id)
    return tuple(loaded)


def _research_context(workspace_root: Path, research_ids: tuple[str, ...]) -> str:
    sections = [build_research_context(workspace_root, record_id) for record_id in research_ids]
    return "\n\n".join(sections)


def run_cycle_dry_run(
    *,
    area: str,
    workspace_root: Path,
    provider: ModelProvider,
    config: RealForgeConfig,
    budget: int = 1,
    research_ids: tuple[str, ...] = (),
    validation_mode: str = "quick",
    max_context_chars: int = 12000,
) -> CycleOutcome:
    validate_budget(budget)
    if validation_mode not in VALIDATION_MODES:
        raise CycleError(f"unknown validation mode: {validation_mode}")
    research_ids = _load_research_ids(workspace_root, research_ids)

    improve = run_improve(
        area=area,
        provider=provider,
        workspace_root=workspace_root,
        max_context_chars=max_context_chars,
    )
    validation_commands = build_validation_commands(validation_mode, workspace_root, config=config)

    lines = [
        "RealForge cycle dry-run (plan generated; no validation executed)",
        f"Area: {area}",
        f"Budget: {budget}",
        "",
        format_improvement_plan(improve.plan),
    ]
    if research_ids:
        lines.extend(["", _research_context(workspace_root, research_ids)])
    lines.extend(
        [
            "",
            "Proposed validation steps:",
            *[f"  - {' '.join(cmd)}" for cmd in validation_commands],
            "",
            "No experiment workspace created. No merge proposal created.",
            "Dry-run generated a plan only; validation was not executed.",
        ]
    )
    return CycleOutcome(report=None, message="\n".join(lines), ok=True)


def run_cycle_patch(
    *,
    area: str,
    patch_file: Path,
    workspace_root: Path,
    config: RealForgeConfig,
    budget: int = 1,
    research_ids: tuple[str, ...] = (),
    validation_mode: str = "quick",
    temp_root: Path | None = None,
    command_runner: CommandRunner | None = None,
) -> CycleOutcome:
    runner = command_runner or run_command
    validate_budget(budget)
    if validation_mode not in VALIDATION_MODES:
        raise CycleError(f"unknown validation mode: {validation_mode}")

    root = (config.workspace_root or workspace_root).resolve()
    patch_file = patch_file.resolve()
    if not patch_file.is_file():
        raise CycleError(f"patch file not found: {patch_file}")

    research_ids = _load_research_ids(root, research_ids)
    cycle_id = uuid.uuid4().hex[:12]
    started = time.monotonic()
    before_snapshot = snapshot_working_tree(root)

    attempts: list[CycleAttempt] = []
    experiment_report_paths: list[str] = []
    proposal_ids: list[str] = []
    passed = False
    stopped_reason = "budget exhausted"
    next_steps: list[str] = []
    safety_notes = list(_default_safety_notes())
    if research_ids:
        safety_notes.append("Cycle used saved research snapshots only; no new internet fetch occurred.")

    cycle_dir = cycles_dir(root) / cycle_id
    cycle_dir.mkdir(parents=True, exist_ok=True)

    for attempt_number in range(1, budget + 1):
        experiment = run_experiment_patch(
            area=area,
            patch_file=patch_file,
            workspace_root=root,
            config=config,
            validation_mode=validation_mode,
            temp_root=temp_root,
            command_runner=runner,
        )
        report_rel = (cycle_dir / f"attempt_{attempt_number}_experiment.json").relative_to(root).as_posix()
        report_path = root / report_rel
        write_report_json(experiment, report_path)
        experiment_report_paths.append(report_rel)

        proposal_id: str | None = None
        if experiment.passed:
            try:
                proposal = propose_merge_from_report(report_path, workspace_root=root, config=config)
                proposal_id = proposal.id
                proposal_ids.append(proposal.id)
                passed = True
                stopped_reason = "experiment passed"
                next_steps.extend(
                    [
                        f"realforge show-proposal {proposal.id}",
                        f"realforge apply-proposal {proposal.id} --confirm",
                    ]
                )
            except ProposalError as err:
                stopped_reason = f"proposal creation failed: {err}"
                attempts.append(
                    CycleAttempt(
                        number=attempt_number,
                        experiment_id=experiment.id,
                        experiment_report_path=report_rel,
                        passed=False,
                        proposal_id=None,
                        failures=(str(err),),
                    )
                )
                break
        else:
            stopped_reason = "experiment failed"
            next_steps.append("Review experiment failures in the cycle report and revise the patch.")

        attempts.append(
            CycleAttempt(
                number=attempt_number,
                experiment_id=experiment.id,
                experiment_report_path=report_rel,
                passed=experiment.passed and proposal_id is not None,
                proposal_id=proposal_id,
                failures=experiment.failures,
            )
        )
        if experiment.passed and proposal_id:
            break
        if not experiment.passed:
            break

    after_snapshot = snapshot_working_tree(root)
    main_modified = _workspace_source_changed(before_snapshot, after_snapshot)
    if main_modified:
        passed = False
        stopped_reason = "main workspace source files changed unexpectedly"
        safety_notes.append("Cycle aborted safety checks due to unexpected main workspace changes.")

    duration_ms = int((time.monotonic() - started) * 1000)
    proposal_created = bool(proposal_ids) and passed and not main_modified
    report = CycleReport(
        id=cycle_id,
        area=area,
        budget=budget,
        attempts=tuple(attempts),
        research_ids=research_ids,
        patch_file=str(patch_file),
        experiment_reports=tuple(experiment_report_paths),
        proposal_ids=tuple(proposal_ids),
        passed=proposal_created,
        proposal_created=proposal_created,
        stopped_reason=stopped_reason,
        next_steps=tuple(next_steps),
        duration_ms=duration_ms,
        main_workspace_modified=main_modified,
        safety_notes=tuple(safety_notes),
    )
    write_cycle_report(report, root)
    return CycleOutcome(report=report, message=format_cycle_report(report), ok=report.passed)


def format_cycle_list(reports: tuple[CycleReport, ...]) -> str:
    if not reports:
        return "No cycle reports found in .realforge/cycles/"
    lines = ["RealForge cycle reports:"]
    for report in reports:
        lines.append(
            f"  - {report.id} area={report.area} proposal_created={report.proposal_created} stopped={report.stopped_reason}"
        )
    return "\n".join(lines)


def list_cycles(workspace_root: Path) -> str:
    return format_cycle_list(list_cycle_reports(workspace_root))


def show_cycle(workspace_root: Path, cycle_id: str) -> str:
    return format_cycle_report(load_cycle_report(workspace_root, cycle_id))
