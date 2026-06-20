from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from realforge.config import RealForgeConfig
from realforge.errors import ProviderPlanError
from realforge.experiment import run_experiment_patch
from realforge.experiment_report import write_report_json
from realforge.git_utils import snapshot_working_tree
from realforge.leaderboard import load_benchmark_reports_safe
from realforge.patch_proposal import PatchProposalError, run_propose_patch
from realforge.proposals import ProposalError, propose_merge_from_report
from realforge.providers import resolve_provider
from realforge.providers.base import ModelProvider
from realforge.scheduler_report import (
    SchedulerAreaResult,
    SchedulerRunReport,
    format_scheduler_run,
    format_scheduler_run_list,
    list_scheduler_runs,
    load_scheduler_run,
    scheduler_run_workspace_dir,
    utc_now_iso,
    write_scheduler_run,
)
from realforge.self_improve import AREA_TASKS, run_improve
from realforge.self_improvement_plan import IMPROVE_AREAS
from realforge.staff import require_staff_enabled
from realforge.update_bundle import UpdateBundleError, create_update_bundle


class SchedulerError(Exception):
    pass


SCHEDULER_DISABLED_MESSAGE = (
    "scheduler is disabled; set [scheduler].enabled = true in .realforge.toml to run scheduler jobs"
)


@dataclass(frozen=True)
class SchedulerOutcome:
    ok: bool
    message: str
    report: SchedulerRunReport | None = None


def _default_safety_notes() -> tuple[str, ...]:
    return (
        "Scheduler is staff-only and bounded; it is not an infinite autonomous loop.",
        "Scheduler never auto-applies patches or auto-commits.",
        "Scheduler never enables itself.",
        "Provider patch output remains untrusted.",
        "Patch evaluation uses isolated experiments only.",
        "Human approval remains required for apply-proposal.",
        "RealForge does not claim superiority over frontier coding tools.",
    )


def _filter_realforge_metadata(snapshot: dict[str, int]) -> dict[str, int]:
    return {key: value for key, value in snapshot.items() if not key.startswith(".realforge/")}


def _workspace_source_changed(before: dict[str, int], after: dict[str, int]) -> bool:
    return _filter_realforge_metadata(before) != _filter_realforge_metadata(after)


def _validate_scheduler_config(config: RealForgeConfig) -> None:
    scheduler = config.scheduler
    if scheduler.auto_apply:
        raise SchedulerError("auto_apply is unsupported/refused in RealForge 2.0")
    if scheduler.auto_commit:
        raise SchedulerError("auto_commit is unsupported/refused in RealForge 2.0")
    if scheduler.max_runs_per_invocation < 1 or scheduler.max_runs_per_invocation > 3:
        raise SchedulerError("max_runs_per_invocation must be between 1 and 3")
    for area in scheduler.areas[: scheduler.max_runs_per_invocation]:
        if area not in IMPROVE_AREAS:
            raise SchedulerError(f"unknown scheduler area: {area}")


def _selected_areas(config: RealForgeConfig) -> tuple[str, ...]:
    return tuple(config.scheduler.areas[: config.scheduler.max_runs_per_invocation])


def _latest_benchmark_for_provider(
    workspace_root: Path,
    *,
    provider: str,
) -> tuple[float | None, str | None]:
    reports, _warnings = load_benchmark_reports_safe(workspace_root)
    matching = [report for report in reports if report.provider == provider]
    if not matching:
        return None, None
    latest = max(matching, key=lambda report: report.started_at)
    return latest.normalized_score, latest.id


def check_benchmark_gate(
    *,
    workspace_root: Path,
    config: RealForgeConfig,
) -> tuple[bool, bool, str]:
    scheduler = config.scheduler
    if not scheduler.require_leaderboard_pass:
        return False, True, "benchmark gate disabled (require_leaderboard_pass=false)"

    score, report_id = _latest_benchmark_for_provider(workspace_root, provider=scheduler.provider)
    if score is None:
        return True, False, (
            f"no saved task benchmark reports for provider={scheduler.provider}; "
            "run realforge bench-tasks --provider mock --suite all --write"
        )
    if score < scheduler.minimum_benchmark_score:
        return (
            True,
            False,
            f"latest benchmark score {score:.3f} below minimum {scheduler.minimum_benchmark_score:.3f} "
            f"(report={report_id})",
        )
    return (
        True,
        True,
        f"latest benchmark score {score:.3f} meets minimum {scheduler.minimum_benchmark_score:.3f} "
        f"(report={report_id})",
    )


