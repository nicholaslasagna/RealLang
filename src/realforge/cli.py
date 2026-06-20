from __future__ import annotations

import argparse
import sys
from pathlib import Path

from realforge.agent_loop import AgentMode, check_file, repair_file, run_agent
from realforge.config import RealForgeConfig, default_config
from realforge.doctor import format_doctor_report, run_doctor
from realforge.permissions import PermissionMode, Permissions
from realforge.providers import get_provider
from realforge.report import format_check_fail, format_check_pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="realforge",
        description="RealForge — local-first coding-agent platform for RealLang",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser("check", help="run realc --check and summarize diagnostics")
    check.add_argument("file", type=Path, help="RealLang source file (.real)")

    repair = sub.add_parser("repair", help="rule-based repair from realc diagnostics")
    repair.add_argument("file", type=Path, help="RealLang source file (.real)")
    mode = repair.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="show diff without writing")
    mode.add_argument("--apply", action="store_true", help="apply safe repairs with backup")

    ask = sub.add_parser("ask", help="request a plan from a local model provider (plan-only)")
    ask.add_argument("--provider", default="mock", help="provider name (default: mock)")
    ask.add_argument("--task", required=True, help="task description for the agent")

    sub.add_parser("doctor", help="check RealForge environment and optional local model settings")

    args = parser.parse_args(argv)
    config = default_config()

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
            explicit_apply=args.apply,
        )
        stream = sys.stdout if outcome.ok or args.dry_run else sys.stderr
        print(outcome.message, file=stream)
        return 0 if outcome.ok else 1

    if args.command == "ask":
        try:
            provider = get_provider(args.provider, config)
        except ValueError as err:
            print(f"error: {err}", file=sys.stderr)
            return 1
        outcome = run_agent(
            task=args.task,
            provider=provider,
            mode=AgentMode.PLAN_ONLY,
            config=config,
        )
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
