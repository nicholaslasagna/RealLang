from __future__ import annotations

import argparse
import sys
from pathlib import Path

from realforge.agent_loop import AgentMode, check_file, repair_file, run_agent
from realforge.capabilities import (
    build_capability_registry,
    format_capabilities,
    format_capabilities_json,
)
from realforge.creative.asset_brief import build_asset_brief
from realforge.creative.engine_profile import scan_engine_project
from realforge.creative.game_brief import build_game_design_brief
from realforge.creative.image_report import build_image_analysis_report
from realforge.creative.map_design import build_map_design_plan
from realforge.creative.models import (
    CreativeError,
    format_artifact,
    write_creative_artifact,
    write_engine_artifact,
)
from realforge.creative.unreal import build_unreal_command_plan
from realforge.config import load_config
from realforge.config_file import ConfigFileError
from realforge.doctor import format_doctor_report, run_doctor
from realforge.generation import run_generate
from realforge.index.context_builder import build_context
from realforge.index.file_index import format_index_report, scan_workspace, write_index_cache
from realforge.index.symbols import format_symbol_table, scan_workspace_symbols
from realforge.interaction import build_slash_registry, format_slash_commands, format_slash_json
from realforge.permissions import PermissionMode, Permissions
from realforge.provider_status import (
    build_provider_status_report,
    format_provider_status,
    format_provider_status_json,
)
from realforge.provider_smoke import (
    format_provider_smoke,
    format_provider_smoke_json,
    run_private_provider_smoke,
)
from realforge.provider_chat_sandbox import (
    CHAT_SANDBOX_MAX_PROMPT_CHARS,
    format_provider_chat_sandbox,
    format_provider_chat_sandbox_json,
    run_private_provider_chat_sandbox,
)
from realforge.providers import resolve_provider
from realforge.errors import ProviderPlanError
from realforge.report import format_check_fail, format_check_pass
from realforge.self_improve import run_improve
from realforge.self_improvement_plan import IMPROVE_AREAS
from realforge.experiment import (
    VALIDATION_MODES,
    format_patch_outcome,
    run_experiment_dry_run,
    run_experiment_patch,
)
from realforge.proposals import (
    ProposalError,
    apply_proposal,
    format_apply_warning,
    format_list_proposals,
    list_proposals,
    propose_merge_from_report,
    show_proposal,
)
from realforge.proposal_report import format_propose_merge_outcome, format_proposal_summary
from realforge.research import ResearchError, default_http_opener, list_research, run_research_fetch, show_research
from realforge.cycle import CycleError, list_cycles, run_cycle_dry_run, run_cycle_patch, show_cycle
from realforge.eval_runner import EvalError, list_evals, run_eval, show_eval
from realforge.eval_report import EVAL_SUITES
from realforge.bench_runner import BenchError, list_bench_tasks, run_bench_tasks, show_bench_task
from realforge.bench_report import BENCH_SUITES
from realforge.skill_bench_runner import (
    SkillBenchError,
    list_skill_bench,
    run_skill_bench,
    show_skill_bench,
)
from realforge.skill_bench_report import SKILL_SUITES
from realforge.leaderboard import export_leaderboard, run_leaderboard
from realforge.multimodal.generation_report import (
    build_image_prompt_spec,
    format_image_prompt_spec,
)
from realforge.multimodal.image_inputs import ImageInputError
from realforge.multimodal.image_outputs import format_report_json, write_multimodal_report
from realforge.multimodal.image_workflow import (
    ImageWorkflowError,
    build_image_generation_job,
    build_prompt_pack,
    build_reference_board,
    format_image_job,
    format_iteration_report,
    format_prompt_pack,
    format_reference_board,
    load_image_iteration_plan,
)
from realforge.multimodal.image_understanding import (
    compare_images,
    format_image_asset_brief,
    format_image_comparison,
    format_image_understanding,
    image_to_asset_brief,
    understand_image,
)
from realforge.multimodal.provider_base import MultimodalProviderError
from realforge.multimodal.registry import (
    format_multimodal_capabilities,
    format_multimodal_capabilities_json,
    resolve_multimodal_provider,
)
from realforge.multimodal.vision_report import analyze_image, format_vision_analysis
from realforge.pipeline.asset_pipeline import build_asset_pipeline_plan, format_asset_pipeline_plan
from realforge.pipeline.blender import build_blender_asset_plan, format_blender_asset_plan
from realforge.pipeline.engine_pipeline import (
    build_engine_pipeline_report,
    format_engine_pipeline_report,
)
from realforge.pipeline.storage import format_pipeline_json, write_pipeline_report
from realforge.pipeline.unreal_pipeline import (
    build_unreal_import_plan,
    format_unreal_import_plan,
)
from realforge.pipeline.validation import PipelineError
from realforge.patch_proposal import PatchProposalError, run_propose_patch
from realforge.scheduler import SchedulerError, format_scheduler_status, list_scheduler, run_scheduler, show_scheduler_run
from realforge.settings_surface import (
    build_effective_settings,
    format_settings,
    format_settings_doctor,
    format_settings_doctor_json,
    format_settings_json,
    run_settings_doctor,
)
from realforge.staff import StaffError, format_staff_status, require_staff_enabled
from realforge.update_channel import UpdateChannelError, run_improve_channel_dry_run, run_improve_channel_patch, run_update_check
from realforge.update_history import list_update_history
from realforge.update_bundle import (
    UpdateBundleError,
    create_update_bundle,
    export_update_bundle,
    list_update_bundle_records,
    mark_update_bundle,
    show_update_bundle_record,
    verify_update_bundle,
)
from realforge.update_bundle_report import MARKABLE_BUNDLE_STATUSES
from realforge.workspace import WorkspaceError


def _add_model_args(parser: argparse.ArgumentParser, *, planning: bool = False, research: bool = False) -> None:
    parser.add_argument("--task", required=True, help="task description for the agent")
    parser.add_argument(
        "--provider",
        default=None,
        help="override model provider (default: [model].provider from .realforge.toml or mock)",
    )
    parser.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )
    if planning:
        parser.add_argument(
            "--include-context",
            action="store_true",
            help="include bounded workspace context in provider planning input",
        )
        parser.add_argument(
            "--max-context-chars",
            type=int,
            default=12000,
            help="maximum context size for --include-context (default: 12000)",
        )
        parser.add_argument(
            "--permission",
            choices=[mode.value for mode in PermissionMode],
            default=PermissionMode.READONLY.value,
            help="permission mode for planning: readonly, manual (review-only; no shell), workspace-write (file edits only)",
        )
    if research:
        parser.add_argument(
            "--include-research",
            default=None,
            help="include saved research summary and citation metadata in planning context",
        )


def _permissions_from_args(args: argparse.Namespace, config) -> Permissions:
    mode = PermissionMode(getattr(args, "permission", PermissionMode.READONLY.value))
    return Permissions(mode=mode, workspace_root=config.workspace_root)


def _load_cli_config(args: argparse.Namespace):
    try:
        return load_config(args.config_root)
    except ConfigFileError as err:
        print(f"error: {err}", file=sys.stderr)
        raise SystemExit(1) from err


def _resolve_cli_provider(args: argparse.Namespace, config):
    try:
        return resolve_provider(config, args.provider)
    except ValueError as err:
        print(f"error: {err}", file=sys.stderr)
        raise SystemExit(1) from err