def format_scheduler_status(config: RealForgeConfig) -> str:
    require_staff_enabled(config)
    scheduler = config.scheduler
    workspace_root = (config.workspace_root or Path.cwd()).resolve()
    score, report_id = _latest_benchmark_for_provider(workspace_root, provider=scheduler.provider)
    runs = list_scheduler_runs(workspace_root)
    latest_run = max(runs, key=lambda report: report.created_at) if runs else None

    auto_apply_status = (
        "configured true; unsupported/refused in RealForge 2.0"
        if scheduler.auto_apply
        else "false; unsupported/refused in RealForge 2.0"
    )
    auto_commit_status = (
        "configured true; unsupported/refused in RealForge 2.0"
        if scheduler.auto_commit
        else "false; unsupported/refused in RealForge 2.0"
    )

    lines = [
        "RealForge scheduler status (staff-only; disabled by default)",
        f"Scheduler enabled: {scheduler.enabled}",
        f"Mode: {scheduler.mode}",
        f"Max runs per invocation: {scheduler.max_runs_per_invocation}",
        f"Areas: {', '.join(scheduler.areas)}",
        f"Provider: {scheduler.provider}",
        f"Require leaderboard pass: {scheduler.require_leaderboard_pass}",
        f"Minimum benchmark score: {scheduler.minimum_benchmark_score:.3f}",
        f"Create update bundle: {scheduler.create_update_bundle}",
        "",
        "Safety gates:",
        f"  auto_apply: {auto_apply_status}",
        f"  auto_commit: {auto_commit_status}",
    ]
    if score is None:
        lines.append("Latest benchmark: (none saved for configured provider)")
    else:
        lines.append(
            f"Latest benchmark: provider={scheduler.provider} score={score:.3f} report={report_id}"
        )
    if latest_run:
        lines.append(
            f"Latest scheduler run: id={latest_run.id} passed={latest_run.passed} "
            f"stopped={latest_run.stopped_reason}"
        )
    else:
        lines.append("Latest scheduler run: (none saved in .realforge/scheduler_runs/)")
    lines.extend(
        [
            "",
            "Notes:",
            "  - Scheduler commands are staff-only.",
            "  - Scheduler produces proposals/update bundles, not applied changes.",
            "  - This is backend foundation for a future staff-only Improve/Update button.",
        ]
    )
    return "\n".join(lines)


def _resolve_scheduler_provider(config: RealForgeConfig) -> ModelProvider:
    return resolve_provider(config, config.scheduler.provider)


