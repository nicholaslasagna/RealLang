from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from realforge.config import RealForgeConfig
from realforge.cycle import CycleError, run_cycle_patch
from realforge.cycle_report import MAX_CYCLE_BUDGET
from realforge.eval_report import EvalReport, list_eval_reports
from realforge.eval_runner import run_eval
from realforge.index.file_index import scan_workspace
from realforge.providers.base import ModelProvider
from realforge.self_improve import AREA_TASKS, run_improve
from realforge.self_improvement_plan import IMPROVE_AREAS, format_improvement_plan
from realforge.staff import require_staff_enabled

UPDATE_CHECK_AREAS = tuple(sorted(IMPROVE_AREAS))


class UpdateChannelError(Exception):
    pass


@dataclass(frozen=True)
class UpdateCheckOutcome:
    message: str
    ok: bool


@dataclass(frozen=True)
class ImproveChannelOutcome:
    message: str
    ok: bool
    proposal_id: str | None = None


def normalized_eval_score(report: EvalReport) -> float:
    if not report.tasks:
        return 0.0
    return sum(task.score for task in report.tasks) / (len(report.tasks) * 100)


def eval_meets_requirements(
    report: EvalReport,
    *,
    require_pass: bool,
    minimum_score: float,
) -> tuple[bool, str]:
    normalized = normalized_eval_score(report)
    if require_pass and not report.passed:
        return False, f"provider eval did not pass: {', '.join(report.failures) or 'unknown failure'}"
    if normalized < minimum_score:
        return (
            False,
            f"normalized eval score {normalized:.2f} below minimum {minimum_score:.2f}",
        )
    return True, f"provider eval normalized score {normalized:.2f} meets minimum {minimum_score:.2f}"


def eval_suite_for_channel(config: RealForgeConfig) -> str:
    return "all" if config.improvement.channel == "experimental" else "smoke"


def _recent_eval_summary(workspace_root: Path) -> str | None:
    reports = list_eval_reports(workspace_root)
    if not reports:
        return None
    latest = max(reports, key=lambda report: report.started_at)
    normalized = normalized_eval_score(latest)
    return (
        f"Latest eval: id={latest.id} provider={latest.provider} suite={latest.suite} "
        f"passed={latest.passed} normalized_score={normalized:.2f}"
    )


def _area_signals(workspace_root: Path, area: str) -> list[str]:
    index = scan_workspace(workspace_root)
    root = index.workspace_root
    signals: list[str] = [f"task: {AREA_TASKS.get(area, AREA_TASKS['realforge'])}"]

    if area == "tests":
        signals.append(f"indexed tests: {len(index.tests)}")
    if area == "docs":
        signals.append(f"indexed docs: {len(index.docs)}")
    if area == "realforge":
        realforge_root = root / "src" / "realforge"
        count = len(list(realforge_root.rglob("*.py"))) if realforge_root.is_dir() else 0
        signals.append(f"realforge python files: {count}")
    if area == "compiler":
        signals.append(f"indexed .real files: {len(index.real_files)}")
    if area == "safety":
        signals.append("focus: permissions, command policy, patch safety, eval harness")

    return signals


def run_update_check(
    *,
    workspace_root: Path,
    config: RealForgeConfig,
) -> UpdateCheckOutcome:
    require_staff_enabled(config)
    root = workspace_root.resolve()

    lines = [
        "RealForge update-check (read-only; staff mode)",
        f"Improvement channel: {config.improvement.channel}",
        "",
        "Candidate improvement areas:",
    ]
    for area in UPDATE_CHECK_AREAS:
        lines.append(f"  - {area}:")
        for signal in _area_signals(root, area):
            lines.append(f"      {signal}")

    eval_summary = _recent_eval_summary(root)
    if eval_summary:
        lines.extend(["", eval_summary])
    else:
        lines.extend(["", "No saved eval reports found in .realforge/evals/"])

    lines.extend(
        [
            "",
            "Read-only check complete.",
            "No files edited. No experiments created. No internet fetched.",
            "Next step (dry-run): realforge improve-channel --area <area> --dry-run",
        ]
    )
    return UpdateCheckOutcome(message="\n".join(lines), ok=True)


def _validate_channel_config(
    config: RealForgeConfig,
    *,
    budget: int,
    research_ids: tuple[str, ...],
) -> None:
    improvement = config.improvement
    if budget < 1 or budget > MAX_CYCLE_BUDGET:
        raise UpdateChannelError(f"budget must be between 1 and {MAX_CYCLE_BUDGET}")
    if budget > improvement.max_budget:
        raise UpdateChannelError(
            f"budget {budget} exceeds configured max_budget {improvement.max_budget}"
        )
    if research_ids and not improvement.allow_research:
        raise UpdateChannelError(
            "research IDs were provided but [improvement].allow_research is false"
        )
    if improvement.auto_apply:
        raise UpdateChannelError("auto_apply is unsupported in RealForge 1.4; apply manually with apply-proposal --confirm")
    if improvement.auto_commit:
        raise UpdateChannelError("auto_commit is unsupported in RealForge 1.4")