def _resolve_cli_multimodal_provider(args: argparse.Namespace, config):
    try:
        return resolve_multimodal_provider(config, getattr(args, "provider", None))
    except ValueError as err:
        print(f"error: {err}", file=sys.stderr)
        raise SystemExit(1) from err


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="realforge",
        description="RealForge — local-first AI engineering environment built around RealLang",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser("check", help="run realc --check and summarize diagnostics")
    check.add_argument("file", type=Path, help="RealLang source file (.real)")

    repair = sub.add_parser("repair", help="rule-based repair from realc diagnostics")
    repair.add_argument("file", type=Path, help="RealLang source file (.real)")
    mode = repair.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="show diff without writing")
    mode.add_argument("--apply", action="store_true", help="apply safe repairs with backup")
    repair.add_argument(
        "--keep-failed-repair",
        action="store_true",
        help="keep repaired file when recheck fails (default: rollback from backup)",
    )

    ask = sub.add_parser("ask", help="request a plan from the configured local model provider")
    _add_model_args(ask, planning=True)

    plan = sub.add_parser("plan", help="build a structured plan from the configured local model provider")
    _add_model_args(plan, planning=True, research=True)

    generate = sub.add_parser("generate", help="generate RealLang source from a local model provider")
    _add_model_args(generate)
    generate.add_argument(
        "--output",
        type=Path,
        default=None,
        help="target .real file for --apply (required with --apply)",
    )
    gen_mode = generate.add_mutually_exclusive_group()
    gen_mode.add_argument("--dry-run", action="store_true", help="print generated source without writing")
    gen_mode.add_argument("--apply", action="store_true", help="write generated source with backup if needed")

    sub.add_parser("doctor", help="check RealForge environment and optional local model settings")

    provider = sub.add_parser("provider", help="sanitized local provider configuration status")
    provider_sub = provider.add_subparsers(dest="provider_command", required=True)
    provider_status = provider_sub.add_parser(
        "status",
        help="show redacted provider configuration (no secrets or private model names)",
    )
    provider_status.add_argument(
        "--json",
        action="store_true",
        help="emit machine-readable sanitized provider status JSON",
    )
    provider_status.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="workspace root for repo .realforge.toml precedence (default: current directory)",
    )
    provider_smoke = provider_sub.add_parser(
        "smoke",
        help="run a fixed minimal chat request against the configured local provider",
    )
    provider_smoke.add_argument(
        "--json",
        action="store_true",
        help="emit machine-readable sanitized provider smoke JSON",
    )
    provider_chat = provider_sub.add_parser(
        "chat-sandbox",
        help="run one bounded user-only request against the configured local provider",
    )
    provider_chat.add_argument(
        "--stdin",
        action="store_true",
        required=True,
        help="read bounded user text from stdin only",
    )
    provider_chat.add_argument(
        "--json",
        action="store_true",
        help="emit machine-readable sanitized private chat sandbox JSON",
    )

    index = sub.add_parser("index", help="scan workspace and list tracked project files")
    index.add_argument(
        "--write",
        action="store_true",
        help="write index cache to .realforge/index.json (default: print only)",
    )

    sub.add_parser("symbols", help="extract text-based RealLang symbol tables from .real files")

    context = sub.add_parser("context", help="build a bounded context bundle for local providers")
    context.add_argument("--task", required=True, help="task description used to prioritize context")
    context.add_argument(
        "--max-chars",
        type=int,
        default=12000,
        help="maximum context size in characters (default: 12000)",
    )

    improve = sub.add_parser("improve", help="propose self-improvement plans (dry-run only in 0.6)")
    improve.add_argument(
        "--dry-run",
        action="store_true",
        help="print a structured improvement proposal without modifying files (required in 0.6)",
    )
    improve.add_argument(
        "--area",
        choices=sorted(IMPROVE_AREAS),
        default="realforge",
        help="focus area for context and plan (default: realforge)",
    )
    improve.add_argument(
        "--propose-patch",
        action="store_true",
        help="include an untrusted unified diff proposal (display only)",
    )
    improve.add_argument(
        "--provider",
        default=None,
        help="override model provider (default: [model].provider from .realforge.toml or mock)",
    )
    improve.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )
    improve.add_argument(
        "--max-context-chars",
        type=int,
        default=12000,
        help="maximum context size for improvement planning (default: 12000)",
    )

    propose_patch = sub.add_parser(
        "propose-patch",
        help="ask a provider for an untrusted unified diff proposal (dry-run only in 1.9)",
    )
    propose_patch.add_argument("--task", required=True, help="task description for the patch proposal")
    propose_patch.add_argument(
        "--dry-run",
        action="store_true",
        help="print and optionally save an untrusted patch proposal without modifying files (required in 1.9)",
    )
    propose_patch.add_argument(
        "--provider",
        default=None,
        help="override model provider (default: [model].provider from .realforge.toml or mock)",
    )
    propose_patch.add_argument(
        "--save",
        action="store_true",
        help="save proposal JSON and patch.diff under .realforge/patch_proposals/",
    )
    propose_patch.add_argument(
        "--experiment",
        action="store_true",
        help="save proposal and evaluate patch in an isolated experiment workspace",
    )
    propose_patch.add_argument(
        "--validation",
        choices=sorted(VALIDATION_MODES),
        default="quick",
        help="validation mode when --experiment is used (default: quick)",
    )
    propose_patch.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )
    propose_patch.add_argument(
        "--max-context-chars",
        type=int,
        default=12000,
        help="maximum context size for patch proposal planning (default: 12000)",
    )

    experiment = sub.add_parser("experiment", help="evaluate patches in isolated workspaces (0.7)")
    experiment.add_argument(
        "--dry-run",
        action="store_true",
        help="print improvement plan and validation steps without creating a workspace",
    )
    experiment.add_argument(
        "--area",
        choices=sorted(IMPROVE_AREAS),
        default="tests",
        help="focus area for planning and reporting (default: tests)",
    )
    experiment.add_argument(
        "--patch-file",
        type=Path,
        default=None,
        help="unified diff to apply only inside an isolated experiment workspace",
    )
    experiment.add_argument(
        "--validation",
        choices=sorted(VALIDATION_MODES),
        default="quick",
        help="validation preset (default: quick)",
    )
    experiment.add_argument(
        "--keep",
        action="store_true",
        help="keep experiment workspace after run",
    )
    experiment.add_argument(
        "--output",
        type=Path,
        default=None,
        help="write ExperimentReport JSON to this path",
    )
    experiment.add_argument(
        "--provider",
        default=None,
        help="override model provider for --dry-run (default: mock)",
    )
    experiment.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )
    experiment.add_argument(
        "--max-context-chars",
        type=int,
        default=12000,
        help="maximum context size for --dry-run planning (default: 12000)",
    )

    propose_merge = sub.add_parser(
        "propose-merge",
        help="create an approval-gated merge proposal from a passed experiment report",
    )
    propose_merge.add_argument(
        "--report",
        type=Path,
        required=True,
        help="path to ExperimentReport JSON from a passed experiment",
    )
    propose_merge.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    sub.add_parser("list-proposals", help="list pending merge proposals (read-only)")

    show_proposal_cmd = sub.add_parser("show-proposal", help="show a merge proposal (read-only)")
    show_proposal_cmd.add_argument("proposal_id", help="proposal identifier")

    apply_proposal_cmd = sub.add_parser(
        "apply-proposal",
        help="apply a pending merge proposal after explicit confirmation",
    )
    apply_proposal_cmd.add_argument("proposal_id", help="proposal identifier")
    apply_proposal_cmd.add_argument(
        "--confirm",
        action="store_true",
        help="required flag confirming human approval to apply the patch",
    )
    apply_proposal_cmd.add_argument(
        "--commit",
        action="store_true",
        help="commit applied changes only after post-apply validation passes",
    )
    apply_proposal_cmd.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    research = sub.add_parser("research", help="fetch allowlisted HTTPS research sources (0.9)")
    research.add_argument("--url", type=str, default=None, help="HTTPS URL to fetch")
    research.add_argument(
        "--allow-domain",
        type=str,
        default=None,
        help="required domain allowlist entry (exact domain or parent domain)",
    )
    research.add_argument("--query", type=str, default=None, help="optional research query note")
    research.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    sub.add_parser("research-list", help="list saved research snapshots (read-only)")
    research_show = sub.add_parser("research-show", help="show a saved research snapshot (read-only)")
    research_show.add_argument("research_id", help="saved research snapshot id")

    cycle = sub.add_parser("cycle", help="run a bounded recursive improvement cycle (1.0)")
    cycle.add_argument(
        "--dry-run",
        action="store_true",
        help="print improvement plan and validation steps without experiment or proposal",
    )
    cycle.add_argument(
        "--area",
        choices=sorted(IMPROVE_AREAS),
        default="tests",
        help="improvement focus area (default: tests)",
    )
    cycle.add_argument(
        "--budget",
        type=int,
        default=1,
        help="maximum cycle attempts (1-3, default: 1)",
    )
    cycle.add_argument(
        "--patch-file",
        type=Path,
        default=None,
        help="unified diff to evaluate in an isolated experiment",
    )
    cycle.add_argument(
        "--research-id",
        default=None,
        help="attach a saved research snapshot id to the cycle report/context",
    )
    cycle.add_argument(
        "--validation",
        choices=sorted(VALIDATION_MODES),
        default="quick",
        help="validation preset for patch experiments (default: quick)",
    )
    cycle.add_argument(
        "--provider",
        default=None,
        help="override model provider for planning (default: mock)",
    )
    cycle.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )
    cycle.add_argument(
        "--max-context-chars",
        type=int,
        default=12000,
        help="maximum context size for planning (default: 12000)",
    )

    sub.add_parser("cycle-list", help="list saved cycle reports (read-only)")
    cycle_show = sub.add_parser("cycle-show", help="show a saved cycle report (read-only)")
    cycle_show.add_argument("cycle_id", help="cycle report id")

    eval_cmd = sub.add_parser("eval", help="run a local provider quality evaluation harness (1.3)")
    eval_cmd.add_argument(
        "--provider",
        default=None,
        help="model provider to evaluate (default: mock)",
    )
    eval_cmd.add_argument(
        "--suite",
        choices=sorted(EVAL_SUITES),
        default="smoke",
        help="evaluation suite (default: smoke)",
    )
    eval_cmd.add_argument(
        "--write",
        action="store_true",
        help="write EvalReport JSON under .realforge/evals/",
    )
    eval_cmd.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    sub.add_parser("eval-list", help="list saved eval reports (read-only)")
    eval_show = sub.add_parser("eval-show", help="show a saved eval report (read-only)")
    eval_show.add_argument("eval_id", help="eval report id")

    bench_tasks = sub.add_parser("bench-tasks", help="run repeatable RealForge task benchmarks (1.7)")
    bench_tasks.add_argument(
        "--provider",
        default=None,
        help="model provider to benchmark (default: mock)",
    )
    bench_tasks.add_argument(
        "--suite",
        choices=sorted(BENCH_SUITES),
        default="smoke",
        help="benchmark suite (default: smoke)",
    )
    bench_tasks.add_argument(
        "--write",
        action="store_true",
        help="write benchmark report JSON under .realforge/task_benchmarks/",
    )
    bench_tasks.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    sub.add_parser("bench-task-list", help="list saved task benchmark reports (read-only)")
    bench_task_show = sub.add_parser("bench-task-show", help="show a saved task benchmark report (read-only)")
    bench_task_show.add_argument("benchmark_id", help="task benchmark report id")

    skill_bench = sub.add_parser(
        "skill-bench",
        help="run cross-domain general agent skill benchmarks (2.7)",
    )
    skill_bench.add_argument(
        "--provider",
        default=None,
        help="model provider to benchmark (default: mock)",
    )
    skill_bench.add_argument(
        "--suite",
        choices=sorted(SKILL_SUITES),
        default="smoke",
        help="skill benchmark suite (default: smoke)",
    )
    skill_bench.add_argument(
        "--write",
        action="store_true",
        help="write SkillBenchmarkReport JSON under .realforge/skill_benchmarks/",
    )
    skill_bench.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    sub.add_parser("skill-bench-list", help="list saved skill benchmark reports (read-only)")
    skill_bench_show = sub.add_parser(
        "skill-bench-show",
        help="show a saved skill benchmark report (read-only)",
    )
    skill_bench_show.add_argument("benchmark_id", help="skill benchmark report id")

    def _add_leaderboard_filters(parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "--suite",
            choices=sorted(s for s in BENCH_SUITES if s != "all"),
            default=None,
            help="filter by benchmark suite",
        )
        parser.add_argument(
            "--provider",
            default=None,
            help="filter by provider name",
        )
        parser.add_argument(
            "--realforge-version",
            default=None,
            help="filter by RealForge version recorded in reports",
        )
        parser.add_argument(
            "--latest",
            action="store_true",
            help="keep only the latest report per provider/model/suite",
        )
        parser.add_argument(
            "--trend",
            action="store_true",
            help="show score trends grouped by provider/model/suite",
        )
        parser.add_argument(
            "--config-root",
            type=Path,
            default=None,
            help="directory containing .realforge.toml (default: current directory)",
        )

    leaderboard = sub.add_parser(
        "leaderboard",
        help="rank saved task benchmark reports for local provider comparison (1.8)",
    )
    leaderboard_sub = leaderboard.add_subparsers(dest="leaderboard_command")
    _add_leaderboard_filters(leaderboard)
    leaderboard_export = leaderboard_sub.add_parser(
        "export",
        help="export leaderboard metadata JSON (read-only source reports)",
    )
    _add_leaderboard_filters(leaderboard_export)
    leaderboard_export.add_argument(
        "--output",
        type=Path,
        required=True,
        help="output JSON path (must stay inside workspace)",
    )

    creative = sub.add_parser(
        "creative",
        help="create untrusted game-design planning artifacts (2.1)",
    )
    creative_sub = creative.add_subparsers(dest="creative_command", required=True)
    for command_name, help_text in (
        ("brief", "build a structured game design brief"),
        ("map", "build a structured map or world design plan"),
        ("asset", "build a structured asset brief"),
    ):
        creative_command = creative_sub.add_parser(command_name, help=help_text)
        creative_command.add_argument("--task", required=True, help="creative planning task")
        creative_command.add_argument(
            "--provider",
            default=None,
            help="override model provider (default: configured provider or mock)",
        )
        creative_command.add_argument(
            "--write",
            action="store_true",
            help="write JSON under .realforge/creative/ (default: print only)",
        )
        creative_command.add_argument(
            "--config-root",
            type=Path,
            default=None,
            help="workspace containing .realforge.toml (default: current directory)",
        )

    creative_image = creative_sub.add_parser(
        "image",
        help="record image hash and metadata without semantic vision claims",
    )
    creative_image.add_argument("--image", type=Path, required=True, help="image inside workspace")
    creative_image.add_argument(
        "--write",
        action="store_true",
        help="write JSON under .realforge/creative/images/ (default: print only)",
    )
    creative_image.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="workspace containing .realforge.toml (default: current directory)",
    )

    engine = sub.add_parser("engine", help="scan engine projects without opening or modifying them")
    engine_sub = engine.add_subparsers(dest="engine_command", required=True)
    engine_scan = engine_sub.add_parser("scan", help="detect a local engine project (Unreal in 2.1)")
    engine_scan.add_argument("--path", type=Path, required=True, help="project path inside workspace")
    engine_scan.add_argument(
        "--write",
        action="store_true",
        help="write profile JSON under .realforge/engines/ (default: print only)",
    )
    engine_scan.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="workspace containing .realforge.toml (default: current directory)",
    )

    engine_pipeline = engine_sub.add_parser(
        "pipeline",
        help="build an untrusted dry-run engine pipeline report (2.6)",
    )
    engine_pipeline.add_argument("--path", type=Path, required=True, help="project path inside workspace")
    engine_pipeline.add_argument("--task", required=True, help="engine pipeline planning task")
    engine_pipeline.add_argument("--provider", default=None, help="model provider (default: mock)")
    engine_pipeline.add_argument(
        "--write",
        action="store_true",
        help="write JSON under .realforge/pipelines/engines/",
    )
    engine_pipeline.add_argument("--json", action="store_true", help="print machine-readable JSON")
    engine_pipeline.add_argument("--config-root", type=Path, default=None)

    unreal = sub.add_parser("unreal", help="build dry-run Unreal plans without engine mutation")
    unreal_sub = unreal.add_subparsers(dest="unreal_command", required=True)
    unreal_plan = unreal_sub.add_parser("plan", help="build an untrusted dry-run Unreal command plan")
    unreal_plan.add_argument("--path", type=Path, required=True, help="Unreal project path inside workspace")
    unreal_plan.add_argument("--task", required=True, help="requested Unreal planning task")
    unreal_plan.add_argument(
        "--provider",
        default=None,
        help="override model provider (default: configured provider or mock)",
    )
    unreal_plan.add_argument(
        "--write",
        action="store_true",
        help="write plan JSON under .realforge/engines/plans/ (default: print only)",
    )
    unreal_plan.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="workspace containing .realforge.toml (default: current directory)",
    )

    unreal_import = unreal_sub.add_parser(
        "import-plan",
        help="build an untrusted dry-run Unreal asset import plan (2.6)",
    )
    unreal_import.add_argument("--path", type=Path, required=True, help="Unreal project path inside workspace")
    unreal_import.add_argument("--task", required=True, help="asset import planning task")
    unreal_import.add_argument("--provider", default=None, help="model provider (default: mock)")
    unreal_import.add_argument(
        "--write",
        action="store_true",
        help="write JSON under .realforge/pipelines/unreal/",
    )
    unreal_import.add_argument("--json", action="store_true", help="print machine-readable JSON")
    unreal_import.add_argument("--config-root", type=Path, default=None)

    asset = sub.add_parser("asset", help="build planning-only asset production workflows (2.6)")
    asset_sub = asset.add_subparsers(dest="asset_command", required=True)
    asset_pipeline = asset_sub.add_parser("pipeline", help="build an untrusted asset pipeline plan")
    asset_pipeline.add_argument("--task", required=True, help="asset pipeline planning task")
    asset_pipeline.add_argument("--provider", default=None, help="model provider (default: mock)")
    asset_pipeline.add_argument(
        "--target-engine",
        choices=("unreal", "generic"),
        default="generic",
    )
    asset_pipeline.add_argument("--asset-brief", default=None, help="saved artifact id or workspace JSON path")
    asset_pipeline.add_argument("--image-job", default=None, help="saved artifact id or workspace JSON path")
    asset_pipeline.add_argument("--reference-board", default=None, help="saved artifact id or workspace JSON path")
    asset_pipeline.add_argument("--vision-report", default=None, help="saved artifact id or workspace JSON path")
    asset_pipeline.add_argument(
        "--write",
        action="store_true",
        help="write JSON under .realforge/pipelines/assets/",
    )
    asset_pipeline.add_argument("--json", action="store_true", help="print machine-readable JSON")
    asset_pipeline.add_argument("--config-root", type=Path, default=None)

    blender = sub.add_parser("blender", help="build planning-only Blender workflows (2.6)")
    blender_sub = blender.add_subparsers(dest="blender_command", required=True)
    blender_asset = blender_sub.add_parser("asset-plan", help="build an untrusted Blender asset plan")
    blender_asset.add_argument("--task", required=True, help="Blender asset planning task")
    blender_asset.add_argument("--provider", default=None, help="model provider (default: mock)")
    blender_asset.add_argument(
        "--write",
        action="store_true",
        help="write JSON under .realforge/pipelines/blender/",
    )
    blender_asset.add_argument("--json", action="store_true", help="print machine-readable JSON")
    blender_asset.add_argument("--config-root", type=Path, default=None)

    capabilities = sub.add_parser(
        "capabilities",
        help="list capability domains, safety levels, and next commands (2.2)",
    )
    capabilities.add_argument("--json", action="store_true", help="print machine-readable JSON")
    capabilities.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="workspace containing .realforge.toml (default: current directory)",
    )

    slash = sub.add_parser(
        "slash",
        help="show slash-command grammar for future interactive clients (2.2)",
    )
    slash.add_argument("--json", action="store_true", help="print machine-readable JSON")
    slash.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="workspace containing .realforge.toml (default: current directory)",
    )

    settings = sub.add_parser("settings", help="show effective read-only RealForge settings (2.2)")
    settings.add_argument("--json", action="store_true", help="print machine-readable JSON")
    settings.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="workspace containing .realforge.toml (default: current directory)",
    )
    settings_sub = settings.add_subparsers(dest="settings_command")
    settings_doctor = settings_sub.add_parser("doctor", help="validate settings safety and boundaries")
    settings_doctor.add_argument(
        "--json",
        action="store_true",
        default=argparse.SUPPRESS,
        help="print machine-readable JSON",
    )
    settings_doctor.add_argument(
        "--config-root",
        type=Path,
        default=argparse.SUPPRESS,
        help="workspace containing .realforge.toml (default: current directory)",
    )

    multimodal = sub.add_parser(
        "multimodal",
        help="inspect optional multimodal provider capabilities (2.3)",
    )
    multimodal_sub = multimodal.add_subparsers(dest="multimodal_command", required=True)
    multimodal_capabilities = multimodal_sub.add_parser(
        "capabilities",
        help="show provider text/vision/image/embedding support without calling a model",
    )
    multimodal_capabilities.add_argument(
        "--provider",
        default=None,
        help="multimodal provider (default: configured provider or mock)",
    )
    multimodal_capabilities.add_argument(
        "--json",
        action="store_true",
        help="print machine-readable JSON",
    )
    multimodal_capabilities.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="workspace containing .realforge.toml (default: current directory)",
    )

    vision = sub.add_parser("vision", help="run untrusted provider-backed vision reports (2.5)")
    vision_sub = vision.add_subparsers(dest="vision_command", required=True)
    vision_analyze = vision_sub.add_parser("analyze", help="analyze one workspace-bounded image")
    vision_analyze.add_argument("--image", type=Path, required=True, help="image inside workspace")
    vision_analyze.add_argument("--task", required=True, help="vision analysis task")
    vision_analyze.add_argument("--context", default=None, help="optional bounded context note")
    vision_analyze.add_argument("--provider", default=None, help="multimodal provider (default: mock)")
    vision_analyze.add_argument("--write", action="store_true", help="write report JSON under .realforge/multimodal/vision/")
    vision_analyze.add_argument("--json", action="store_true", help="print machine-readable JSON")
    vision_analyze.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="workspace containing .realforge.toml (default: current directory)",
    )

    vision_understand = vision_sub.add_parser(
        "understand",
        help="build a rich untrusted image-understanding report",
    )
    vision_understand.add_argument(
        "--image",
        type=Path,
        required=True,
        help="image inside workspace",
    )
    vision_understand.add_argument("--task", required=True, help="image-understanding task")
    vision_understand.add_argument(
        "--provider",
        default=None,
        help="multimodal provider (default: mock)",
    )
    vision_understand.add_argument(
        "--write",
        action="store_true",
        help="write JSON under .realforge/multimodal/vision_understanding/",
    )
    vision_understand.add_argument("--json", action="store_true", help="print machine-readable JSON")
    vision_understand.add_argument("--config-root", type=Path, default=None)

    vision_compare = vision_sub.add_parser(
        "compare",
        help="compare two or more bounded images through an untrusted provider",
    )
    vision_compare.add_argument(
        "--image",
        type=Path,
        action="append",
        required=True,
        help="image inside workspace; repeat at least twice",
    )
    vision_compare.add_argument("--task", required=True, help="image-comparison task")
    vision_compare.add_argument(
        "--provider",
        default=None,
        help="multimodal provider (default: mock)",
    )
    vision_compare.add_argument(
        "--write",
        action="store_true",
        help="write JSON under .realforge/multimodal/vision_comparisons/",
    )
    vision_compare.add_argument("--json", action="store_true", help="print machine-readable JSON")
    vision_compare.add_argument("--config-root", type=Path, default=None)

    vision_asset_brief = vision_sub.add_parser(
        "asset-brief",
        help="build an untrusted AssetBrief-style plan from one image",
    )
    vision_asset_brief.add_argument(
        "--image",
        type=Path,
        required=True,
        help="image inside workspace",
    )
    vision_asset_brief.add_argument("--task", required=True, help="asset-brief planning task")
    vision_asset_brief.add_argument(
        "--provider",
        default=None,
        help="multimodal provider (default: mock)",
    )
    vision_asset_brief.add_argument(
        "--write",
        action="store_true",
        help="write JSON under .realforge/multimodal/vision_asset_briefs/",
    )
    vision_asset_brief.add_argument("--json", action="store_true", help="print machine-readable JSON")
    vision_asset_brief.add_argument("--config-root", type=Path, default=None)

    image = sub.add_parser("image", help="build image-generation workflow artifacts (2.4)")
    image_sub = image.add_subparsers(dest="image_command", required=True)
    image_prompt = image_sub.add_parser("prompt", help="build an untrusted prompt specification only")
    image_prompt.add_argument("--task", required=True, help="image prompt task")
    image_prompt.add_argument("--brief", default=None, help="optional brief text")
    image_prompt.add_argument(
        "--style-note",
        action="append",
        default=[],
        help="optional style note; may be repeated",
    )
    image_prompt.add_argument("--target-use-case", default=None, help="optional intended use case")
    image_prompt.add_argument("--provider", default=None, help="multimodal provider (default: mock)")
    image_prompt.add_argument(
        "--write",
        action="store_true",
        help="write JSON under .realforge/multimodal/image_prompts/",
    )
    image_prompt.add_argument("--json", action="store_true", help="print machine-readable JSON")
    image_prompt.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="workspace containing .realforge.toml (default: current directory)",
    )

    image_job = image_sub.add_parser("job", help="build an untrusted image generation job")
    image_job.add_argument("--task", required=True, help="image workflow task")
    image_job.add_argument("--provider", default=None, help="multimodal provider (default: mock)")
    image_job.add_argument("--intended-use", default="concept exploration")
    image_job.add_argument("--target-style", default="purpose-driven concept art")
    image_job.add_argument("--aspect-ratio", default="1:1")
    image_job.add_argument("--output-count", type=int, default=4)
    image_job.add_argument(
        "--reference-image",
        type=Path,
        action="append",
        default=[],
        help="optional workspace-bounded reference image; may be repeated",
    )
    image_job.add_argument(
        "--write",
        action="store_true",
        help="write JSON under .realforge/multimodal/image_jobs/",
    )
    image_job.add_argument("--json", action="store_true", help="print machine-readable JSON")
    image_job.add_argument("--config-root", type=Path, default=None)

    prompt_pack = image_sub.add_parser(
        "prompt-pack",
        help="build an untrusted prompt pack with deterministic variants",
    )
    prompt_pack.add_argument("--task", required=True, help="image prompt-pack task")
    prompt_pack.add_argument("--provider", default=None, help="multimodal provider (default: mock)")
    prompt_pack.add_argument("--intended-use", default="concept exploration")
    prompt_pack.add_argument("--target-style", default="purpose-driven concept art")
    prompt_pack.add_argument("--aspect-ratio", default="1:1")
    prompt_pack.add_argument(
        "--write",
        action="store_true",
        help="write JSON under .realforge/multimodal/prompt_packs/",
    )
    prompt_pack.add_argument("--json", action="store_true", help="print machine-readable JSON")
    prompt_pack.add_argument("--config-root", type=Path, default=None)

    image_iterate = image_sub.add_parser(
        "iterate",
        help="load a saved image job and emit a separate iteration plan",
    )
    image_iterate.add_argument("--job", required=True, help="saved 12-character image job id")
    image_iterate.add_argument(
        "--write",
        action="store_true",
        help="write a separate JSON report under .realforge/multimodal/iterations/",
    )
    image_iterate.add_argument("--json", action="store_true", help="print machine-readable JSON")
    image_iterate.add_argument("--config-root", type=Path, default=None)

    image_references = image_sub.add_parser(
        "references",
        help="hash workspace-bounded images into a metadata-only reference board",
    )
    image_references.add_argument("--task", required=True, help="reference board task")
    image_references.add_argument(
        "--image",
        type=Path,
        action="append",
        required=True,
        help="workspace-bounded image; may be repeated",
    )
    image_references.add_argument(
        "--write",
        action="store_true",
        help="write JSON under .realforge/multimodal/reference_boards/",
    )
    image_references.add_argument("--json", action="store_true", help="print machine-readable JSON")
    image_references.add_argument("--config-root", type=Path, default=None)

    sub.add_parser("staff-status", help="show staff mode and improvement channel settings (read-only)")

    sub.add_parser(
        "scheduler-status",
        help="show staff scheduler configuration and latest run (staff-only; read-only)",
    )
    scheduler_run = sub.add_parser(
        "scheduler-run",
        help="run bounded staff scheduler jobs (2.0; staff-only)",
    )
    scheduler_run.add_argument(
        "--dry-run",
        action="store_true",
        help="print planned scheduler actions without creating proposals or bundles",
    )
    scheduler_run.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )
    sub.add_parser("scheduler-list", help="list scheduler run reports (staff-only; read-only)")
    scheduler_show = sub.add_parser("scheduler-show", help="show a scheduler run report (staff-only; read-only)")
    scheduler_show.add_argument("run_id", help="scheduler run id")

    staff_update_check = sub.add_parser(
        "update-check",
        help="staff-only read-only check for local improvement opportunities (1.4)",
    )
    staff_update_check.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    improve_channel = sub.add_parser(
        "improve-channel",
        help="staff-only configured improvement/update flow (1.4)",
    )
    improve_channel.add_argument(
        "--area",
        choices=sorted(IMPROVE_AREAS),
        required=True,
        help="improvement focus area",
    )
    improve_channel.add_argument(
        "--dry-run",
        action="store_true",
        help="build plan and optional provider eval without creating experiments",
    )
    improve_channel.add_argument(
        "--patch-file",
        type=Path,
        default=None,
        help="unified diff to evaluate in a controlled cycle",
    )
    improve_channel.add_argument(
        "--budget",
        type=int,
        default=1,
        help="maximum cycle attempts (default: 1; capped by [improvement].max_budget)",
    )
    improve_channel.add_argument(
        "--research-id",
        default=None,
        help="optional saved research snapshot id (requires [improvement].allow_research)",
    )
    improve_channel.add_argument(
        "--validation",
        choices=sorted(VALIDATION_MODES),
        default="quick",
        help="validation mode for patch experiments (default: quick)",
    )
    improve_channel.add_argument(
        "--provider",
        default=None,
        help="override model provider (default: [model].provider from .realforge.toml or mock)",
    )
    improve_channel.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )
    improve_channel.add_argument(
        "--max-context-chars",
        type=int,
        default=12000,
        help="maximum context size for improvement planning (default: 12000)",
    )

    staff_update_history = sub.add_parser(
        "update-history",
        help="staff-only timeline of cycles, proposals, and evals (read-only)",
    )
    staff_update_history.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    update_bundle = sub.add_parser(
        "update-bundle",
        help="staff-only update bundle packaging for validated proposals (1.5)",
    )
    update_bundle_sub = update_bundle.add_subparsers(dest="update_bundle_command", required=True)

    update_bundle_create = update_bundle_sub.add_parser(
        "create",
        help="package a pending proposal as a versioned update candidate",
    )
    update_bundle_create.add_argument(
        "--proposal",
        required=True,
        help="pending merge proposal id",
    )
    update_bundle_create.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    update_bundle_list = update_bundle_sub.add_parser("list", help="list update bundles")
    update_bundle_list.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    update_bundle_show = update_bundle_sub.add_parser("show", help="show update bundle metadata")
    update_bundle_show.add_argument("bundle_id", help="update bundle id")
    update_bundle_show.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    update_bundle_verify = update_bundle_sub.add_parser(
        "verify",
        help="verify bundle integrity against source proposal metadata (read-only)",
    )
    update_bundle_verify.add_argument("bundle_id", help="update bundle id")
    update_bundle_verify.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    update_bundle_mark = update_bundle_sub.add_parser("mark", help="update bundle status metadata only")
    update_bundle_mark.add_argument("bundle_id", help="update bundle id")
    update_bundle_mark.add_argument(
        "--status",
        choices=sorted(MARKABLE_BUNDLE_STATUSES),
        required=True,
        help="new bundle status (metadata only)",
    )
    update_bundle_mark.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    update_bundle_export = update_bundle_sub.add_parser(
        "export",
        help="export update bundle metadata to JSON",
    )
    update_bundle_export.add_argument("bundle_id", help="update bundle id")
    update_bundle_export.add_argument(
        "--output",
        type=Path,
        required=True,
        help="destination JSON path inside workspace",
    )
    update_bundle_export.add_argument(
        "--include-patch",
        action="store_true",
        help="include stored proposal patch text (default: metadata only)",
    )
    update_bundle_export.add_argument(
        "--config-root",
        type=Path,
        default=None,
        help="directory containing .realforge.toml (default: current directory)",
    )

    args = parser.parse_args(argv)

    if args.command == "provider":
        if args.provider_command == "status":
            report = build_provider_status_report(args.config_root)
            print(format_provider_status_json(report) if args.json else format_provider_status(report))
            return 0 if report.ok else 1
        if args.provider_command == "smoke":
            report = run_private_provider_smoke()
            print(format_provider_smoke_json(report) if args.json else format_provider_smoke(report))
            return 0 if report.ok else 1
        if args.provider_command == "chat-sandbox":
            prompt = sys.stdin.read(CHAT_SANDBOX_MAX_PROMPT_CHARS + 1)
            report = run_private_provider_chat_sandbox(prompt)
            print(
                format_provider_chat_sandbox_json(report)
                if args.json
                else format_provider_chat_sandbox(report)
            )
            return 0 if report.ok else 1
        return 1

    if args.command in {
        "check",
        "repair",
        "doctor",
        "index",
        "symbols",
        "context",
        "list-proposals",
        "show-proposal",
        "research-list",
        "research-show",
        "cycle-list",
        "cycle-show",
        "eval-list",
        "eval-show",
        "bench-task-list",
        "bench-task-show",
        "skill-bench-list",
        "skill-bench-show",
        "leaderboard",
        "scheduler-status",
        "scheduler-list",
        "scheduler-show",
        "staff-status",
    }:
        config = load_config()
    elif args.command in {
        "propose-merge",
        "apply-proposal",
        "research",
        "cycle",
        "eval",
        "bench-tasks",
        "skill-bench",
        "propose-patch",
        "scheduler-run",
        "update-check",
        "improve-channel",
        "update-history",
        "update-bundle",
    }:
        config = _load_cli_config(args)
    else:
        config = _load_cli_config(args)

    if args.command == "capabilities":
        registry = build_capability_registry(config)
        print(format_capabilities_json(registry) if args.json else format_capabilities(registry))
        return 0

    if args.command == "slash":
        registry = build_slash_registry(staff_mode_enabled=config.staff.enabled)
        print(format_slash_json(registry) if args.json else format_slash_commands(registry))
        return 0

    if args.command == "settings":
        if args.settings_command == "doctor":
            report = run_settings_doctor(config)
            print(format_settings_doctor_json(report) if args.json else format_settings_doctor(report))
            return 0 if report.ok else 1
        settings_report = build_effective_settings(config)
        print(format_settings_json(settings_report) if args.json else format_settings(settings_report))
        return 0

    if args.command == "multimodal":
        provider = _resolve_cli_multimodal_provider(args, config)
        capabilities = provider.capabilities()
        print(
            format_multimodal_capabilities_json(capabilities)
            if args.json
            else format_multimodal_capabilities(capabilities)
        )
        return 0

    if args.command == "vision":
        workspace_root = config.workspace_root or Path.cwd()
        provider = _resolve_cli_multimodal_provider(args, config)
        try:
            if args.vision_command == "analyze":
                report = analyze_image(
                    args.image,
                    args.task,
                    provider,
                    workspace_root=workspace_root,
                    context=args.context,
                )
                category = "vision"
                formatted = format_vision_analysis(report)
            elif args.vision_command == "understand":
                report = understand_image(
                    args.image,
                    args.task,
                    provider,
                    workspace_root=workspace_root,
                )
                category = "vision_understanding"
                formatted = format_image_understanding(report)
            elif args.vision_command == "compare":
                report = compare_images(
                    tuple(args.image),
                    args.task,
                    provider,
                    workspace_root=workspace_root,
                )
                category = "vision_comparisons"
                formatted = format_image_comparison(report)
            else:
                report = image_to_asset_brief(
                    args.image,
                    args.task,
                    provider,
                    workspace_root=workspace_root,
                )
                category = "vision_asset_briefs"
                formatted = format_image_asset_brief(report)
            written = (
                write_multimodal_report(report, workspace_root, category=category)
                if args.write
                else None
            )
        except (ImageInputError, MultimodalProviderError, ValueError, WorkspaceError) as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(format_report_json(report) if args.json else formatted)
        if written is not None:
            print(f"written: {written}", file=sys.stderr if args.json else sys.stdout)
        return 0

    if args.command == "image":
        workspace_root = config.workspace_root or Path.cwd()
        try:
            if args.image_command == "prompt":
                provider = _resolve_cli_multimodal_provider(args, config)
                report = build_image_prompt_spec(
                    args.task,
                    provider,
                    brief=args.brief,
                    style_notes=tuple(args.style_note),
                    target_use_case=args.target_use_case,
                )
                category = "image_prompts"
                formatted = format_image_prompt_spec(report)
            elif args.image_command == "job":
                provider = _resolve_cli_multimodal_provider(args, config)
                report = build_image_generation_job(
                    args.task,
                    provider,
                    workspace_root=workspace_root,
                    intended_use=args.intended_use,
                    target_style=args.target_style,
                    aspect_ratio=args.aspect_ratio,
                    output_count=args.output_count,
                    reference_image_paths=tuple(args.reference_image),
                )
                category = "image_jobs"
                formatted = format_image_job(report)
            elif args.image_command == "prompt-pack":
                provider = _resolve_cli_multimodal_provider(args, config)
                report = build_prompt_pack(
                    args.task,
                    provider,
                    intended_use=args.intended_use,
                    target_style=args.target_style,
                    aspect_ratio=args.aspect_ratio,
                )
                category = "prompt_packs"
                formatted = format_prompt_pack(report)
            elif args.image_command == "iterate":
                report = load_image_iteration_plan(args.job, workspace_root=workspace_root)
                category = "iterations"
                formatted = format_iteration_report(report)
            else:
                report = build_reference_board(
                    args.task,
                    tuple(args.image),
                    workspace_root=workspace_root,
                )
                category = "reference_boards"
                formatted = format_reference_board(report)
            written = (
                write_multimodal_report(report, workspace_root, category=category)
                if args.write
                else None
            )
        except (
            ImageInputError,
            ImageWorkflowError,
            MultimodalProviderError,
            ValueError,
            WorkspaceError,
        ) as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(format_report_json(report) if args.json else formatted)
        if written is not None:
            print(f"written: {written}", file=sys.stderr if args.json else sys.stdout)
        return 0

    if args.command == "creative":
        workspace_root = config.workspace_root or Path.cwd()
        try:
            if args.creative_command == "image":
                artifact = build_image_analysis_report(
                    args.image,
                    workspace_root=workspace_root,
                )
                written = (
                    write_creative_artifact(artifact, workspace_root, "images")
                    if args.write
                    else None
                )
            else:
                provider = _resolve_cli_provider(args, config)
                if args.creative_command == "brief":
                    artifact = build_game_design_brief(args.task, provider)
                    category = "briefs"
                elif args.creative_command == "map":
                    artifact = build_map_design_plan(args.task, provider)
                    category = "maps"
                else:
                    artifact = build_asset_brief(args.task, provider)
                    category = "assets"
                written = (
                    write_creative_artifact(artifact, workspace_root, category)
                    if args.write
                    else None
                )
        except (CreativeError, WorkspaceError, FileNotFoundError, RuntimeError, ValueError) as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(format_artifact(artifact))
        if written is not None:
            print(f"written: {written}")
        return 0

    if args.command == "asset":
        workspace_root = config.workspace_root or Path.cwd()
        provider = _resolve_cli_provider(args, config)
        try:
            report = build_asset_pipeline_plan(
                args.task,
                provider,
                workspace_root=workspace_root,
                target_engine=args.target_engine,
                asset_brief=args.asset_brief,
                image_job=args.image_job,
                reference_board=args.reference_board,
                vision_report=args.vision_report,
            )
            written = (
                write_pipeline_report(report, workspace_root, category="assets")
                if args.write
                else None
            )
        except (PipelineError, WorkspaceError, FileNotFoundError, RuntimeError, ValueError) as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(format_pipeline_json(report) if args.json else format_asset_pipeline_plan(report))
        if written is not None:
            print(f"written: {written}", file=sys.stderr if args.json else sys.stdout)
        return 0

    if args.command == "blender":
        workspace_root = config.workspace_root or Path.cwd()
        provider = _resolve_cli_provider(args, config)
        try:
            report = build_blender_asset_plan(args.task, provider)
            written = (
                write_pipeline_report(report, workspace_root, category="blender")
                if args.write
                else None
            )
        except (PipelineError, WorkspaceError, FileNotFoundError, RuntimeError, ValueError) as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(format_pipeline_json(report) if args.json else format_blender_asset_plan(report))
        if written is not None:
            print(f"written: {written}", file=sys.stderr if args.json else sys.stdout)
        return 0

    if args.command == "engine":
        workspace_root = config.workspace_root or Path.cwd()
        try:
            if args.engine_command == "scan":
                profile = scan_engine_project(args.path, workspace_root=workspace_root)
                written = write_engine_artifact(profile, workspace_root) if args.write else None
                output = format_artifact(profile)
            else:
                provider = _resolve_cli_provider(args, config)
                report = build_engine_pipeline_report(
                    args.path,
                    args.task,
                    provider,
                    workspace_root=workspace_root,
                )
                written = (
                    write_pipeline_report(report, workspace_root, category="engines")
                    if args.write
                    else None
                )
                output = format_pipeline_json(report) if args.json else format_engine_pipeline_report(report)
        except (
            CreativeError,
            PipelineError,
            WorkspaceError,
            FileNotFoundError,
            RuntimeError,
            ValueError,
        ) as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(output)
        if written is not None:
            print(
                f"written: {written}",
                file=sys.stderr if args.engine_command == "pipeline" and args.json else sys.stdout,
            )
        return 0

    if args.command == "unreal":
        workspace_root = config.workspace_root or Path.cwd()
        provider = _resolve_cli_provider(args, config)
        try:
            if args.unreal_command == "plan":
                plan = build_unreal_command_plan(
                    args.path,
                    args.task,
                    provider,
                    workspace_root=workspace_root,
                )
                output = format_artifact(plan)
                category = None
            else:
                plan = build_unreal_import_plan(
                    args.path,
                    args.task,
                    provider,
                    workspace_root=workspace_root,
                )
                output = format_pipeline_json(plan) if args.json else format_unreal_import_plan(plan)
                category = "unreal"
            written = (
                (
                    write_engine_artifact(plan, workspace_root, category="plans")
                    if category is None
                    else write_pipeline_report(plan, workspace_root, category=category)
                )
                if args.write
                else None
            )
        except (
            CreativeError,
            PipelineError,
            WorkspaceError,
            FileNotFoundError,
            RuntimeError,
            ValueError,
        ) as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(output)
        if written is not None:
            print(
                f"written: {written}",
                file=sys.stderr if args.unreal_command == "import-plan" and args.json else sys.stdout,
            )
        return 0

    if args.command == "check":
        if not args.file.is_file():
            print(f"error: file not found: {args.file}", file=sys.stderr)
            return 1
        outcome = check_file(args.file, config)
        if outcome.ok:
            print(format_check_pass(args.file))
            if outcome.stdout.strip():
                print(outcome.stdout.strip())
            return 0
        print(format_check_fail(args.file, outcome.diagnostics), file=sys.stderr)
        return 1

    if args.command == "repair":
        if not args.file.is_file():
            print(f"error: file not found: {args.file}", file=sys.stderr)
            return 1
        apply_mode = Permissions(
            mode=PermissionMode.WORKSPACE_WRITE,
            workspace_root=config.workspace_root,
        )
        outcome = repair_file(
            args.file,
            dry_run=args.dry_run,
            config=config,
            permissions=apply_mode if args.apply else None,
            keep_failed_repair=args.keep_failed_repair,
        )
        stream = sys.stdout if outcome.ok or args.dry_run else sys.stderr
        print(outcome.message, file=stream)
        return 0 if outcome.ok else 1

    if args.command in {"ask", "plan"}:
        provider = _resolve_cli_provider(args, config)
        perms = _permissions_from_args(args, config)
        try:
            outcome = run_agent(
                task=args.task,
                provider=provider,
                mode=AgentMode.PLAN_ONLY,
                config=config,
                permissions=perms,
                include_context=args.include_context,
                include_research=getattr(args, "include_research", None),
                max_context_chars=args.max_context_chars,
                brief=args.command == "ask",
            )
        except ProviderPlanError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        except FileNotFoundError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(outcome.message)
        return 0

    if args.command == "generate":
        provider = _resolve_cli_provider(args, config)
        dry_run = not args.apply
        if args.apply and args.output is None:
            print("error: generate --apply requires --output <file.real>", file=sys.stderr)
            return 1
        apply_mode = Permissions(
            mode=PermissionMode.WORKSPACE_WRITE,
            workspace_root=config.workspace_root,
        )
        try:
            outcome = run_generate(
                args.task,
                provider,
                dry_run=dry_run,
                output=args.output,
                config=config,
                permissions=apply_mode if args.apply else None,
            )
        except (PermissionError, ValueError) as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(outcome.message)
        return 0

    if args.command == "doctor":
        report = run_doctor(config)
        print(format_doctor_report(report))
        return 0 if report.ok else 1

    if args.command == "index":
        index = scan_workspace(config.workspace_root or Path.cwd())
        print(format_index_report(index))
        if args.write:
            apply_mode = Permissions(
                mode=PermissionMode.WORKSPACE_WRITE,
                workspace_root=config.workspace_root,
            )
            cache_path = write_index_cache(index, permissions=apply_mode)
            print(f"\ncache written: {cache_path}")
        return 0

    if args.command == "symbols":
        index = scan_workspace(config.workspace_root or Path.cwd())
        symbols = scan_workspace_symbols(index.real_files)
        print(format_symbol_table(symbols, workspace_root=index.workspace_root))
        return 0

    if args.command == "context":
        bundle = build_context(
            args.task,
            config.workspace_root or Path.cwd(),
            max_chars=args.max_chars,
        )
        print(bundle.text)
        return 0

    if args.command == "improve":
        if not args.dry_run:
            print("error: improve requires --dry-run in RealForge 0.6 (plan-only mode)", file=sys.stderr)
            return 1
        provider = _resolve_cli_provider(args, config)
        try:
            outcome = run_improve(
                area=args.area,
                provider=provider,
                workspace_root=config.workspace_root or Path.cwd(),
                propose_patch=args.propose_patch,
                max_context_chars=args.max_context_chars,
            )
        except ProviderPlanError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(outcome.message)
        return 0

    if args.command == "experiment":
        workspace_root = config.workspace_root or Path.cwd()
        if args.dry_run and args.patch_file is not None:
            print("error: experiment --dry-run cannot be combined with --patch-file", file=sys.stderr)
            return 1
        if args.dry_run:
            provider = _resolve_cli_provider(args, config)
            try:
                outcome = run_experiment_dry_run(
                    area=args.area,
                    provider=provider,
                    workspace_root=workspace_root,
                    validation_mode=args.validation,
                    max_context_chars=args.max_context_chars,
                )
            except ProviderPlanError as err:
                print(f"error: {err}", file=sys.stderr)
                return 1
            print(outcome.message)
            return 0
        if args.patch_file is None:
            print("error: experiment requires --dry-run or --patch-file", file=sys.stderr)
            return 1
        if not args.patch_file.is_file():
            print(f"error: patch file not found: {args.patch_file}", file=sys.stderr)
            return 1
        try:
            report = run_experiment_patch(
                area=args.area,
                patch_file=args.patch_file,
                workspace_root=workspace_root,
                config=config,
                validation_mode=args.validation,
                keep=args.keep,
                output_json=args.output,
            )
        except (ValueError, FileNotFoundError, RuntimeError) as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(format_patch_outcome(report))
        return 0 if report.passed else 1

    if args.command == "propose-merge":
        if not args.report.is_file():
            print(f"error: report not found: {args.report}", file=sys.stderr)
            return 1
        try:
            proposal = propose_merge_from_report(
                args.report,
                workspace_root=config.workspace_root or Path.cwd(),
                config=config,
            )
        except ProposalError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(format_propose_merge_outcome(proposal))
        return 0

    if args.command == "list-proposals":
        proposals = list_proposals(config.workspace_root or Path.cwd())
        print(format_list_proposals(proposals))
        return 0

    if args.command == "show-proposal":
        try:
            proposal = show_proposal(config.workspace_root or Path.cwd(), args.proposal_id)
        except ProposalError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(format_proposal_summary(proposal))
        return 0

    if args.command == "apply-proposal":
        try:
            print(format_apply_warning(args.proposal_id))
            outcome = apply_proposal(
                args.proposal_id,
                workspace_root=config.workspace_root or Path.cwd(),
                config=config,
                confirm=args.confirm,
                commit=args.commit,
            )
        except ProposalError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(outcome.message)
        return 0 if outcome.ok else 1

    if args.command == "cycle":
        workspace_root = config.workspace_root or Path.cwd()
        research_ids = (args.research_id,) if args.research_id else ()
        if args.dry_run and args.patch_file is not None:
            print("error: cycle --dry-run cannot be combined with --patch-file", file=sys.stderr)
            return 1
        try:
            if args.dry_run:
                provider = _resolve_cli_provider(args, config)
                outcome = run_cycle_dry_run(
                    area=args.area,
                    workspace_root=workspace_root,
                    provider=provider,
                    config=config,
                    budget=args.budget,
                    research_ids=research_ids,
                    validation_mode=args.validation,
                    max_context_chars=args.max_context_chars,
                )
            else:
                if args.patch_file is None:
                    print("error: cycle requires --dry-run or --patch-file", file=sys.stderr)
                    return 1
                if not args.patch_file.is_file():
                    print(f"error: patch file not found: {args.patch_file}", file=sys.stderr)
                    return 1
                outcome = run_cycle_patch(
                    area=args.area,
                    patch_file=args.patch_file,
                    workspace_root=workspace_root,
                    config=config,
                    budget=args.budget,
                    research_ids=research_ids,
                    validation_mode=args.validation,
                )
        except (CycleError, ProviderPlanError, FileNotFoundError) as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(outcome.message)
        return 0 if outcome.ok else 1

    if args.command == "cycle-list":
        print(list_cycles(config.workspace_root or Path.cwd()))
        return 0

    if args.command == "cycle-show":
        try:
            print(show_cycle(config.workspace_root or Path.cwd(), args.cycle_id))
        except FileNotFoundError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        return 0

    if args.command == "eval":
        workspace_root = config.workspace_root or Path.cwd()
        provider = _resolve_cli_provider(args, config)
        try:
            outcome = run_eval(
                provider=provider,
                suite=args.suite,
                workspace_root=workspace_root,
                config=config,
                write=args.write,
            )
        except EvalError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(outcome.message)
        return 0 if outcome.ok else 1

    if args.command == "eval-list":
        print(list_evals(config.workspace_root or Path.cwd()))
        return 0

    if args.command == "eval-show":
        try:
            print(show_eval(config.workspace_root or Path.cwd(), args.eval_id))
        except FileNotFoundError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        return 0

    if args.command == "bench-tasks":
        workspace_root = config.workspace_root or Path.cwd()
        provider = _resolve_cli_provider(args, config)
        try:
            outcome = run_bench_tasks(
                provider=provider,
                suite=args.suite,
                workspace_root=workspace_root,
                config=config,
                write=args.write,
            )
        except BenchError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(outcome.message)
        return 0 if outcome.ok else 1

    if args.command == "bench-task-list":
        print(list_bench_tasks(config.workspace_root or Path.cwd()))
        return 0

    if args.command == "bench-task-show":
        try:
            print(show_bench_task(config.workspace_root or Path.cwd(), args.benchmark_id))
        except FileNotFoundError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        return 0

    if args.command == "skill-bench":
        workspace_root = config.workspace_root or Path.cwd()
        provider = _resolve_cli_provider(args, config)
        multimodal_provider = _resolve_cli_multimodal_provider(args, config)
        try:
            outcome = run_skill_bench(
                provider=provider,
                multimodal_provider=multimodal_provider,
                suite=args.suite,
                workspace_root=workspace_root,
                config=config,
                write=args.write,
            )
        except SkillBenchError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(outcome.message)
        return 0 if outcome.ok else 1

    if args.command == "skill-bench-list":
        print(list_skill_bench(config.workspace_root or Path.cwd()))
        return 0

    if args.command == "skill-bench-show":
        try:
            print(show_skill_bench(config.workspace_root or Path.cwd(), args.benchmark_id))
        except FileNotFoundError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        return 0

    if args.command == "leaderboard":
        workspace_root = config.workspace_root or Path.cwd()
        if args.leaderboard_command == "export":
            outcome = export_leaderboard(
                workspace_root,
                args.output,
                suite=args.suite,
                provider=args.provider,
                realforge_version=args.realforge_version,
                latest_only=args.latest,
                trend=args.trend,
            )
        else:
            outcome = run_leaderboard(
                workspace_root,
                suite=args.suite,
                provider=args.provider,
                realforge_version=args.realforge_version,
                latest_only=args.latest,
                trend=args.trend,
            )
        for warning in outcome.warnings:
            print(f"warning: {warning}", file=sys.stderr)
        print(outcome.message)
        return 0

    if args.command == "propose-patch":
        if not args.dry_run:
            print("error: propose-patch requires --dry-run in RealForge 1.9", file=sys.stderr)
            return 1
        workspace_root = config.workspace_root or Path.cwd()
        provider = _resolve_cli_provider(args, config)
        try:
            outcome = run_propose_patch(
                task=args.task,
                provider=provider,
                workspace_root=workspace_root,
                config=config,
                max_context_chars=args.max_context_chars,
                save=args.save,
                run_experiment=args.experiment,
                validation_mode=args.validation,
            )
        except ProviderPlanError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        except PatchProposalError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(outcome.message)
        return 0 if outcome.ok else 1

    if args.command == "scheduler-status":
        try:
            print(format_scheduler_status(config))
        except StaffError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        return 0

    if args.command == "scheduler-run":
        workspace_root = config.workspace_root or Path.cwd()
        try:
            outcome = run_scheduler(
                workspace_root=workspace_root,
                config=config,
                dry_run=args.dry_run,
            )
        except StaffError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        except SchedulerError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(outcome.message)
        return 0 if outcome.ok else 1

    if args.command == "scheduler-list":
        try:
            print(list_scheduler(config.workspace_root or Path.cwd(), config=config))
        except StaffError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        return 0

    if args.command == "scheduler-show":
        try:
            print(show_scheduler_run(config.workspace_root or Path.cwd(), args.run_id, config=config))
        except StaffError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        except FileNotFoundError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        return 0

    if args.command == "staff-status":
        print(format_staff_status(config))
        return 0

    if args.command == "update-check":
        try:
            outcome = run_update_check(
                workspace_root=config.workspace_root or Path.cwd(),
                config=config,
            )
        except StaffError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(outcome.message)
        return 0

    if args.command == "improve-channel":
        workspace_root = config.workspace_root or Path.cwd()
        research_ids = (args.research_id,) if args.research_id else ()
        if args.dry_run and args.patch_file is not None:
            print("error: improve-channel --dry-run cannot be combined with --patch-file", file=sys.stderr)
            return 1
        provider = _resolve_cli_provider(args, config)
        try:
            if args.dry_run:
                outcome = run_improve_channel_dry_run(
                    area=args.area,
                    workspace_root=workspace_root,
                    config=config,
                    provider=provider,
                    budget=args.budget,
                    research_ids=research_ids,
                    max_context_chars=args.max_context_chars,
                )
            else:
                if args.patch_file is None:
                    print("error: improve-channel requires --dry-run or --patch-file", file=sys.stderr)
                    return 1
                if not args.patch_file.is_file():
                    print(f"error: patch file not found: {args.patch_file}", file=sys.stderr)
                    return 1
                outcome = run_improve_channel_patch(
                    area=args.area,
                    patch_file=args.patch_file,
                    workspace_root=workspace_root,
                    config=config,
                    provider=provider,
                    budget=args.budget,
                    research_ids=research_ids,
                    validation_mode=args.validation,
                )
        except (StaffError, UpdateChannelError, ProviderPlanError) as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(outcome.message)
        return 0 if outcome.ok else 1

    if args.command == "update-history":
        try:
            require_staff_enabled(config)
            print(list_update_history(config.workspace_root or Path.cwd()))
        except StaffError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        return 0

    if args.command == "update-bundle":
        workspace_root = config.workspace_root or Path.cwd()
        try:
            if args.update_bundle_command == "create":
                outcome = create_update_bundle(
                    proposal_id=args.proposal,
                    workspace_root=workspace_root,
                    config=config,
                )
                print(outcome.message)
                return 0 if outcome.ok else 1
            if args.update_bundle_command == "list":
                print(list_update_bundle_records(workspace_root=workspace_root, config=config))
                return 0
            if args.update_bundle_command == "show":
                print(
                    show_update_bundle_record(
                        bundle_id=args.bundle_id,
                        workspace_root=workspace_root,
                        config=config,
                    )
                )
                return 0
            if args.update_bundle_command == "verify":
                outcome = verify_update_bundle(
                    bundle_id=args.bundle_id,
                    workspace_root=workspace_root,
                    config=config,
                )
                print(outcome.message)
                return 0 if outcome.ok else 1
            if args.update_bundle_command == "mark":
                outcome = mark_update_bundle(
                    bundle_id=args.bundle_id,
                    status=args.status,
                    workspace_root=workspace_root,
                    config=config,
                )
                print(outcome.message)
                return 0 if outcome.ok else 1
            if args.update_bundle_command == "export":
                outcome = export_update_bundle(
                    bundle_id=args.bundle_id,
                    output=args.output,
                    workspace_root=workspace_root,
                    config=config,
                    include_patch=args.include_patch,
                )
                print(outcome.message)
                return 0 if outcome.ok else 1
        except (StaffError, UpdateBundleError) as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print("error: unknown update-bundle command", file=sys.stderr)
        return 1

    if args.command == "research":
        if not args.url:
            print("error: research requires --url in RealForge 0.9", file=sys.stderr)
            return 1
        if not args.allow_domain:
            print("error: research requires --allow-domain", file=sys.stderr)
            return 1
        try:
            outcome = run_research_fetch(
                url=args.url,
                allow_domain=args.allow_domain,
                workspace_root=config.workspace_root or Path.cwd(),
                query=args.query,
                opener=default_http_opener(),
            )
        except ResearchError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        print(outcome.message)
        return 0

    if args.command == "research-list":
        print(list_research(config.workspace_root or Path.cwd()))
        return 0

    if args.command == "research-show":
        try:
            print(show_research(config.workspace_root or Path.cwd(), args.research_id))
        except FileNotFoundError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        return 0

    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