def _run_scheduler_area(
    *,
    area: str,
    provider: ModelProvider,
    workspace_root: Path,
    config: RealForgeConfig,
    run_id: str,
    temp_root: Path | None,
) -> SchedulerAreaResult:
    failures: list[str] = []
    next_steps: list[str] = []
    patch_proposal_id: str | None = None
    experiment_report_id: str | None = None
    proposal_id: str | None = None
    update_bundle_id: str | None = None
    improvement_plan_id: str | None = None

    if not config.improvement.allow_patch_proposals:
        return SchedulerAreaResult(
            area=area,
            improvement_plan_id=None,
            patch_proposal_id=None,
            experiment_report_id=None,
            proposal_id=None,
            update_bundle_id=None,
            passed=False,
            skipped_reason="[improvement].allow_patch_proposals is false",
            failures=(),
            next_steps=("Enable allow_patch_proposals to run scheduler patch flow.",),
        )

    try:
        improve = run_improve(area=area, provider=provider, workspace_root=workspace_root)
        improvement_plan_id = f"{area}:{improve.plan.title}"

        task = AREA_TASKS.get(area, AREA_TASKS["realforge"])
        patch_outcome = run_propose_patch(
            task=task,
            provider=provider,
            workspace_root=workspace_root,
            config=config,
            save=True,
            run_experiment=False,
        )
        patch_proposal_id = patch_outcome.proposal.id if patch_outcome.proposal else None
        if patch_outcome.saved_diff is None:
            raise SchedulerError("patch proposal save failed")

        experiment = run_experiment_patch(
            area=area,
            patch_file=patch_outcome.saved_diff,
            workspace_root=workspace_root,
            config=config,
            validation_mode="quick",
            temp_root=temp_root,
        )
        experiment_report_id = experiment.id
        run_dir = scheduler_run_workspace_dir(workspace_root, run_id)
        run_dir.mkdir(parents=True, exist_ok=True)
        experiment_path = run_dir / f"{area}_experiment.json"
        write_report_json(experiment, experiment_path)

        if not experiment.passed:
            failures.extend(experiment.failures)
            next_steps.append(f"Review experiment report for area {area} and revise patch.")
            return SchedulerAreaResult(
                area=area,
                improvement_plan_id=improvement_plan_id,
                patch_proposal_id=patch_proposal_id,
                experiment_report_id=experiment_report_id,
                proposal_id=None,
                update_bundle_id=None,
                passed=False,
                skipped_reason=None,
                failures=tuple(failures),
                next_steps=tuple(next_steps),
            )

        proposal = propose_merge_from_report(experiment_path, workspace_root=workspace_root, config=config)
        proposal_id = proposal.id
        next_steps.extend(
            [
                f"realforge show-proposal {proposal.id}",
                f"realforge apply-proposal {proposal.id} --confirm",
            ]
        )

        if config.scheduler.create_update_bundle:
            try:
                bundle_outcome = create_update_bundle(
                    proposal_id=proposal.id,
                    workspace_root=workspace_root,
                    config=config,
                )
                if bundle_outcome.bundle is not None:
                    update_bundle_id = bundle_outcome.bundle.id
                    next_steps.append(f"realforge update-bundle show {update_bundle_id}")
            except UpdateBundleError as err:
                failures.append(f"update bundle creation failed: {err}")

        passed = proposal_id is not None and not failures
        return SchedulerAreaResult(
            area=area,
            improvement_plan_id=improvement_plan_id,
            patch_proposal_id=patch_proposal_id,
            experiment_report_id=experiment_report_id,
            proposal_id=proposal_id,
            update_bundle_id=update_bundle_id,
            passed=passed,
            skipped_reason=None,
            failures=tuple(failures),
            next_steps=tuple(next_steps),
        )
    except (PatchProposalError, ProposalError, SchedulerError, ProviderPlanError) as err:
        failures.append(str(err))
        return SchedulerAreaResult(
            area=area,
            improvement_plan_id=improvement_plan_id,
            patch_proposal_id=patch_proposal_id,
            experiment_report_id=experiment_report_id,
            proposal_id=proposal_id,
            update_bundle_id=update_bundle_id,
            passed=False,
            skipped_reason=None,
            failures=tuple(failures),
            next_steps=tuple(next_steps),
        )