def _run_provider_eval(
    *,
    provider: ModelProvider,
    workspace_root: Path,
    config: RealForgeConfig,
) -> tuple[EvalReport, str]:
    suite = eval_suite_for_channel(config)
    outcome = run_eval(
        provider=provider,
        suite=suite,
        workspace_root=workspace_root,
        config=config,
        write=False,
    )
    ok, detail = eval_meets_requirements(
        outcome.report,
        require_pass=config.improvement.require_eval_pass,
        minimum_score=config.improvement.minimum_eval_score,
    )
    if not ok:
        raise UpdateChannelError(detail)
    return outcome.report, detail


def run_improve_channel_dry_run(
    *,
    area: str,
    workspace_root: Path,
    config: RealForgeConfig,
    provider: ModelProvider,
    budget: int = 1,
    research_ids: tuple[str, ...] = (),
    max_context_chars: int = 12000,
) -> ImproveChannelOutcome:
    require_staff_enabled(config)
    if area not in IMPROVE_AREAS:
        raise UpdateChannelError(f"unknown improvement area: {area}")
    _validate_channel_config(config, budget=budget, research_ids=research_ids)

    improve = run_improve(
        area=area,
        provider=provider,
        workspace_root=workspace_root,
        max_context_chars=max_context_chars,
    )

    lines = [
        "RealForge improve-channel dry-run (staff mode; no writes)",
        f"Area: {area}",
        f"Channel: {config.improvement.channel}",
        f"Budget: {budget} (max_budget={config.improvement.max_budget})",
        "",
        format_improvement_plan(improve.plan),
    ]

    would_proceed = True
    eval_detail = "provider eval skipped (require_eval_pass=false)"
    if config.improvement.require_eval_pass:
        try:
            _, eval_detail = _run_provider_eval(
                provider=provider,
                workspace_root=workspace_root,
                config=config,
            )
            lines.extend(["", f"Provider eval: {eval_detail}"])
        except UpdateChannelError as err:
            would_proceed = False
            lines.extend(["", f"Provider eval blocked flow: {err}"])
    else:
        lines.extend(["", eval_detail])

    lines.extend(
        [
            "",
            f"Flow would proceed: {would_proceed}",
            "Dry-run only: no experiment workspace, no proposal, no patch apply, no commit.",
            "Provider output remains untrusted.",
        ]
    )
    return ImproveChannelOutcome(message="\n".join(lines), ok=would_proceed)


def run_improve_channel_patch(
    *,
    area: str,
    patch_file: Path,
    workspace_root: Path,
    config: RealForgeConfig,
    provider: ModelProvider,
    budget: int = 1,
    research_ids: tuple[str, ...] = (),
    validation_mode: str = "quick",
    temp_root: Path | None = None,
) -> ImproveChannelOutcome:
    require_staff_enabled(config)
    if area not in IMPROVE_AREAS:
        raise UpdateChannelError(f"unknown improvement area: {area}")
    if not config.improvement.allow_patch_proposals:
        raise UpdateChannelError("[improvement].allow_patch_proposals is false; patch flow rejected")

    _validate_channel_config(config, budget=budget, research_ids=research_ids if config.improvement.allow_research else ())

    if config.improvement.require_eval_pass:
        _run_provider_eval(
            provider=provider,
            workspace_root=workspace_root,
            config=config,
        )

    try:
        cycle = run_cycle_patch(
            area=area,
            patch_file=patch_file,
            workspace_root=workspace_root,
            config=config,
            budget=budget,
            research_ids=research_ids if config.improvement.allow_research else (),
            validation_mode=validation_mode,
            temp_root=temp_root,
        )
    except CycleError as err:
        raise UpdateChannelError(str(err)) from err

    proposal_id = cycle.report.proposal_ids[0] if cycle.report and cycle.report.proposal_ids else None
    lines = [
        "RealForge improve-channel patch flow (staff mode)",
        cycle.message,
        "",
        "Auto-apply and auto-commit remain unsupported in v1.4.",
    ]
    if proposal_id:
        lines.extend(
            [
                "",
                "Next manual steps:",
                f"  realforge show-proposal {proposal_id}",
                f"  realforge apply-proposal {proposal_id} --confirm",
            ]
        )
    return ImproveChannelOutcome(
        message="\n".join(lines),
        ok=cycle.ok,
        proposal_id=proposal_id,
    )
