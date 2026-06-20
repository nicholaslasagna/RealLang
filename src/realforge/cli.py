from __future__ import annotations

import argparse
import sys
from pathlib import Path

from realforge.agent_loop import AgentMode, check_file, repair_file, run_agent
from realforge.config import load_config
from realforge.config_file import ConfigFileError
from realforge.doctor import format_doctor_report, run_doctor
from realforge.generation import run_generate
from realforge.index.context_builder import build_context
from realforge.index.file_index import format_index_report, scan_workspace, write_index_cache
from realforge.index.symbols import format_symbol_table, scan_workspace_symbols
from realforge.permissions import PermissionMode, Permissions
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
    format_list_proposals,
    list_proposals,
    propose_merge_from_report,
    show_proposal,
)
from realforge.proposal_report import format_propose_merge_outcome, format_proposal_summary
from realforge.research import ResearchError, default_http_opener, list_research, run_research_fetch, show_research


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
            help="permission mode for planning (default: readonly)",
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="realforge",
        description="RealForge — local-first coding agent platform built for RealLang",
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

    args = parser.parse_args(argv)

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
    }:
        config = load_config()
    elif args.command in {"propose-merge", "apply-proposal", "research"}:
        config = _load_cli_config(args)
    else:
        config = _load_cli_config(args)

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