def run_scheduler(
    *,
    workspace_root: Path,
    config: RealForgeConfig,
    dry_run: bool = False,
    temp_root: Path | None = None,
) -> SchedulerOutcome:
    require_staff_enabled(config)
    _validate_scheduler_config(config)
    if not config.scheduler.enabled:
        raise SchedulerError(SCHEDULER_DISABLED_MESSAGE)

    root = workspace_root.resolve()
    scheduler = config.scheduler
    areas = _selected_areas(config)
    gate_checked, gate_passed, gate_detail = check_benchmark_gate(workspace_root=root, config=config)

    if dry_run:
        lines = [
            "RealForge scheduler dry-run (staff mode; no writes to source files)",
            f"Scheduler enabled: {scheduler.enabled}",
            f"Mode: {scheduler.mode}",
            f"Provider: {scheduler.provider}",
            f"Selected areas ({len(areas)}): {', '.join(areas)}",
            f"Benchmark gate: {gate_detail}",
        ]
        if scheduler.require_leaderboard_pass and not gate_passed:
            lines.extend(
                [
                    "",
                    "Dry-run would stop before creating patch proposals, experiments, proposals, or bundles.",
                ]
            )
            return SchedulerOutcome(ok=False, message="\n".join(lines), report=None)

        lines.extend(
            [
                "",
                "Would run for each selected area:",
                "  1. improvement plan (read-only)",
                "  2. provider patch proposal (untrusted; saved on real run)",
                "  3. isolated experiment",
                "  4. merge proposal if experiment passes",
            ]
        )
        if scheduler.create_update_bundle:
            lines.append("  5. update bundle if proposal created")
        lines.extend(
            [
                "",
                "Dry-run only: no patch proposals, experiments, proposals, or bundles created.",
                "Main workspace source files will not be modified.",
            ]
        )
        return SchedulerOutcome(ok=True, message="\n".join(lines), report=None)

    if scheduler.require_leaderboard_pass and not gate_passed:
        raise SchedulerError(gate_detail)

    provider = _resolve_scheduler_provider(config)
    run_id = uuid.uuid4().hex[:12]
    started = time.monotonic()
    before_snapshot = snapshot_working_tree(root)

    area_results: list[SchedulerAreaResult] = []
    proposals_created: list[str] = []
    bundles_created: list[str] = []
    experiments_created: list[str] = []
    global_next_steps: list[str] = []
    stopped_reason = "completed"

    for area in areas:
        result = _run_scheduler_area(
            area=area,
            provider=provider,
            workspace_root=root,
            config=config,
            run_id=run_id,
            temp_root=temp_root,
        )
        area_results.append(result)
        if result.experiment_report_id:
            experiments_created.append(result.experiment_report_id)
        if result.proposal_id:
            proposals_created.append(result.proposal_id)
        if result.update_bundle_id:
            bundles_created.append(result.update_bundle_id)
        global_next_steps.extend(result.next_steps)
        if not result.passed and result.failures:
            stopped_reason = f"area {area} failed"
            break

    after_snapshot = snapshot_working_tree(root)
    main_modified = _workspace_source_changed(before_snapshot, after_snapshot)
    if main_modified:
        stopped_reason = "main workspace source files changed unexpectedly"

    passed = bool(proposals_created) and not main_modified and all(item.passed for item in area_results)
    if main_modified:
        passed = False

    duration_ms = int((time.monotonic() - started) * 1000)
    report = SchedulerRunReport(
        id=run_id,
        created_at=utc_now_iso(),
        provider=scheduler.provider,
        areas=areas,
        dry_run=False,
        max_runs=scheduler.max_runs_per_invocation,
        benchmark_gate_checked=gate_checked,
        benchmark_gate_passed=gate_passed,
        minimum_benchmark_score=scheduler.minimum_benchmark_score,
        area_results=tuple(area_results),
        proposals_created=tuple(proposals_created),
        update_bundles_created=tuple(bundles_created),
        experiments_created=tuple(experiments_created),
        passed=passed,
        stopped_reason=stopped_reason,
        next_steps=tuple(dict.fromkeys(global_next_steps)),
        safety_notes=_default_safety_notes(),
        duration_ms=duration_ms,
        main_workspace_modified=main_modified,
    )
    write_scheduler_run(report, root)
    return SchedulerOutcome(
        ok=passed and not main_modified,
        message=format_scheduler_run(report),
        report=report,
    )


def list_scheduler(workspace_root: Path, *, config: RealForgeConfig) -> str:
    require_staff_enabled(config)
    return format_scheduler_run_list(list_scheduler_runs(workspace_root.resolve()))


def show_scheduler_run(workspace_root: Path, run_id: str, *, config: RealForgeConfig) -> str:
    require_staff_enabled(config)
    return format_scheduler_run(load_scheduler_run(workspace_root.resolve(), run_id))
