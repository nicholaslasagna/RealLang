from __future__ import annotations

import argparse
import sys
from pathlib import Path

from realforge.agent_loop import AgentMode, check_file, repair_file, run_agent
from realforge.config import load_config
from realforge.config_file import ConfigFileError
from realforge.doctor import format_doctor_report, run_doctor
from realforge.generation import run_generate
from realforge.permissions import PermissionMode, Permissions
from realforge.providers import resolve_provider
from realforge.report import format_check_fail, format_check_pass


def _add_model_args(parser: argparse.ArgumentParser) -> None:
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
    _add_model_args(ask)

    plan = sub.add_parser("plan", help="build a structured plan from the configured local model provider")
    _add_model_args(plan)

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

    args = parser.parse_args(argv)

    if args.command in {"check", "repair", "doctor"}:
        config = load_config()
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
        outcome = run_agent(
            task=args.task,
            provider=provider,
            mode=AgentMode.PLAN_ONLY,
            config=config,
        )
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

    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
